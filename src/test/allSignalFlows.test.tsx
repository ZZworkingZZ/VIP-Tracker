import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/renderWithProviders';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { MemoryTrackerStorage } from '../services/storage';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { createDirectorySource } from '../data/seed/lawoDirectory';
import type { TrackerSnapshot } from '../domain/models';
import { DestinationId, OutputId, PipId, SourceId } from '../domain/identifiers';
import {
  applyTielineLawoSourceChange,
  filterTielineFlows,
  naturalCompare,
  resolveAllTielineFlows,
  sortTielineFlows,
} from '../domain/allSignalFlows';
import { applyPipMvInputStageChange, resolveAllPipSignalFlows } from '../domain/signalFlow';

const OUT_ID = 'OUT:MV-03-01' as OutputId;
const PIP_01 = 'PIP-01' as PipId;
const USED_DEST = 'DEST:MV-03-01' as DestinationId; // tieline A, used by a PIP
const UNUSED_DEST = 'DEST:MV-01-12' as DestinationId; // tieline B, no PIP uses it

const lawoA = createDirectorySource({
  name: 'Test Origin A',
  alias: 'Origin Alias A',
  category: 'Other',
  routeRole: 'lawo_source',
});
const lawoB = createDirectorySource({
  name: 'Test Origin B',
  alias: 'Origin Alias B',
  category: 'Other',
  routeRole: 'lawo_source',
});
const stage = createDirectorySource({ name: 'UDX-77', routeRole: 'processing', category: 'Other' });

function tieline(name: string, upstream: SourceId | null, alias?: string) {
  return createDirectorySource({
    name,
    alias,
    category: 'Virtual Tie',
    routeRole: 'tieline',
    upstreamSourceId: upstream,
  });
}

const tielineA = tieline('vTie 107', lawoA.id, 'TAG FS');
const tielineB = tieline('vIngest 03', lawoA.id);
const tielineC = tieline('vTie 10', lawoA.id); // no MV input
const tielineTwo = tieline('vTie 2', null);
const tielineThree = tieline('vTie 3', null);
// Two tielines sharing one processing stage
const sharedX = tieline('vShare X', stage.id);
const sharedY = tieline('vShare Y', stage.id);
const stageWithUpstream = { ...stage, upstreamSourceId: lawoA.id };
// A tieline whose processing stage is used by no other tieline
const stageSolo = createDirectorySource({
  name: 'UDX-78',
  routeRole: 'processing',
  category: 'Other',
  upstreamSourceId: lawoA.id,
});
const soloTieline = tieline('vSolo', stageSolo.id);

const fixtureSources = [
  lawoA,
  lawoB,
  stageWithUpstream,
  tielineA,
  tielineB,
  tielineC,
  tielineTwo,
  tielineThree,
  sharedX,
  sharedY,
  stageSolo,
  soloTieline,
];

function createFixture(): TrackerSnapshot {
  const base: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
  const withSources: TrackerSnapshot = {
    ...base,
    sources: [
      ...base.sources.filter((s) => !fixtureSources.some((f) => f.id === s.id)),
      lawoA,
      lawoB,
      stageWithUpstream,
      tielineA,
      tielineB,
      tielineC,
      tielineTwo,
      tielineThree,
      sharedX,
      sharedY,
      stageSolo,
      soloTieline,
    ],
    destinations: base.destinations.map((d) =>
      d.id === USED_DEST
        ? { ...d, assignedSourceId: tielineA.id }
        : d.id === UNUSED_DEST
          ? { ...d, assignedSourceId: tielineB.id }
          : d
    ),
  };
  return applyPipMvInputStageChange(withSources, OUT_ID, PIP_01, USED_DEST);
}

const operator = { id: 'op_zach_z', displayName: 'Zach Z' };
const rowFor = (snapshot: TrackerSnapshot, id: SourceId) =>
  resolveAllTielineFlows(snapshot).find((r) => r.tielineId === id)!;

