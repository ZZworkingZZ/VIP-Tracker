import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/renderWithProviders';
import { AppShell } from '../components/layout/AppShell';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { DashboardPage } from '../pages/DashboardPage';
import { SourceDirectoryPage } from '../pages/SourceDirectoryPage';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { createDirectorySource } from '../data/seed/lawoDirectory';
import {
  LAWO_DEVICE_TYPES,
  LAWO_VENDORS,
  TrackerSnapshot,
  Source,
  SignalFlowLock,
} from '../domain/models';
import {
  resolveAllPipSignalFlows,
  resolveSinglePipSignalFlow,
  resolveDestinationSignalFlows,
  getValidLawoSourceOptions,
  getValidProcessingStageOptions,
  getValidTielineOptions,
  getValidMvInputOptions,
  getValidPipOptions,
  evaluateDuplicateLawoSourceWarning,
  filterPipSignalFlows,
  applyPipLawoChainUpdate,
  applyPipTielineStageChange,
  applyPipMvInputStageChange,
  applyPipFlowLockChange,
  isSignalFlowLockExpired,
  isSignalFlowActivelyLocked,
  createPipFlowKey,
} from '../domain/signalFlow';
import { DestinationId, OutputId, PipId, SourceId, createSourceId } from '../domain/identifiers';

const TEST_OUTPUT_ID = 'OUT:MV-03-01' as OutputId; // Active '4 BOX' output on MV-03 in INITIAL_SNAPSHOT
const TEST_PIP_01 = 'PIP-01' as PipId;
const TEST_PIP_02 = 'PIP-02' as PipId;
const VCAM_40_ID = createSourceId('vCam-40'); // Existing Evertz tieline 'vCam-40' in SEED_SOURCES
const VCAM_41_ID = createSourceId('vCam-41'); // Existing Evertz tieline 'vCam-41' in SEED_SOURCES

function createSignalFlowTestSnapshot(): TrackerSnapshot {
  const liveU101 = createDirectorySource({
    id: 'SRC:LAWO_LIVEU_101' as SourceId,
    name: 'LiveU 101',
    category: 'Transmission',
    router: 'Lawo',
    routeRole: 'lawo_source',
    deviceType: 'Decode/Encode',
    vendor: 'LiveU',
  });
  const camA = createDirectorySource({
    id: 'SRC:LAWO_CAM_A' as SourceId,
    name: 'Sony Cam A',
    category: 'Other',
    router: 'Lawo',
    routeRole: 'lawo_source',
    deviceType: 'Cam',
    vendor: 'Sony',
  });
  const udx01 = createDirectorySource({
    id: 'SRC:LAWO_UDX_01' as SourceId,
    name: 'UDX-01',
    category: 'Other',
    router: 'Lawo',
    routeRole: 'processing',
    deviceType: 'UDX',
    vendor: 'Lawo',
  });
  const fs02 = createDirectorySource({
    id: 'SRC:LAWO_FS_02' as SourceId,
    name: 'FS-02',
    category: 'Other',
    router: 'Lawo',
    routeRole: 'processing',
    deviceType: 'FS',
    vendor: 'AJA',
  });

  // Preserve existing Evertz source-to-MV-Input routes on DEST:MV-03-01 (vCam-40) and DEST:MV-03-02 (vCam-41)
  const destinations = INITIAL_SNAPSHOT.destinations.map((d) => {
    if (d.id === ('DEST:MV-03-01' as DestinationId)) {
      return { ...d, assignedSourceId: VCAM_40_ID };
    }
    if (d.id === ('DEST:MV-03-02' as DestinationId)) {
      return { ...d, assignedSourceId: VCAM_41_ID };
    }
    return d;
  });

  return {
    ...INITIAL_SNAPSHOT,
    destinations,
    sources: [...INITIAL_SNAPSHOT.sources, liveU101, camA, udx01, fs02],
  };
}

