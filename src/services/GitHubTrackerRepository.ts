import { TrackerRepository } from './TrackerRepository';
import {
  Multiview,
  MultiviewOutput,
  Destination,
  Source,
  OperationalAssignment,
  ChangeRecord,
  ValidationFinding,
  TrackerSnapshot,
  TrackerSnapshotMetadata,
  ChangeSet,
} from '../domain/models';
import { Operator } from '../domain/operator';
import { changeSetToChangeRecords } from '../domain/diff';
import { validateSnapshot } from '../domain/validation';
import {
  LayoutDefinition,
  setCustomLayoutRegistry,
  getLayoutDefinition,
} from '../domain/layoutDefinitions';
import { normalizeOutputPipAssignments } from '../domain/pipRouting';
import {
  GitHubClient,
  GitHubClientOptions,
  GitHubRepositoryConfig,
  GitHubFilePayload,
} from './githubClient';
import { GitHubTrackerRepositoryError } from './githubErrors';

export interface GitHubTrackerRepositoryOptions extends GitHubClientOptions {
  isReadOnly?: boolean;
}

export interface GitHubSnapshotLoadResult {
  snapshot: TrackerSnapshot;
  sha: string;
  branch: string;
  path: string;
}

/**
 * Conflict-safe TrackerRepository implementation that loads and updates authoritative
 * tracker snapshots in private GitHub repositories via optimistic concurrency based on file SHA.
 */
export class GitHubTrackerRepository implements TrackerRepository {
  readonly isReadOnly: boolean;
  private client: GitHubClient;
  private cachedSnapshot: TrackerSnapshot | null = null;
  private lastLoadedSha: string | null = null;
  private revisionGeneration = 0;

  constructor(options: GitHubTrackerRepositoryOptions = {}) {
    this.client = new GitHubClient(options);
    this.isReadOnly = options.isReadOnly ?? false;
  }

  get config(): GitHubRepositoryConfig {
    return this.client.config;
  }

  /**
   * Returns the GitHub blob SHA of the last successfully loaded tracker file.
   */
  getLastLoadedSha(): string | null {
    return this.lastLoadedSha;
  }

  /**
   * Refreshes the tracker file from GitHub, bypassing any cached snapshot and updating lastLoadedSha.
   */
  async refreshSnapshot(): Promise<TrackerSnapshot> {
    const res = await this.loadSnapshot();
    return res.snapshot;
  }

  /**
   * Checks GitHub for remote revisions.
   * Compares the remote file SHA against lastLoadedSha.
   * If unchanged, returns hasUpdate: false without reparsing or mutating state.
   */
  async checkForRemoteUpdate(): Promise<{
    hasUpdate: boolean;
    sha: string;
    snapshot: TrackerSnapshot;
  }> {
    const requestedSha = this.lastLoadedSha;
    const startGeneration = this.revisionGeneration;

    const payload = await this.client.fetchFileContents();

    // Freshness guard: If a local save or snapshot update occurred while this fetch was in flight,
    // this response represents state requested prior to that mutation.
    if (
      this.revisionGeneration !== startGeneration ||
      (requestedSha && payload.sha === requestedSha)
    ) {
      return {
        hasUpdate: false,
        sha: this.lastLoadedSha ?? payload.sha,
        snapshot: this.cachedSnapshot ?? this.parseAndValidatePayload(payload),
      };
    }

    const hasUpdate = Boolean(this.lastLoadedSha && payload.sha !== this.lastLoadedSha);
    if (!hasUpdate && this.cachedSnapshot) {
      return {
        hasUpdate: false,
        sha: payload.sha,
        snapshot: this.cachedSnapshot,
      };
    }

    const snapshot = this.parseAndValidatePayload(payload);
    return {
      hasUpdate,
      sha: payload.sha,
      snapshot,
    };
  }

  /**
   * Applies an externally received snapshot and updates lastLoadedSha and cachedSnapshot.
   */
  applyLoadedSnapshot(snapshot: TrackerSnapshot, sha: string): void {
    this.revisionGeneration++;
    this.cachedSnapshot = snapshot;
    this.lastLoadedSha = sha;
    const customLayouts = snapshot.customLayouts ?? [];
    setCustomLayoutRegistry(customLayouts);
  }

  /**
   * Fetches, validates, and decodes the tracker file from GitHub.
   */
  async loadSnapshot(): Promise<GitHubSnapshotLoadResult> {
    const payload = await this.client.fetchFileContents();
    const snapshot = this.parseAndValidatePayload(payload);

    this.revisionGeneration++;
    this.cachedSnapshot = snapshot;
    this.lastLoadedSha = payload.sha;

    const customLayouts = snapshot.customLayouts ?? [];
    setCustomLayoutRegistry(customLayouts);

    return {
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      sha: payload.sha,
      branch: payload.branch,
      path: payload.path,
    };
  }