describe('All Signal Flows — domain', () => {
  it('classifies PIP visibility, unused MV input and no MV input separately', () => {
    const s = createFixture();
    expect(rowFor(s, tielineA.id).usageState).toBe('pip-visible');
    expect(rowFor(s, tielineB.id).usageState).toBe('mv-input-unused');
    expect(rowFor(s, tielineB.id).mvInputs.map((m) => m.destinationId)).toEqual([UNUSED_DEST]);
    expect(rowFor(s, tielineB.id).pipUses).toHaveLength(0);
    expect(rowFor(s, tielineC.id).usageState).toBe('no-mv-input');
    expect(rowFor(s, tielineC.id).mvInputs).toHaveLength(0);
    // The MV-focused view still lists tieline A's PIP, and never tieline B's input.
    const pipFlows = resolveAllPipSignalFlows(s);
    expect(pipFlows.some((f) => f.tielineId === tielineA.id)).toBe(true);
    expect(pipFlows.some((f) => f.tielineId === tielineB.id)).toBe(false);
  });

  it('flags unresolved flows (no Lawo source) independently of usage state', () => {
    const s = createFixture();
    const row = rowFor(s, tielineTwo.id);
    expect(row.isUnresolved).toBe(true);
    expect(row.usageState).toBe('no-mv-input');
    expect(rowFor(s, tielineA.id).isUnresolved).toBe(false);
  });

  it('filters by usage state with exact membership', () => {
    const rows = resolveAllTielineFlows(createFixture());
    const ids = (usage: Parameters<typeof filterTielineFlows>[1]['usage']) =>
      filterTielineFlows(rows, { usage })
        .map((r) => r.tielineId)
        .sort();
    expect(ids('pip-visible')).toEqual([tielineA.id]);
    expect(ids('mv-input-unused')).toEqual([tielineB.id]);
    const noMv = ids('no-mv-input');
    expect(noMv).toContain(tielineC.id);
    expect(noMv).not.toContain(tielineA.id);
    expect(noMv).not.toContain(tielineB.id);
    const unresolved = ids('unresolved');
    expect(unresolved).toContain(tielineTwo.id);
    expect(unresolved).not.toContain(tielineA.id);
    expect(ids('ALL')).toHaveLength(rows.length);
  });

  it('searches by tieline name, tieline alias, Lawo source name and alias', () => {
    const rows = resolveAllTielineFlows(createFixture());
    const find = (query: string) => filterTielineFlows(rows, { query }).map((r) => r.tielineId);
    expect(find('vIngest 03')).toEqual([tielineB.id]);
    expect(find('vingest03')).toEqual([tielineB.id]);
    expect(find('TAG FS')).toEqual([tielineA.id]);
    expect(find('Test Origin A')).toEqual(expect.arrayContaining([tielineA.id, tielineB.id]));
    expect(find('Test Origin A')).not.toContain(tielineTwo.id);
    expect(find('Origin Alias A')).toEqual(expect.arrayContaining([tielineA.id, tielineB.id]));
    expect(find('MV-01-12')).toEqual([tielineB.id]);
  });

  it('sorts naturally and by source and usage state', () => {
    expect(['vTie 107', 'vTie 10', 'vTie 3', 'vTie 2'].sort(naturalCompare)).toEqual([
      'vTie 2',
      'vTie 3',
      'vTie 10',
      'vTie 107',
    ]);
    const rows = resolveAllTielineFlows(createFixture());
    const vTies = (dir: 'asc' | 'desc') =>
      sortTielineFlows(filterTielineFlows(rows, { query: 'vTie' }), 'tieline', dir)
        .map((r) => r.tieline.name)
        .filter((n) => ['vTie 2', 'vTie 3', 'vTie 10', 'vTie 107'].includes(n));
    expect(vTies('asc')).toEqual(['vTie 2', 'vTie 3', 'vTie 10', 'vTie 107']);
    expect(vTies('desc')).toEqual(['vTie 107', 'vTie 10', 'vTie 3', 'vTie 2']);

    const byUsage = sortTielineFlows(rows, 'usage').map((r) => r.usageState);
    expect(byUsage.indexOf('pip-visible')).toBeLessThan(byUsage.indexOf('mv-input-unused'));
    expect(byUsage.indexOf('mv-input-unused')).toBeLessThan(byUsage.indexOf('no-mv-input'));

    const bySource = sortTielineFlows(rows, 'source');
    expect(bySource[bySource.length - 1].lawoSource).toBeNull();
  });
});