describe('Signal Flows — Domain Model, Directories, Resolver, and UI Workflows', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('1. renames navigation from "Sources" to "Signal Flows" in sidebar and header', async () => {
    const repo = new LocalTrackerRepository(createSignalFlowTestSnapshot());
    renderWithProviders(<AppShell />, { repository: repo, route: '/sources' });

    expect(await screen.findByRole('link', { name: 'Signal Flows' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sources' })).not.toBeInTheDocument();
  });

  it('2 & 3. resolves one row per currently existing PIP across active multiviewer layouts and excludes unused/Available outputs', () => {
    const snapshot = createSignalFlowTestSnapshot();
    const allFlows = resolveAllPipSignalFlows(snapshot);

    // Every flow corresponds to an active output with a layout
    expect(allFlows.length).toBeGreaterThan(0);
    for (const flow of allFlows) {
      const out = snapshot.outputs.find((o) => o.id === flow.outputId);
      expect(out).toBeDefined();
      expect(out?.status).not.toBe('Available');
      expect(Boolean(out?.layoutName)).toBe(true);
    }

    // Available outputs (e.g. OUT:MV-01-01 which is Available in INITIAL_SNAPSHOT) have zero PIP rows
    const availableOutFlows = allFlows.filter((f) => f.outputId === ('OUT:MV-01-01' as OutputId));
    expect(availableOutFlows).toHaveLength(0);
  });

  it('4. updates Signal Flows rows immediately when an output layout changes', () => {
    const baseSnapshot = createSignalFlowTestSnapshot();
    const mv03Out01FlowsBefore = resolveAllPipSignalFlows(baseSnapshot).filter(
      (f) => f.outputId === TEST_OUTPUT_ID
    );
    // OUT:MV-03-01 uses '4 BOX' (4 PIPs) in INITIAL_SNAPSHOT
    expect(mv03Out01FlowsBefore).toHaveLength(4);
    expect(mv03Out01FlowsBefore.map((f) => f.pipId)).toEqual([
      'PIP-01',
      'PIP-02',
      'PIP-03',
      'PIP-04',
    ]);

    // Change OUT:MV-03-01 layout to '8 BOX' (8 PIPs)
    const updatedSnapshot: TrackerSnapshot = {
      ...baseSnapshot,
      outputs: baseSnapshot.outputs.map((o) =>
        o.id === TEST_OUTPUT_ID ? { ...o, layoutName: '8 BOX' } : o
      ),
    };
    const mv03Out01FlowsAfter = resolveAllPipSignalFlows(updatedSnapshot).filter(
      (f) => f.outputId === TEST_OUTPUT_ID
    );
    expect(mv03Out01FlowsAfter).toHaveLength(8);
  });

  it('5, 6 & 7. preserves existing Evertz source-to-MV-Input routes and MV-Input-to-PIP assignments while leaving unmapped upstream Lawo source as BLANK (null)', () => {
    const snapshot = createSignalFlowTestSnapshot();
    const out01 = snapshot.outputs.find((o) => o.id === TEST_OUTPUT_ID)!;
    const flow = resolveSinglePipSignalFlow(out01, TEST_PIP_01, 0, snapshot);

    expect(flow).toBeDefined();
    expect(flow.destinationId).toBe('DEST:MV-03-01');
    expect(flow.tielineId).toBe(VCAM_40_ID);
    expect(flow.tielineSource?.name).toBe('vCam-40');
    // Upstream Lawo source is not fabricated; remains null (BLANK) until mapped
    expect(flow.lawoSourceId).toBeNull();
    expect(flow.lawoSource).toBeNull();
    expect(flow.lawoSourceBlank).toBe(true);
    expect(flow.tielineBlank).toBe(false);
    expect(flow.mvInputBlank).toBe(false);
    expect(flow.isUnrouted).toBe(true);
    expect(flow.isComplete).toBe(false);
  });

  it('8. enforces stage-constrained dropdown options and supports all 15 Lawo device types and 15 vendors', () => {
    expect(LAWO_DEVICE_TYPES).toEqual([
      'BSP',
      'Cam',
      'Caption',
      'Color Corrector',
      'Decap/Encap',
      'Decode/Encode',
      'FS',
      'GFX',
      'IPTV',
      'Mon',
      'Multiview',
      'QC',
      'Swr',
      'Transcode',
      'UDX',
    ]);
    expect(LAWO_VENDORS).toEqual([
      'AI-Media',
      'AJA',
      'Appear',
      'AWS',
      'Blackmagic Design',
      'CueScript',
      'Evertz',
      'Gnural',
      'Haivision',
      'Lawo',
      'LiveU',
      'Magewell',
      'QuickLink',
      'Ross',
      'Sony',
    ]);

    const snapshot = createSignalFlowTestSnapshot();
    const out01 = snapshot.outputs.find((o) => o.id === TEST_OUTPUT_ID)!;

    const lawoOpts = getValidLawoSourceOptions(snapshot.sources);
    const procOpts = getValidProcessingStageOptions(snapshot.sources);
    const tielineOpts = getValidTielineOptions(snapshot.sources);
    const mv03InputOpts = getValidMvInputOptions(snapshot.destinations, 'MV-03');
    const pipOpts = getValidPipOptions(out01);

    // Lawo source options contain LiveU 101 & Sony Cam A, not UDX-01 processing stage or vCam-40 virtual tieline
    expect(lawoOpts.some((s) => s.id === 'SRC:LAWO_LIVEU_101')).toBe(true);
    expect(lawoOpts.some((s) => s.id === 'SRC:LAWO_UDX_01')).toBe(false);
    expect(lawoOpts.some((s) => s.id === VCAM_40_ID)).toBe(false);

    // Processing stage options contain UDX-01 and FS-02, not LiveU 101 or tielines
    expect(procOpts.map((s) => s.id)).toEqual(['SRC:LAWO_FS_02', 'SRC:LAWO_UDX_01']);

    // Tieline options contain vCam-40, not LiveU 101 or UDX-01
    expect(tielineOpts.some((s) => s.id === VCAM_40_ID)).toBe(true);
    expect(tielineOpts.some((s) => s.id === 'SRC:LAWO_LIVEU_101')).toBe(false);

    // MV Input options for MV-03 only contain MV-03 destinations (64 inputs)
    expect(mv03InputOpts).toHaveLength(64);
    expect(mv03InputOpts.every((d) => d.multiviewId === 'MV-03')).toBe(true);

    // PIP options for OUT:MV-03-01 (4 BOX) only contain PIP-01..PIP-04
    expect(pipOpts).toHaveLength(4);
  });

  it('10, 11 & 12. resolves standard 4-stage flow, single processing stage flow, and variable-depth multi-stage processing chains', () => {
    let snapshot = createSignalFlowTestSnapshot();
    const out01 = snapshot.outputs.find((o) => o.id === TEST_OUTPUT_ID)!;

    // Standard 4-stage flow: LiveU 101 -> vCam-40 -> MV-03-01 Input -> MV-03-01 PIP-01
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_40_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      [],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:10:00.000Z'
    );
    const standardFlow = resolveSinglePipSignalFlow(out01, TEST_PIP_01, 0, snapshot);
    expect(standardFlow.lawoSource?.name).toBe('LiveU 101');
    expect(standardFlow.processingStages).toHaveLength(0);
    expect(standardFlow.tielineSource?.name).toBe('vCam-40');
    expect(standardFlow.destinationId).toBe('DEST:MV-03-01');
    expect(standardFlow.pipId).toBe('PIP-01');
    expect(standardFlow.isComplete).toBe(true);
    expect(standardFlow.isUnrouted).toBe(false);

    // Single processing stage flow: LiveU 101 -> UDX-01 Input -> UDX-01 Output -> vCam-40 -> MV-03-01 Input -> MV-03-01 PIP-01
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_40_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      ['SRC:LAWO_UDX_01' as SourceId],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:11:00.000Z'
    );
    const singleProcFlow = resolveSinglePipSignalFlow(out01, TEST_PIP_01, 0, snapshot);
    expect(singleProcFlow.lawoSource?.name).toBe('LiveU 101');
    expect(singleProcFlow.processingStages.map((s) => s.name)).toEqual(['UDX-01']);
    expect(singleProcFlow.processingStageHops[0].inputLabel).toBe('UDX-01 Input');
    expect(singleProcFlow.processingStageHops[0].outputLabel).toBe('UDX-01 Output');

    // Variable-depth 2-stage processing chain: LiveU 101 -> FS-02 -> UDX-01 -> vCam-40
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_40_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      ['SRC:LAWO_FS_02' as SourceId, 'SRC:LAWO_UDX_01' as SourceId],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:12:00.000Z'
    );
    const multiProcFlow = resolveSinglePipSignalFlow(out01, TEST_PIP_01, 0, snapshot);
    expect(multiProcFlow.lawoSource?.name).toBe('LiveU 101');
    expect(multiProcFlow.processingStages.map((s) => s.name)).toEqual(['FS-02', 'UDX-01']);
    expect(multiProcFlow.processingStageHops).toHaveLength(2);
  });

  it('9, 13, 14, 15, 16, 17 & 29. supports searchable dropdowns, cancel (×), and checkmark (✓) direct save with operator attribution, change history, and Last Updated without requiring Review modal', async () => {
    const baseSnapshot = createSignalFlowTestSnapshot();
    const repo = new LocalTrackerRepository(baseSnapshot);
    renderWithProviders(<DestinationSourcesPage />, {
      repository: repo,
      route: '/sources?mvId=MV-03',
    });

    const flowKey = createPipFlowKey(TEST_OUTPUT_ID, TEST_PIP_01);
    const row = await screen.findByTestId(`signal-flow-row-${TEST_OUTPUT_ID}-${TEST_PIP_01}`);
    expect(row).toBeInTheDocument();

    // Initially Lawo Source is BLANK
    expect(screen.getByTestId(`blank-stage-lawo-${flowKey}`)).toHaveTextContent('BLANK');

    // Select a Lawo Source from the stage dropdown to enter pending edit state
    const selectEl = screen.getByTestId(`select-lawo-source-${flowKey}`) as HTMLSelectElement;
    fireEvent.change(selectEl, { target: { value: 'SRC:LAWO_CAM_A' } });

    // Searchable filter input appears while editing
    const searchInput = screen.getByTestId(`search-lawo-source-${flowKey}`);
    fireEvent.change(searchInput, { target: { value: 'LiveU' } });

    // Test cancel (×) first — reverts without saving
    fireEvent.click(screen.getByTestId(`cancel-lawo-source-btn-${flowKey}`));
    expect(screen.getByTestId(`blank-stage-lawo-${flowKey}`)).toBeInTheDocument();

    // Re-select LiveU 101 and click Checkmark (✓) to commit directly
    fireEvent.change(screen.getByTestId(`select-lawo-source-${flowKey}`), {
      target: { value: 'SRC:LAWO_LIVEU_101' },
    });
    fireEvent.click(screen.getByTestId(`confirm-lawo-source-btn-${flowKey}`));

    // Wait for direct commit to complete
    await waitFor(() => {
      expect(screen.queryByTestId(`confirm-lawo-source-btn-${flowKey}`)).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId(`blank-stage-lawo-${flowKey}`)).not.toBeInTheDocument();
    expect(within(row).getAllByText('LiveU 101').length).toBeGreaterThanOrEqual(1);

    // Verify repository saved directly with operator attribution & change history
    const savedSnapshot = await repo.getSnapshot();
    const updatedTieline = savedSnapshot.sources.find((s) => s.id === VCAM_40_ID);
    expect(updatedTieline?.upstreamSourceId).toBe('SRC:LAWO_LIVEU_101');
    expect(updatedTieline?.updatedBy).toBe('Zach Z');
    expect(updatedTieline?.operatorId).toBe('op_zach_z');
    expect(savedSnapshot.changeRecords?.some((r) => r.entityId === VCAM_40_ID)).toBe(true);
    expect((savedSnapshot.history ?? []).length).toBeGreaterThan(0);

    // Flow-level Last Updated cell displays operator attribution
    const lastUpdatedCell = screen.getByTestId(`flow-last-updated-cell-${flowKey}`);
    expect(lastUpdatedCell.textContent).toContain('Zach Z');
  });

  it('18. synchronizes shared Source.alias between Signal Flows and Source Directory', async () => {
    const baseSnapshot = createSignalFlowTestSnapshot();
    const repo = new LocalTrackerRepository(baseSnapshot);
    const { unmount } = renderWithProviders(<DestinationSourcesPage />, {
      repository: repo,
      route: '/sources?mvId=MV-03',
    });

    const flowKey = createPipFlowKey(TEST_OUTPUT_ID, TEST_PIP_01);
    const aliasInput = await screen.findByTestId(`flow-alias-input-${flowKey}`);
    fireEvent.change(aliasInput, { target: { value: 'Court Cam 1 UMD' } });

    const saveAliasBtn = screen.getByTestId(`save-flow-alias-btn-${flowKey}`);
    fireEvent.click(saveAliasBtn);

    await waitFor(async () => {
      const snap = await repo.getSnapshot();
      const updatedTieline = snap.sources.find((s) => s.id === VCAM_40_ID);
      expect(updatedTieline?.alias).toBe('Court Cam 1 UMD');
    });

    unmount();

    // Render Source Directory and confirm the same alias is displayed for VCAM_40_ID
    renderWithProviders(<SourceDirectoryPage />, {
      repository: repo,
      route: '/source-directory',
    });
    const dirAliasInput = (await screen.findByTestId(
      `source-alias-input-${VCAM_40_ID}`
    )) as HTMLInputElement;
    expect(dirAliasInput.value).toBe('Court Cam 1 UMD');
  });

  it('19 & 20. renders red BLANK badges for missing required stages (Lawo Source, Tieline, MV Input) and marks flow incomplete', () => {
    let snapshot = createSignalFlowTestSnapshot();

    // Clear MV Input from PIP-02 on OUT:MV-03-01 -> MV Input, Tieline, and Lawo Source are all BLANK
    snapshot = applyPipMvInputStageChange(
      snapshot,
      TEST_OUTPUT_ID,
      TEST_PIP_02,
      null,
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:20:00.000Z'
    );
    const out01 = snapshot.outputs.find((o) => o.id === TEST_OUTPUT_ID)!;
    const blankFlow = resolveSinglePipSignalFlow(out01, TEST_PIP_02, 1, snapshot);
    expect(blankFlow.mvInputBlank).toBe(true);
    expect(blankFlow.tielineBlank).toBe(true);
    expect(blankFlow.lawoSourceBlank).toBe(true);
    expect(blankFlow.isUnrouted).toBe(true);
    expect(blankFlow.isComplete).toBe(false);
  });

  it('21, 22, 23 & 24. warns when a Lawo source is routed to multiple different tielines with exact warning text, allows saving, and does NOT warn when a single tieline feeds multiple MV Inputs', () => {
    let snapshot = createSignalFlowTestSnapshot();
    const out01 = snapshot.outputs.find((o) => o.id === TEST_OUTPUT_ID)!;

    // Route LiveU 101 to vCam-40 (on DEST:MV-03-01)
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_40_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      [],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:25:00.000Z'
    );

    // Single tieline (vCam-40) also routed to another MV Input (DEST:MV-02-01) -> NO warning!
    snapshot = applyPipTielineStageChange(
      snapshot,
      'DEST:MV-02-01' as DestinationId,
      VCAM_40_ID,
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:25:30.000Z'
    );
    const singleTielineWarning = evaluateDuplicateLawoSourceWarning(
      'SRC:LAWO_LIVEU_101' as SourceId,
      VCAM_40_ID,
      snapshot.sources,
      snapshot.destinations
    );
    expect(singleTielineWarning).toBeNull();

    // Now check routing LiveU 101 to a SECOND distinct tieline (vCam-41 on DEST:MV-03-02) -> triggers exact warning!
    const multiTielineWarning = evaluateDuplicateLawoSourceWarning(
      'SRC:LAWO_LIVEU_101' as SourceId,
      VCAM_41_ID,
      snapshot.sources,
      snapshot.destinations
    );
    expect(multiTielineWarning).not.toBeNull();
    expect(multiTielineWarning?.message).toBe(
      'This Lawo source is already routed to another tieline (vCam-40).'
    );

    // Non-blocking save: applying the change succeeds and both flows show the warning
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_41_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      [],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:26:00.000Z'
    );
    const flow1After = resolveSinglePipSignalFlow(out01, TEST_PIP_01, 0, snapshot);
    const flow2After = resolveSinglePipSignalFlow(out01, TEST_PIP_02, 1, snapshot);
    expect(flow1After.duplicateWarning?.message).toBe(
      'This Lawo source is already routed to another tieline (vCam-41).'
    );
    expect(flow2After.duplicateWarning?.message).toBe(
      'This Lawo source is already routed to another tieline (vCam-40).'
    );
  });

  it('25, 26, 27 & 28. supports whole-flow locking with metadata (lockedBy, lockedAt, availableAt, context), expired lock detection, and edit protection while locked', async () => {
    const flowKey = createPipFlowKey(TEST_OUTPUT_ID, TEST_PIP_01);
    const activeLock: SignalFlowLock = {
      flowKey,
      outputId: TEST_OUTPUT_ID,
      pipId: TEST_PIP_01,
      locked: true,
      lockedBy: 'Zach Zweibel',
      operatorId: 'op_zach_z',
      lockedAt: '2026-10-29T18:00:00.000Z',
      availableAt: '2099-12-31T23:59:00.000Z',
      context: 'World Cup Final',
    };

    expect(isSignalFlowLockExpired(activeLock, new Date('2026-10-29T18:30:00.000Z'))).toBe(false);
    expect(isSignalFlowActivelyLocked(activeLock, new Date('2026-10-29T18:30:00.000Z'))).toBe(true);

    // Expired lock detection
    const expiredLock: SignalFlowLock = {
      ...activeLock,
      availableAt: '2020-01-01T00:00:00.000Z',
    };
    expect(isSignalFlowLockExpired(expiredLock, new Date('2026-10-29T18:30:00.000Z'))).toBe(true);
    expect(isSignalFlowActivelyLocked(expiredLock, new Date('2026-10-29T18:30:00.000Z'))).toBe(
      false
    );

    // Lock in snapshot and verify stage selectors are hidden and alias input is disabled while locked
    let snapshot = createSignalFlowTestSnapshot();
    snapshot = applyPipFlowLockChange(
      snapshot,
      TEST_OUTPUT_ID,
      TEST_PIP_01,
      {
        locked: true,
        availableAt: '2099-12-31T23:59:00.000Z',
        context: 'World Cup Final',
      },
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:00:00.000Z'
    );

    const repo = new LocalTrackerRepository(snapshot);
    renderWithProviders(<DestinationSourcesPage />, {
      repository: repo,
      route: '/sources?mvId=MV-03',
    });

    expect(await screen.findByTestId(`flow-locked-badge-${flowKey}`)).toHaveTextContent('Locked');
    expect(screen.getByTestId(`flow-lock-metadata-${flowKey}`)).toHaveTextContent('Zach Zweibel');
    expect(screen.getByTestId(`flow-lock-metadata-${flowKey}`)).toHaveTextContent(
      'World Cup Final'
    );
    expect(screen.queryByTestId(`select-lawo-source-${flowKey}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`select-tieline-${flowKey}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`select-mv-input-${flowKey}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`flow-alias-input-${flowKey}`)).toBeDisabled();

    // Unlock flow and verify editing is re-enabled
    fireEvent.click(screen.getByTestId(`unlock-flow-btn-${flowKey}`));
    await waitFor(() => {
      expect(screen.queryByTestId(`flow-locked-badge-${flowKey}`)).not.toBeInTheDocument();
    });
    expect(screen.getByTestId(`select-lawo-source-${flowKey}`)).toBeInTheDocument();
  });

  it('30. filters Signal Flows by general search query, Source Type, and Routed / Unrouted state', () => {
    let snapshot = createSignalFlowTestSnapshot();
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_40_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      ['SRC:LAWO_UDX_01' as SourceId],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:30:00.000Z'
    );

    const allFlows = resolveAllPipSignalFlows(snapshot);

    // Filter by MV-03 and Routed (complete flows only -> only PIP-01 on OUT:MV-03-01 has LiveU 101 mapped)
    const routedOnly = filterPipSignalFlows(allFlows, {
      multiviewId: 'MV-03',
      searchQuery: '',
      sourceTypeFilter: 'ALL',
      routeStatus: 'ROUTED',
    });
    expect(routedOnly).toHaveLength(1);
    expect(routedOnly[0].pipId).toBe('PIP-01');
    expect(routedOnly[0].outputId).toBe(TEST_OUTPUT_ID);

    // Filter by MV-03 and Unrouted (incomplete flows)
    const mv03Flows = filterPipSignalFlows(allFlows, { multiviewId: 'MV-03' });
    const unroutedOnly = filterPipSignalFlows(allFlows, {
      multiviewId: 'MV-03',
      searchQuery: '',
      sourceTypeFilter: 'ALL',
      routeStatus: 'UNROUTED',
    });
    expect(unroutedOnly.length).toBe(mv03Flows.length - 1);

    // Filter by Source Type (LiveU vendor)
    const liveUFiltered = filterPipSignalFlows(allFlows, {
      multiviewId: 'MV-03',
      searchQuery: '',
      sourceTypeFilter: 'LiveU',
      routeStatus: 'ALL',
    });
    expect(liveUFiltered).toHaveLength(1);

    // Filter by processing stage name in general search box
    const searchUdx = filterPipSignalFlows(allFlows, {
      multiviewId: 'MV-03',
      searchQuery: 'UDX-01',
      sourceTypeFilter: 'ALL',
      routeStatus: 'ALL',
    });
    expect(searchUdx).toHaveLength(1);
    expect(searchUdx[0].flowKey).toBe(createPipFlowKey(TEST_OUTPUT_ID, TEST_PIP_01));
  });

  it('31, 32 & 33. renders compact PIP signal flow with Alias at top in Multiviewers, supports "View Signal Flow" + return navigation, and displays resolved flow in OutputDetailModal', async () => {
    let snapshot = createSignalFlowTestSnapshot();
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_40_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      ['SRC:LAWO_UDX_01' as SourceId],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-29T18:32:00.000Z'
    );
    snapshot = {
      ...snapshot,
      sources: snapshot.sources.map((s: Source) =>
        s.id === VCAM_40_ID ? { ...s, alias: 'Main Court UMD' } : s
      ),
    };

    const repo = new LocalTrackerRepository(snapshot);
    const { unmount } = renderWithProviders(<DashboardPage />, {
      repository: repo,
      route: '/',
    });

    // Check compact PIP presentation on OUT:MV-03-01 PIP-01
    const out01Card = await screen.findByTestId(`output-card-${TEST_OUTPUT_ID}`);
    const aliasEl = within(out01Card).getByTestId('pip-source-alias-PIP-01');
    expect(aliasEl).toHaveTextContent('Main Court UMD');
    const compactFlowEl = within(out01Card).getByTestId('pip-compact-flow-PIP-01');
    expect(compactFlowEl.textContent).toContain('LiveU 101 → UDX-01 → vCam-40');

    // Verify "View Signal Flow" button exists on PIP-01
    const viewFlowBtn = within(out01Card).getByTestId(
      `view-signal-flow-btn-${TEST_OUTPUT_ID}-PIP-01`
    );
    expect(viewFlowBtn).toBeInTheDocument();
    unmount();

    // Render Signal Flows with navigation params from Multiviewers and check focused row + Return button
    const { unmount: unmountFlows } = renderWithProviders(<DestinationSourcesPage />, {
      repository: repo,
      route: `/sources?outputId=${TEST_OUTPUT_ID}&pipId=PIP-01&from=multiviewers&mvId=MV-03`,
    });
    expect(await screen.findByTestId('return-to-multiviewers-btn')).toBeInTheDocument();
    expect(
      screen.getByTestId(`signal-flow-row-${TEST_OUTPUT_ID}-${TEST_PIP_01}`)
    ).toBeInTheDocument();
    unmountFlows();

    // Render OutputDetailModal and verify the Resolved Signal Flow column is shown
    const updatedOut01 = snapshot.outputs.find((o) => o.id === TEST_OUTPUT_ID)!;
    renderWithProviders(
      <OutputDetailModal
        output={updatedOut01}
        destinations={snapshot.destinations}
        sources={snapshot.sources}
        allOutputs={snapshot.outputs}
        onClose={() => {}}
      />,
      { repository: repo }
    );

    const detailFlowCell = await screen.findByTestId('detail-resolved-flow-PIP-01');
    expect(detailFlowCell.textContent).toContain(
      'LiveU 101 → UDX-01 → vCam-40 → MV-03-01 Input → MV-03-01 PIP-01'
    );
  });

  it('34. renders Destination Windows Wall at the top of Signal Flows above Active Output Feeds and Signal Flows Table with 64 windows intact', async () => {
    const snapshot = createSignalFlowTestSnapshot();
    const repo = new LocalTrackerRepository(snapshot);
    renderWithProviders(<DestinationSourcesPage />, {
      repository: repo,
      route: '/sources?mvId=MV-03',
    });

    const wallContainer = await screen.findByTestId('destination-windows-wall-container');
    const outputsContainer = screen.getByTestId('active-output-feeds-container');
    const flowsTable = screen.getByTestId('signal-flows-table');

    // Destination Windows Wall must precede Active Output Feeds in the DOM
    expect(
      wallContainer.compareDocumentPosition(outputsContainer) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // Destination Windows Wall and Active Output Feeds precede Signal Flows Table
    expect(
      wallContainer.compareDocumentPosition(flowsTable) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // 64 destination tiles rendered for MV-03
    expect(screen.getByText(/Destination Windows Wall \(64 of 64\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('dest-card-DEST:MV-03-01')).toBeInTheDocument();
    expect(screen.getByTestId('dest-card-DEST:MV-03-64')).toBeInTheDocument();
    // Unassigned input displays 'Unassigned' without fabricating stages
    expect(
      within(screen.getByTestId('dest-card-DEST:MV-03-60')).getByText('Unassigned')
    ).toBeInTheDocument();
  });

  it('35. displays full known signal path in Destination Windows Wall tiles without fabricating missing stages and supports building/editing flows directly from the wall', async () => {
    const snapshot = createSignalFlowTestSnapshot();
    // Initially DEST:MV-03-01 has only vCam-40 (no upstream Lawo source or processing stage)
    const initialFlows = resolveDestinationSignalFlows(snapshot, 'MV-03');
    const dest01Initial = initialFlows.get('DEST:MV-03-01' as DestinationId)!;
    expect(dest01Initial.lawoSource).toBeNull();
    expect(dest01Initial.processingStages).toHaveLength(0);
    expect(dest01Initial.concisePathSummary).toBeNull();
    // Only stages that actually exist in the data are included
    expect(dest01Initial.knownPathStages.map((s) => s.label)).toEqual([
      'vCam-40',
      'MV-03-01 Input',
    ]);

    const repo = new LocalTrackerRepository(snapshot);
    renderWithProviders(<DestinationSourcesPage />, {
      repository: repo,
      route: '/sources?mvId=MV-03',
    });

    const destCard01 = await screen.findByTestId('dest-card-DEST:MV-03-01');
    expect(within(destCard01).getByText('vCam-40')).toBeInTheDocument();
    // Does not fabricate BLANK upstream path in compact tile when upstream is unassigned
    expect(
      within(destCard01).queryByTestId('dest-card-path-DEST:MV-03-01')
    ).not.toBeInTheDocument();

    // Click tile to open progressive disclosure Signal Flow Inspector & Builder drawer
    fireEvent.click(destCard01);
    const inspector = await screen.findByTestId('wall-flow-inspector-DEST:MV-03-01');
    expect(inspector).toBeInTheDocument();
    expect(screen.getByTestId('wall-inspector-full-path-DEST:MV-03-01')).toHaveTextContent(
      'vCam-40 → MV-03-01 Input → MV-03-01 PIP-01'
    );

    // Build upstream chain directly from the Wall Inspector: LiveU 101 -> UDX-01 -> vCam-40
    fireEvent.change(screen.getByTestId('wall-select-lawo-DEST:MV-03-01'), {
      target: { value: 'SRC:LAWO_LIVEU_101' },
    });
    fireEvent.change(screen.getByTestId('wall-select-processing-DEST:MV-03-01'), {
      target: { value: 'SRC:LAWO_UDX_01' },
    });
    fireEvent.click(screen.getByTestId('wall-confirm-lawo-chain-btn-DEST:MV-03-01'));

    await waitFor(() => {
      expect(
        screen.queryByTestId('wall-confirm-lawo-chain-btn-DEST:MV-03-01')
      ).not.toBeInTheDocument();
    });

    // Tile now shows concise full path and inspector shows full chain
    expect(screen.getByTestId('dest-card-path-DEST:MV-03-01')).toHaveTextContent(
      'LiveU 101 → UDX-01 → vCam-40'
    );
    expect(screen.getByTestId('wall-inspector-full-path-DEST:MV-03-01')).toHaveTextContent(
      'LiveU 101 → UDX-01 Input → UDX-01 Output → vCam-40 → MV-03-01 Input → MV-03-01 PIP-01'
    );

    // Also route an unassigned destination (DEST:MV-03-05) and assign it to PIP-03 on OUT:MV-03-01 from the Wall
    fireEvent.click(screen.getByTestId('dest-card-DEST:MV-03-05'));
    await screen.findByTestId('wall-flow-inspector-DEST:MV-03-05');
    fireEvent.change(screen.getByTestId('wall-select-tieline-DEST:MV-03-05'), {
      target: { value: VCAM_41_ID },
    });
    fireEvent.click(screen.getByTestId('wall-confirm-tieline-btn-DEST:MV-03-05'));
    await waitFor(() => {
      expect(
        screen.queryByTestId('wall-confirm-tieline-btn-DEST:MV-03-05')
      ).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('wall-select-output-DEST:MV-03-05'), {
      target: { value: TEST_OUTPUT_ID },
    });
    fireEvent.change(screen.getByTestId('wall-select-pip-DEST:MV-03-05'), {
      target: { value: 'PIP-03' },
    });
    fireEvent.click(screen.getByTestId('wall-confirm-pip-btn-DEST:MV-03-05'));
    await waitFor(() => {
      expect(screen.queryByTestId('wall-confirm-pip-btn-DEST:MV-03-05')).not.toBeInTheDocument();
    });

    const savedSnap = await repo.getSnapshot();
    const savedDest05 = savedSnap.destinations.find((d) => d.id === 'DEST:MV-03-05');
    expect(savedDest05?.assignedSourceId).toBe(VCAM_41_ID);
    const savedOut01 = savedSnap.outputs.find((o) => o.id === TEST_OUTPUT_ID);
    expect(savedOut01?.pipAssignments?.['PIP-03']).toBe('DEST:MV-03-05');
  });

  it('36. identifies duplicate routing scenarios (same MV card, cross-card tieline, Lawo multi-tieline, shared upstream origin) without blocking intentional duplicates', async () => {
    let snapshot = createSignalFlowTestSnapshot();
    // 1. Route vCam-40 to DEST:MV-03-01 and DEST:MV-03-06 (same MV card duplicate) and DEST:MV-02-01 (cross-card shared source)
    snapshot = applyPipTielineStageChange(
      snapshot,
      'DEST:MV-03-06' as DestinationId,
      VCAM_40_ID,
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-30T12:00:00.000Z'
    );
    snapshot = applyPipTielineStageChange(
      snapshot,
      'DEST:MV-02-01' as DestinationId,
      VCAM_40_ID,
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-30T12:00:00.000Z'
    );
    // 2. Route LiveU 101 to BOTH vCam-40 (on DEST:MV-03-01) and vCam-41 (on DEST:MV-03-02) -> lawo_multi_tieline & shared_upstream_origin
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_40_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      [],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-30T12:01:00.000Z'
    );
    snapshot = applyPipLawoChainUpdate(
      snapshot,
      VCAM_41_ID,
      'SRC:LAWO_LIVEU_101' as SourceId,
      [],
      { id: 'op_zach_z', displayName: 'Zach Zweibel' },
      '2026-10-30T12:02:00.000Z'
    );

    const destFlows = resolveDestinationSignalFlows(snapshot, 'MV-03');
    const flow01 = destFlows.get('DEST:MV-03-01' as DestinationId)!;
    const flow02 = destFlows.get('DEST:MV-03-02' as DestinationId)!;
    const flow06 = destFlows.get('DEST:MV-03-06' as DestinationId)!;

    expect(flow01.hasDuplicates).toBe(true);
    expect(flow01.hasSameCardDuplicate).toBe(true);
    expect(flow01.hasMultiTielineDuplicate).toBe(true);
    expect(flow01.duplicateFlags.map((f) => f.kind)).toEqual([
      'same_mv_card_source',
      'cross_mv_source',
      'lawo_multi_tieline',
      'shared_upstream_origin',
    ]);
    expect(flow06.hasSameCardDuplicate).toBe(true);
    expect(flow02.duplicateFlags.map((f) => f.kind)).toContain('lawo_multi_tieline');
    expect(flow02.duplicateFlags.map((f) => f.kind)).toContain('shared_upstream_origin');

    // UI renders duplicate badges and filter button on the Destination Windows Wall
    const repo = new LocalTrackerRepository(snapshot);
    renderWithProviders(<DestinationSourcesPage />, {
      repository: repo,
      route: '/sources?mvId=MV-03',
    });

    expect(await screen.findByTestId('dest-dup-badge-DEST:MV-03-01')).toBeInTheDocument();
    expect(screen.getByTestId('dest-dup-badge-DEST:MV-03-02')).toBeInTheDocument();
    expect(screen.getByTestId('dest-dup-badge-DEST:MV-03-06')).toBeInTheDocument();

    const dupFilterBtn = screen.getByTestId('wall-duplicate-filter-btn');
    fireEvent.click(dupFilterBtn);

    // When duplicate filter is active, only destinations with duplicate flags are shown
    expect(screen.getByTestId('dest-card-DEST:MV-03-01')).toBeInTheDocument();
    expect(screen.getByTestId('dest-card-DEST:MV-03-02')).toBeInTheDocument();
    expect(screen.getByTestId('dest-card-DEST:MV-03-06')).toBeInTheDocument();
    expect(screen.queryByTestId('dest-card-DEST:MV-03-60')).not.toBeInTheDocument();
  });
});
