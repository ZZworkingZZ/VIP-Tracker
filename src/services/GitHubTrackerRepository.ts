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
} from '../domain/models';
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

export type GitHubTrackerRepositoryOptions = GitHubClientOptions;

export interface GitHubSnapshotLoadResult {
  snapshot: TrackerSnapshot;
  sha: string;
  branch: string;
  path: string;
}

/**
 * Read-only TrackerRepository implementation that loads authoritative tracker snapshots
 * from private GitHub repositories via injected authenticated requests.
 */
export class GitHubTrackerRepository implements TrackerRepository {
  readonly isReadOnly = true;
  private client: GitHubClient;
  private cachedSnapshot: TrackerSnapshot | null = null;
  private lastLoadedSha: string | null = null;

  constructor(options: GitHubTrackerRepositoryOptions = {}) {
    this.client = new GitHubClient(options);
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
   * Fetches, validates, and decodes the tracker file from GitHub.
   */
  async loadSnapshot(): Promise<GitHubSnapshotLoadResult> {
    const payload = await this.client.fetchFileContents();
    const snapshot = this.parseAndValidatePayload(payload);

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

  // --- Read-Only Mutation Guards ---

  async saveSnapshot(
    _snapshot?: TrackerSnapshot,
    _changeSet?: import('../domain/models').ChangeSet,
    _operator?: import('../domain/operator').Operator | null
  ): Promise<TrackerSnapshot> {
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

  async resetToBaseline(): Promise<TrackerSnapshot> {
    throw new GitHubTrackerRepositoryError(
      'Mutation operation "resetToBaseline" is not supported by read-only GitHubTrackerRepository.',
      {
        code: 'READ_ONLY_OPERATION',
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      }
    );
  }

  async saveCustomLayout(
    _layout?: import('../domain/layoutDefinitions').LayoutDefinition
  ): Promise<TrackerSnapshot> {
    throw new GitHubTrackerRepositoryError(
      'Mutation operation "saveCustomLayout" is not supported by read-only GitHubTrackerRepository.',
      {
        code: 'READ_ONLY_OPERATION',
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      }
    );
  }

  async deleteCustomLayout(_layoutId?: string): Promise<TrackerSnapshot> {
    throw new GitHubTrackerRepositoryError(
      'Mutation operation "deleteCustomLayout" is not supported by read-only GitHubTrackerRepository.',
      {
        code: 'READ_ONLY_OPERATION',
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      }
    );
  }
}