  private parseAndValidatePayload(payload: GitHubFilePayload): TrackerSnapshot {
    let raw: unknown;
    try {
      raw = JSON.parse(payload.decodedContent);
    } catch (parseErr) {
      throw new GitHubTrackerRepositoryError(
        `Failed to parse tracker JSON from GitHub: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        {
          code: 'INVALID_JSON',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
          cause: parseErr,
        }
      );
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new GitHubTrackerRepositoryError(
        'Incompatible tracker schema: root payload must be an object.',
        {
          code: 'INCOMPATIBLE_SCHEMA',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    const data = raw as Record<string, unknown>;

    // 1. Required collection checks
    const requiredArrays = [
      'multiviews',
      'outputs',
      'destinations',
      'sources',
      'operationalAssignments',
    ];

    for (const key of requiredArrays) {
      if (!Array.isArray(data[key])) {
        throw new GitHubTrackerRepositoryError(
          `Incompatible tracker schema: missing required array collection "${key}".`,
          {
            code: 'INCOMPATIBLE_SCHEMA',
            owner: this.config.owner,
            repo: this.config.repo,
            path: this.config.path,
            branch: this.config.branch,
          }
        );
      }
    }

    // 2. Validate metadata if present
    if (data.metadata !== undefined && data.metadata !== null) {
      if (typeof data.metadata !== 'object' || Array.isArray(data.metadata)) {
        throw new GitHubTrackerRepositoryError(
          'Incompatible tracker schema: metadata must be an object.',
          {
            code: 'INCOMPATIBLE_SCHEMA',
            owner: this.config.owner,
            repo: this.config.repo,
            path: this.config.path,
            branch: this.config.branch,
          }
        );
      }
      const meta = data.metadata as Record<string, unknown>;
      if (
        typeof meta.schemaVersion !== 'number' ||
        typeof meta.sourceWorkbook !== 'string' ||
        typeof meta.sourceWorkbookHash !== 'string' ||
        typeof meta.generatorVersion !== 'string'
      ) {
        throw new GitHubTrackerRepositoryError(
          'Incompatible tracker schema: metadata missing required fields (schemaVersion, sourceWorkbook, sourceWorkbookHash, generatorVersion).',
          {
            code: 'INCOMPATIBLE_SCHEMA',
            owner: this.config.owner,
            repo: this.config.repo,
            path: this.config.path,
            branch: this.config.branch,
          }
        );
      }
    }

    // 3. Entity identifier uniqueness
    const checkUniqueIds = (items: unknown[], collectionName: string): void => {
      const seen = new Set<string>();
      for (const item of items) {
        if (!item || typeof item !== 'object') {
          throw new GitHubTrackerRepositoryError(
            `Incompatible tracker schema: item in ${collectionName} is not an object.`,
            {
              code: 'INCOMPATIBLE_SCHEMA',
              owner: this.config.owner,
              repo: this.config.repo,
              path: this.config.path,
              branch: this.config.branch,
            }
          );
        }
        const id = (item as { id?: unknown }).id;
        if (typeof id !== 'string' || !id.trim()) {
          throw new GitHubTrackerRepositoryError(
            `Incompatible tracker schema: item in ${collectionName} missing valid string id.`,
            {
              code: 'INCOMPATIBLE_SCHEMA',
              owner: this.config.owner,
              repo: this.config.repo,
              path: this.config.path,
              branch: this.config.branch,
            }
          );
        }
        if (seen.has(id)) {
          throw new GitHubTrackerRepositoryError(
            `Duplicate entity ID "${id}" detected in collection "${collectionName}".`,
            {
              code: 'VALIDATION_FAILURE',
              owner: this.config.owner,
              repo: this.config.repo,
              path: this.config.path,
              branch: this.config.branch,
            }
          );
        }
        seen.add(id);
      }
    };

    checkUniqueIds(data.multiviews as unknown[], 'multiviews');
    checkUniqueIds(data.outputs as unknown[], 'outputs');
    checkUniqueIds(data.destinations as unknown[], 'destinations');
    checkUniqueIds(data.sources as unknown[], 'sources');
    checkUniqueIds(data.operationalAssignments as unknown[], 'operationalAssignments');

    // 4. Reference resolution: non-null assignedSourceId must resolve to a known source
    const sources = data.sources as Source[];
    const sourceIdSet = new Set<string>(sources.map((s) => s.id));
    const destinations = data.destinations as Destination[];

    for (const dest of destinations) {
      if (dest.assignedSourceId !== null && dest.assignedSourceId !== undefined) {
        if (!sourceIdSet.has(dest.assignedSourceId)) {
          throw new GitHubTrackerRepositoryError(
            `Destination "${dest.id}" references unresolvable source ID "${dest.assignedSourceId}".`,
            {
              code: 'VALIDATION_FAILURE',
              owner: this.config.owner,
              repo: this.config.repo,
              path: this.config.path,
              branch: this.config.branch,
            }
          );
        }
      }
    }

    const customLayouts = Array.isArray(data.customLayouts)
      ? (data.customLayouts as LayoutDefinition[])
      : [];

    const rawOutputs = data.outputs as MultiviewOutput[];
    const normalizedOutputs = rawOutputs.map((out) => {
      if (out.pipAssignments) return out;
      const layout = getLayoutDefinition(out.layoutName, customLayouts);
      return {
        ...out,
        pipAssignments: normalizeOutputPipAssignments(out, layout),
      };
    });

    const multiviews = data.multiviews as Multiview[];
    const validationFindings = validateSnapshot(
      multiviews,
      normalizedOutputs,
      destinations,
      sources
    );

    const snapshot: TrackerSnapshot = {
      multiviews,
      outputs: normalizedOutputs,
      destinations,
      sources,
      operationalAssignments: data.operationalAssignments as OperationalAssignment[],
      changeRecords: Array.isArray(data.changeRecords)
        ? (data.changeRecords as ChangeRecord[])
        : [],
      validationFindings,
      generatedAt:
        typeof data.generatedAt === 'string' ? data.generatedAt : new Date().toISOString(),
      customLayouts,
      ...(data.metadata ? { metadata: data.metadata as TrackerSnapshotMetadata } : {}),
    };

    return snapshot;
  }

  async getSnapshot(): Promise<TrackerSnapshot> {
    if (!this.cachedSnapshot) {
      await this.loadSnapshot();
    }
    return JSON.parse(JSON.stringify(this.cachedSnapshot!));
  }

  async getMultiviews(): Promise<Multiview[]> {
    const snap = await this.getSnapshot();
    return snap.multiviews;
  }

  async getOutputs(): Promise<MultiviewOutput[]> {
    const snap = await this.getSnapshot();
    return snap.outputs;
  }

  async getDestinations(): Promise<Destination[]> {
    const snap = await this.getSnapshot();
    return snap.destinations;
  }

  async getSources(): Promise<Source[]> {
    const snap = await this.getSnapshot();
    return snap.sources;
  }

  async getOperationalAssignments(): Promise<OperationalAssignment[]> {
    const snap = await this.getSnapshot();
    return snap.operationalAssignments;
  }

  async getChangeHistory(): Promise<ChangeRecord[]> {
    const snap = await this.getSnapshot();
    return snap.changeRecords;
  }

  async getValidationFindings(): Promise<ValidationFinding[]> {
    const snap = await this.getSnapshot();
    return snap.validationFindings;
  }

  private validatePreWriteIntegrity(snapshot: TrackerSnapshot): void {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new GitHubTrackerRepositoryError('Invalid snapshot: payload must be an object.', {
        code: 'VALIDATION_FAILURE',
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      });
    }

    const requiredArrays = [
      'multiviews',
      'outputs',
      'destinations',
      'sources',
      'operationalAssignments',
    ];

    for (const key of requiredArrays) {
      if (!Array.isArray((snapshot as unknown as Record<string, unknown>)[key])) {
        throw new GitHubTrackerRepositoryError(
          `Invalid snapshot: missing required collection "${key}".`,
          {
            code: 'VALIDATION_FAILURE',
            owner: this.config.owner,
            repo: this.config.repo,
            path: this.config.path,
            branch: this.config.branch,
          }
        );
      }
    }

    const checkUniqueIds = (items: { id: string }[], name: string) => {
      const seen = new Set<string>();
      for (const item of items) {
        if (!item || typeof item.id !== 'string' || !item.id.trim()) {
          throw new GitHubTrackerRepositoryError(`Item in ${name} missing string id.`, {
            code: 'VALIDATION_FAILURE',
            owner: this.config.owner,
            repo: this.config.repo,
            path: this.config.path,
            branch: this.config.branch,
          });
        }
        if (seen.has(item.id)) {
          throw new GitHubTrackerRepositoryError(`Duplicate ID "${item.id}" in ${name}.`, {
            code: 'VALIDATION_FAILURE',
            owner: this.config.owner,
            repo: this.config.repo,
            path: this.config.path,
            branch: this.config.branch,
          });
        }
        seen.add(item.id);
      }
    };

    checkUniqueIds(snapshot.multiviews, 'multiviews');
    checkUniqueIds(snapshot.outputs, 'outputs');
    checkUniqueIds(snapshot.destinations, 'destinations');
    checkUniqueIds(snapshot.sources, 'sources');
    checkUniqueIds(snapshot.operationalAssignments, 'operationalAssignments');

    const sourceIds = new Set(snapshot.sources.map((s) => s.id));
    for (const dest of snapshot.destinations) {
      if (dest.assignedSourceId !== null && dest.assignedSourceId !== undefined) {
        if (!sourceIds.has(dest.assignedSourceId)) {
          throw new GitHubTrackerRepositoryError(
            `Destination "${dest.id}" references unresolvable source ID "${dest.assignedSourceId}".`,
            {
              code: 'VALIDATION_FAILURE',
              owner: this.config.owner,
              repo: this.config.repo,
              path: this.config.path,
              branch: this.config.branch,
            }
          );
        }
      }
    }
  }

  async saveSnapshot(
    updatedSnapshot: TrackerSnapshot,
    changeSet?: ChangeSet,
    operator?: Operator | null
  ): Promise<TrackerSnapshot> {
    if (this.isReadOnly) {
      throw new GitHubTrackerRepositoryError(
        'Mutation operation "saveSnapshot" is not supported by read-only GitHubTrackerRepository.',
        {
          code: 'READ_ONLY_OPERATION',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    if (!this.lastLoadedSha) {
      throw new GitHubTrackerRepositoryError(
        'Cannot save tracker snapshot: no initial revision SHA loaded from GitHub.',
        {
          code: 'VALIDATION_FAILURE',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    const cloned: TrackerSnapshot = JSON.parse(JSON.stringify(updatedSnapshot));

    if (changeSet && changeSet.changes.length > 0) {
      const newRecords = changeSetToChangeRecords(changeSet, operator);
      cloned.changeRecords = [...(cloned.changeRecords ?? []), ...newRecords];

      if (operator) {
        const affectedOutputIds = new Set<string>();
        const affectedDestinationIds = new Set<string>();

        for (const change of changeSet.changes) {
          if (change.entityType === 'output') {
            affectedOutputIds.add(change.entityId);
          } else if (change.entityType === 'destination') {
            affectedDestinationIds.add(change.entityId);
          }
        }

        if (affectedOutputIds.size > 0) {
          cloned.outputs = cloned.outputs.map((out) => {
            if (affectedOutputIds.has(out.id)) {
              return {
                ...out,
                updatedAt: changeSet.timestamp,
                updatedBy: operator.displayName,
                operatorId: operator.id,
              };
            }
            return out;
          });
        }

        if (affectedDestinationIds.size > 0) {
          cloned.destinations = cloned.destinations.map((dest) => {
            if (affectedDestinationIds.has(dest.id)) {
              return {
                ...dest,
                updatedAt: changeSet.timestamp,
                updatedBy: operator.displayName,
                operatorId: operator.id,
              };
            }
            return dest;
          });
        }
      }
    }

    cloned.validationFindings = validateSnapshot(
      cloned.multiviews,
      cloned.outputs,
      cloned.destinations,
      cloned.sources
    );

    cloned.generatedAt = new Date().toISOString();

    this.validatePreWriteIntegrity(cloned);

    const operatorName = operator?.displayName?.trim() || 'Operator';
    const commitMessage = `VIP Tracker update by ${operatorName}`;

    const serialized = JSON.stringify(cloned, null, 2) + '\n';

    const result = await this.client.updateFileContents({
      content: serialized,
      expectedSha: this.lastLoadedSha,
      commitMessage,
    });

    this.revisionGeneration++;
    this.lastLoadedSha = result.newSha;
    this.cachedSnapshot = cloned;

    const customLayouts = cloned.customLayouts ?? [];
    setCustomLayoutRegistry(customLayouts);

    return JSON.parse(JSON.stringify(cloned));
  }

  async resetToBaseline(): Promise<TrackerSnapshot> {
    throw new GitHubTrackerRepositoryError(
      'Mutation operation "resetToBaseline" is not supported by shared GitHubTrackerRepository.',
      {
        code: 'READ_ONLY_OPERATION',
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      }
    );
  }

  async saveCustomLayout(layout: LayoutDefinition): Promise<TrackerSnapshot> {
    const current = await this.getSnapshot();
    const customList = [...(current.customLayouts ?? [])];
    const idx = customList.findIndex(
      (l) => l.id === layout.id || l.name.toUpperCase() === layout.name.toUpperCase()
    );
    if (idx >= 0) {
      customList[idx] = layout;
    } else {
      customList.push(layout);
    }
    const nextSnapshot: TrackerSnapshot = {
      ...current,
      customLayouts: customList,
    };
    return this.saveSnapshot(nextSnapshot);
  }

  async deleteCustomLayout(layoutId: string): Promise<TrackerSnapshot> {
    const current = await this.getSnapshot();
    const customList = (current.customLayouts ?? []).filter((l) => l.id !== layoutId);
    const nextSnapshot: TrackerSnapshot = {
      ...current,
      customLayouts: customList,
    };
    return this.saveSnapshot(nextSnapshot);
  }
}