describe('All Signal Flows — route change safety (vIngest 03 condition)', () => {
  it('changes only the unused-MV-input tieline and touches no MV, PIP, output or layout data', () => {
    const before = createFixture();
    const snapshotCopy = JSON.parse(JSON.stringify(before));
    const after = applyTielineLawoSourceChange(
      before,
      tielineB.id,
      lawoB.id,
      operator,
      '2026-11-06T12:00:00Z'
    );

    expect(before).toEqual(snapshotCopy); // input not mutated
    expect(rowFor(after, tielineB.id).lawoSource?.id).toBe(lawoB.id);
    expect(rowFor(after, tielineA.id).lawoSource?.id).toBe(lawoA.id);
    expect(rowFor(after, tielineB.id).usageState).toBe('mv-input-unused');
    expect(rowFor(after, tielineB.id).mvInputs.map((m) => m.destinationId)).toEqual([UNUSED_DEST]);

    expect(after.outputs).toEqual(before.outputs);
    expect(after.destinations).toEqual(before.destinations);
    expect(after.customLayouts).toEqual(before.customLayouts);
    expect(after.signalFlowLocks).toEqual(before.signalFlowLocks);
    expect(after.outputs.find((o) => o.id === OUT_ID)?.pipAssignments?.[PIP_01]).toBe(USED_DEST);

    const changed = after.sources.filter(
      (s, i) => JSON.stringify(s) !== JSON.stringify(before.sources[i])
    );
    expect(changed.map((s) => s.id)).toEqual([tielineB.id]);
    expect(changed[0].operatorId).toBe(operator.id);
  });

  it('changes a tieline with no MV input without creating any MV assignment', () => {
    const before = createFixture();
    const after = applyTielineLawoSourceChange(before, tielineC.id, lawoB.id, operator);
    expect(rowFor(after, tielineC.id).lawoSource?.id).toBe(lawoB.id);
    expect(rowFor(after, tielineC.id).usageState).toBe('no-mv-input');
    expect(after.destinations).toEqual(before.destinations);
    expect(after.outputs).toEqual(before.outputs);
  });

  it('fails safely for unknown tieline or source ids', () => {
    const before = createFixture();
    const copy = JSON.parse(JSON.stringify(before));
    expect(() =>
      applyTielineLawoSourceChange(before, 'SRC:NOPE' as SourceId, lawoB.id, operator)
    ).toThrow(/not found/);
    expect(() =>
      applyTielineLawoSourceChange(before, tielineB.id, 'SRC:NOPE' as SourceId, operator)
    ).toThrow(/not found/);
    // A non-tieline source is not a valid target
    expect(() => applyTielineLawoSourceChange(before, lawoA.id, lawoB.id, operator)).toThrow(
      /not found/
    );
    expect(before).toEqual(copy);
  });

  it('rejects a cyclic route', () => {
    const before = createFixture();
    // Making Origin A's upstream chain include tielineB then routing tielineB from A would loop
    const looped: TrackerSnapshot = {
      ...before,
      sources: before.sources.map((s) =>
        s.id === lawoA.id ? { ...s, upstreamSourceId: tielineB.id } : s
      ),
    };
    expect(() => applyTielineLawoSourceChange(looped, tielineB.id, lawoA.id, operator)).toThrow(
      /circular/i
    );
  });

  it('warns about other tielines that share the first processing stage', () => {
    const s = createFixture();
    expect(rowFor(s, sharedX.id).affectedOtherTielines.map((t) => t.id)).toEqual([sharedY.id]);
    expect(rowFor(s, tielineA.id).affectedOtherTielines).toHaveLength(0);
    // Editing sharedX rewrites the shared stage; sharedY follows (this is what the warning discloses)
    const after = applyTielineLawoSourceChange(s, sharedX.id, lawoB.id, operator);
    expect(rowFor(after, sharedY.id).lawoSource?.id).toBe(lawoB.id);
  });
});

describe('All Signal Flows — persistence', () => {
  it('persists through LocalTrackerRepository save and reload, with history and attribution', async () => {
    const storage = new MemoryTrackerStorage();
    const base = createFixture();
    const repo = new LocalTrackerRepository(base, storage);
    const loaded = await repo.getSnapshot();
    const next = applyTielineLawoSourceChange(
      loaded,
      tielineB.id,
      lawoB.id,
      operator,
      '2026-11-06T12:00:00Z'
    );
    const { createChangeSet } = await import('../domain/diff');
    await repo.saveSnapshot(next, createChangeSet(loaded, next), operator);

    const reloaded = await new LocalTrackerRepository(base, storage).getSnapshot();
    expect(rowFor(reloaded, tielineB.id).lawoSource?.id).toBe(lawoB.id);
    expect(rowFor(reloaded, tielineA.id).lawoSource?.id).toBe(lawoA.id);
    expect(rowFor(reloaded, tielineB.id).mvInputs.map((m) => m.destinationId)).toEqual([
      UNUSED_DEST,
    ]);

    const record = reloaded.changeRecords.find(
      (c) => c.entityId === tielineB.id && c.field === 'upstreamSourceId'
    );
    expect(record).toBeDefined();
    expect(record?.previousValue).toBe(lawoA.name);
    expect(record?.newValue).toBe(lawoB.name);
    expect(record?.operatorId).toBe(operator.id);
    expect(record?.changedAt).toBeTruthy();
    const historyEntry = (reloaded.history ?? []).find((h) => h.entityId === tielineB.name);
    expect(historyEntry).toBeDefined();
    expect(historyEntry?.operator).toBe(operator.displayName);
    expect(historyEntry?.summary).toContain(lawoB.name);
    expect(historyEntry?.timestamp).toBeTruthy();
  });

  it('persists through GitHubTrackerRepository save (SHA-guarded) and reload', async () => {
    const base = createFixture();
    let remote = JSON.stringify(base, null, 2);
    let sha = 'sha_1';
    let putBody: { sha?: string; content?: string } | null = null;

    const respond = (body: unknown) =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(body),
        json: async () => body,
      }) as unknown as Response;
    const filePayload = () => ({
      name: 'tracker.json',
      path: 'data/tracker.json',
      sha,
      size: remote.length,
      encoding: 'base64',
      type: 'file',
      content: Buffer.from(remote, 'utf8').toString('base64'),
    });
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putBody = JSON.parse(String(init.body));
        remote = Buffer.from(putBody!.content!, 'base64').toString('utf8');
        sha = 'sha_2';
        return respond({ content: { sha }, commit: { sha: 'commit_1' } });
      }
      return respond(filePayload());
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-test-token',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const { snapshot: loaded } = await repo.loadSnapshot();
    expect(repo.getLastLoadedSha()).toBe('sha_1');
    const next = applyTielineLawoSourceChange(loaded, tielineB.id, lawoB.id, operator);
    await repo.saveSnapshot(next, undefined, operator);
    expect(putBody!.sha).toBe('sha_1'); // optimistic concurrency token sent

    const repo2 = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-test-token',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const { snapshot: reloaded } = await repo2.loadSnapshot();
    expect(rowFor(reloaded, tielineB.id).lawoSource?.id).toBe(lawoB.id);
    expect(rowFor(reloaded, tielineA.id).lawoSource?.id).toBe(lawoA.id);
    expect(reloaded.destinations).toEqual(loaded.destinations);
    expect(reloaded.outputs).toEqual(loaded.outputs);
  });
});

describe('All Signal Flows — UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows both views, lists non-MV tielines, and edits vIngest 03 without touching vTie 107', async () => {
    const storage = new MemoryTrackerStorage();
    const base = createFixture();
    const repo = new LocalTrackerRepository(base, storage);
    renderWithProviders(<DestinationSourcesPage />, { repository: repo, route: '/signal-flows' });

    // MV view remains the default
    expect(await screen.findByTestId('tab-mv-signal-flows')).toHaveClass('active');
    expect(screen.queryByTestId('all-signal-flows-view')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-all-signal-flows'));
    expect(await screen.findByTestId('all-signal-flows-view')).toBeInTheDocument();
    expect(screen.getByTestId('all-signal-flows-description')).toHaveTextContent(
      /not live discovery/i
    );

    const rowB = screen.getByTestId(`all-flow-row-${tielineB.id}`);
    expect(rowB).toHaveAttribute('data-usage-state', 'mv-input-unused');
    expect(screen.getByTestId(`all-flow-row-${tielineA.id}`)).toHaveAttribute(
      'data-usage-state',
      'pip-visible'
    );
    expect(screen.getByTestId(`all-flow-row-${tielineC.id}`)).toHaveAttribute(
      'data-usage-state',
      'no-mv-input'
    );

    // Result count with filters
    const total = resolveAllTielineFlows(base).length;
    expect(screen.getByTestId('all-flows-count')).toHaveTextContent(
      `${total} of ${total} signal flows`
    );
    fireEvent.change(screen.getByTestId('all-flows-search'), { target: { value: 'vingest03' } });
    expect(screen.getByTestId('all-flows-count')).toHaveTextContent(`1 of ${total} signal flows`);
    fireEvent.change(screen.getByTestId('all-flows-search'), { target: { value: '' } });

    fireEvent.change(screen.getByTestId('all-flows-usage-filter'), {
      target: { value: 'mv-input-unused' },
    });
    expect(screen.getByTestId('all-flows-count')).toHaveTextContent(`1 of ${total} signal flows`);
    fireEvent.change(screen.getByTestId('all-flows-usage-filter'), { target: { value: 'ALL' } });

    // Edit vIngest 03 → Origin B
    fireEvent.click(screen.getByTestId(`edit-all-flow-${tielineB.id}`));
    const modal = await screen.findByTestId('all-flow-edit-modal');
    expect(within(modal).getByText(/Change Lawo source for vIngest 03/)).toBeInTheDocument();
    expect(modal).toHaveTextContent('Test Origin A');
    fireEvent.change(within(modal).getByTestId('all-flow-source-search'), {
      target: { value: 'Test Origin B' },
    });
    fireEvent.click(await within(modal).findByText(/Test Origin B/));
    fireEvent.click(within(modal).getByTestId('all-flow-apply-btn'));

    await waitFor(() =>
      expect(screen.getByTestId(`all-flow-source-${tielineB.id}`)).toHaveTextContent(
        'Test Origin B'
      )
    );
    expect(screen.getByTestId(`all-flow-source-${tielineA.id}`)).toHaveTextContent('Test Origin A');
    expect(screen.getByTestId(`all-flow-row-${tielineB.id}`)).toHaveAttribute(
      'data-usage-state',
      'mv-input-unused'
    );
    expect(screen.getByTestId(`all-flow-mv-${tielineB.id}`)).toHaveTextContent('MV-01-12');

    // Reload from storage
    const reloaded = await new LocalTrackerRepository(base, storage).getSnapshot();
    expect(rowFor(reloaded, tielineB.id).lawoSource?.id).toBe(lawoB.id);
    expect(rowFor(reloaded, tielineA.id).lawoSource?.id).toBe(lawoA.id);
    expect(reloaded.outputs).toEqual(
      base.outputs.map((o) => ({ ...o, ...(reloaded.outputs.find((r) => r.id === o.id) ?? {}) }))
    );
  });

  it('requires confirmation before editing a tieline that shares a processing stage', async () => {
    const repo = new LocalTrackerRepository(createFixture(), new MemoryTrackerStorage());
    renderWithProviders(<DestinationSourcesPage />, { repository: repo, route: '/signal-flows' });
    fireEvent.click(await screen.findByTestId('tab-all-signal-flows'));
    fireEvent.click(screen.getByTestId(`edit-all-flow-${sharedX.id}`));
    const modal = await screen.findByTestId('all-flow-edit-modal');
    expect(within(modal).getByTestId('all-flow-shared-warning')).toHaveTextContent('vShare Y');
    fireEvent.change(within(modal).getByTestId('all-flow-source-search'), {
      target: { value: 'Test Origin B' },
    });
    fireEvent.click(await within(modal).findByText(/Test Origin B/));
    expect(within(modal).getByTestId('all-flow-apply-btn')).toBeDisabled();
    fireEvent.click(within(modal).getByTestId('all-flow-confirm-shared'));
    expect(within(modal).getByTestId('all-flow-apply-btn')).toBeEnabled();
  });
});

describe('All Signal Flows — shared processing stage warning', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  async function openEditor(repo: LocalTrackerRepository, tielineId: SourceId) {
    renderWithProviders(<DestinationSourcesPage />, { repository: repo, route: '/signal-flows' });
    fireEvent.click(await screen.findByTestId('tab-all-signal-flows'));
    fireEvent.click(screen.getByTestId(`edit-all-flow-${tielineId}`));
    return screen.findByTestId('all-flow-edit-modal');
  }
  async function pickOriginB(modal: HTMLElement) {
    fireEvent.change(within(modal).getByTestId('all-flow-source-search'), {
      target: { value: 'Test Origin B' },
    });
    fireEvent.click(await within(modal).findByText(/Test Origin B/));
  }

  it('domain: sharedProcessingStages is correct for the shared pair and empty otherwise', () => {
    const s = createFixture();
    expect(rowFor(s, sharedX.id).sharedProcessingStages.map((x) => x.id)).toEqual([stage.id]);
    expect(rowFor(s, sharedY.id).sharedProcessingStages.map((x) => x.id)).toEqual([stage.id]);
    expect(rowFor(s, soloTieline.id).sharedProcessingStages).toHaveLength(0);
    expect(rowFor(s, soloTieline.id).affectedOtherTielines).toHaveLength(0);
    expect(rowFor(s, tielineA.id).sharedProcessingStages).toHaveLength(0);
  });

  it('one warning names the edited tieline, current and proposed source, shared stage and affected tielines', async () => {
    const repo = new LocalTrackerRepository(createFixture(), new MemoryTrackerStorage());
    const modal = await openEditor(repo, sharedX.id);
    const warning = within(modal).getByTestId('all-flow-shared-warning');
    expect(within(warning).getByTestId('shared-warning-editing')).toHaveTextContent('vShare X');
    expect(within(warning).getByTestId('shared-warning-current')).toHaveTextContent(
      'Test Origin A'
    );
    expect(within(warning).getByTestId('shared-warning-stages')).toHaveTextContent('UDX-77');
    expect(within(warning).getByTestId('shared-warning-affected')).toHaveTextContent('vShare Y');
    expect(within(warning).getByTestId('shared-warning-proposed')).toHaveTextContent(
      'No change selected'
    );
    await pickOriginB(modal);
    expect(within(warning).getByTestId('shared-warning-proposed')).toHaveTextContent(
      'Test Origin B'
    );
    expect(warning.textContent).not.toMatch(/BLANK/);
  });

  it('shows operator-facing wording when there is no current source', async () => {
    const base = createFixture();
    const noOrigin: TrackerSnapshot = {
      ...base,
      sources: base.sources.map((x) => (x.id === stage.id ? { ...x, upstreamSourceId: null } : x)),
    };
    const modal = await openEditor(
      new LocalTrackerRepository(noOrigin, new MemoryTrackerStorage()),
      sharedX.id
    );
    const warning = within(modal).getByTestId('all-flow-shared-warning');
    expect(within(warning).getByTestId('shared-warning-current')).toHaveTextContent(
      'No source assigned'
    );
    expect(within(warning).getByTestId('shared-warning-proposed')).toHaveTextContent(
      'Select a source'
    );
    expect(warning.textContent).not.toMatch(/BLANK/);
  });

  it('CONFIRM: applies the shared change, persists it and records history/attribution', async () => {
    const storage = new MemoryTrackerStorage();
    const base = createFixture();
    const repo = new LocalTrackerRepository(base, storage);
    const before = JSON.parse(JSON.stringify(await repo.getSnapshot())) as TrackerSnapshot;
    const modal = await openEditor(repo, sharedX.id);
    await pickOriginB(modal);
    expect(within(modal).getByTestId('all-flow-apply-btn')).toBeDisabled();
    fireEvent.click(within(modal).getByTestId('all-flow-confirm-shared'));
    fireEvent.click(within(modal).getByTestId('all-flow-apply-btn'));

    await waitFor(() =>
      expect(screen.getByTestId(`all-flow-source-${sharedX.id}`)).toHaveTextContent('Test Origin B')
    );
    const reloaded = await new LocalTrackerRepository(base, storage).getSnapshot();
    expect(rowFor(reloaded, sharedX.id).lawoSource?.id).toBe(lawoB.id);
    expect(rowFor(reloaded, sharedY.id).lawoSource?.id).toBe(lawoB.id);
    expect(rowFor(reloaded, tielineA.id).lawoSource?.id).toBe(lawoA.id);
    const record = reloaded.changeRecords.find(
      (c) => c.entityId === stage.id && c.field === 'upstreamSourceId'
    );
    expect(record?.operatorId).toBe(operator.id);
    expect(record?.changedAt).toBeTruthy();
    const entry = (reloaded.history ?? []).find((h) => h.entityId === stage.name);
    expect(entry?.operator).toBe(operator.displayName);
    expect(reloaded.destinations).toEqual(before.destinations);
    expect(reloaded.outputs).toEqual(before.outputs);
  });

  it('CANCEL and backdrop click: no mutation, no save, no history; Apply is inert before confirmation', async () => {
    const storage = new MemoryTrackerStorage();
    const base = createFixture();
    const repo = new LocalTrackerRepository(base, storage);
    const before = await repo.getSnapshot();
    const beforeCopy = JSON.parse(JSON.stringify(before));
    const saveSpy = vi.spyOn(repo, 'saveSnapshot');

    let modal = await openEditor(repo, sharedX.id);
    await pickOriginB(modal);
    const apply = within(modal).getByTestId('all-flow-apply-btn');
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(saveSpy).not.toHaveBeenCalled();

    fireEvent.click(within(modal).getByTestId('all-flow-cancel-btn'));
    expect(screen.queryByTestId('all-flow-edit-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`edit-all-flow-${sharedX.id}`));
    modal = await screen.findByTestId('all-flow-edit-modal');
    await pickOriginB(modal);
    fireEvent.click(within(modal).getByTestId('all-flow-confirm-shared'));
    fireEvent.click(modal); // backdrop
    expect(screen.queryByTestId('all-flow-edit-modal')).not.toBeInTheDocument();

    expect(saveSpy).not.toHaveBeenCalled();
    const after = await repo.getSnapshot();
    expect(after).toEqual(beforeCopy);
    expect(after.changeRecords).toEqual(beforeCopy.changeRecords);
    expect(after.history ?? []).toEqual(beforeCopy.history ?? []);
    expect(screen.getByTestId(`all-flow-source-${sharedX.id}`)).toHaveTextContent('Test Origin A');
    expect(screen.getByTestId(`all-flow-source-${sharedY.id}`)).toHaveTextContent('Test Origin A');
  });

  it('shows no warning for a tieline with no stages or with an unshared stage', async () => {
    const repo = new LocalTrackerRepository(createFixture(), new MemoryTrackerStorage());
    renderWithProviders(<DestinationSourcesPage />, { repository: repo, route: '/signal-flows' });
    fireEvent.click(await screen.findByTestId('tab-all-signal-flows'));

    for (const id of [tielineA.id, soloTieline.id]) {
      fireEvent.click(screen.getByTestId(`edit-all-flow-${id}`));
      const modal = await screen.findByTestId('all-flow-edit-modal');
      expect(within(modal).queryByTestId('all-flow-shared-warning')).not.toBeInTheDocument();
      fireEvent.click(within(modal).getByTestId('all-flow-cancel-btn'));
    }
  });
});
