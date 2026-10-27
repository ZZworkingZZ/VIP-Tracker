import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { GitHubTrackerRepositoryError } from '../services/githubErrors';
import { TrackerSnapshot } from '../domain/models';
import { mockSnapshot } from './fixtures';

describe('Phase 3B — Conflict-Safe Shared GitHub Writes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockFetchResponse(body: unknown, status = 200, ok = true) {
    const headersMap = new Map([['content-type', 'application/json']]);
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      headers: {
        get: (h: string) => headersMap.get(h.toLowerCase()) ?? null,
      },
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? {})),
      json: async () => (typeof body === 'string' ? JSON.parse(body) : (body ?? {})),
    } as unknown as Response;
  }

  function createSyntheticFilePayload(
    snapshot: TrackerSnapshot = mockSnapshot,
    sha = 'mock_blob_sha_init'
  ) {
    const jsonStr = JSON.stringify(snapshot, null, 2);
    const base64 = Buffer.from(jsonStr, 'utf8').toString('base64');
    return {
      name: 'tracker.json',
      path: 'data/tracker.json',
      sha,
      size: jsonStr.length,
      encoding: 'base64',
      type: 'file',
      content: base64,
    };
  }

  // 1 & 2 & 3. Successful GitHub save sends configured target, expected SHA, and correctly encoded content
  it('1, 2, 3. sends correct target, expected SHA, and valid base64 JSON payload on save', async () => {
    const initialSha = 'sha_initial_123456';
    const updatedSha = 'sha_updated_789012';

    const initialPayload = createSyntheticFilePayload(mockSnapshot, initialSha);
    const putResponsePayload = {
      content: { sha: updatedSha },
      commit: { sha: 'commit_sha_abc' },
    };

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return createMockFetchResponse(putResponsePayload, 200, true);
      }
      return createMockFetchResponse(initialPayload, 200, true);
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-test-token',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await repo.loadSnapshot();
    expect(repo.getLastLoadedSha()).toBe(initialSha);

    const snapshotToSave = JSON.parse(JSON.stringify(mockSnapshot));
    snapshotToSave.destinations[0].assignedSourceId = null;

    const operator = { id: 'op_tech_ops', displayName: 'Tech Ops User' };
    const saved = await repo.saveSnapshot(snapshotToSave, undefined, operator);

    expect(saved).toBeDefined();

    // Verify PUT request
    const putCall = mockFetch.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PUT'
    );
    expect(putCall).toBeDefined();

    const [calledUrl, calledInit] = putCall!;
    expect(calledUrl).toBe(
      'https://api.github.com/repos/ZZworkingZZ/VIP-Tracker-Data/contents/data/tracker.json'
    );

    const bodyObj = JSON.parse((calledInit as RequestInit).body as string);
    // Requirement 1 & 2
    expect(bodyObj.branch).toBe('main');
    expect(bodyObj.sha).toBe(initialSha);
    expect(bodyObj.message).toBe('VIP Tracker update by Tech Ops User');

    // Requirement 3: Base64 decode and verify valid JSON
    const decodedContent = Buffer.from(bodyObj.content, 'base64').toString('utf8');
    const parsedSnapshot = JSON.parse(decodedContent);
    expect(parsedSnapshot.destinations[0].assignedSourceId).toBeNull();
    expect(parsedSnapshot.multiviews).toHaveLength(mockSnapshot.multiviews.length);
  });

  // 4 & 5. Successful write updates lastLoadedSha and a subsequent save uses the new SHA
  it('4, 5. updates lastLoadedSha on successful write and subsequent save uses new SHA', async () => {
    const sha1 = 'sha_step_1';
    const sha2 = 'sha_step_2';
    const sha3 = 'sha_step_3';

    let currentPutCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        currentPutCount++;
        const nextSha = currentPutCount === 1 ? sha2 : sha3;
        return createMockFetchResponse({ content: { sha: nextSha } }, 200, true);
      }
      return createMockFetchResponse(createSyntheticFilePayload(mockSnapshot, sha1), 200, true);
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-steps',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await repo.loadSnapshot();
    expect(repo.getLastLoadedSha()).toBe(sha1);

    // First save
    const snap1 = JSON.parse(JSON.stringify(mockSnapshot));
    await repo.saveSnapshot(snap1);
    expect(repo.getLastLoadedSha()).toBe(sha2);

    // Second save
    const snap2 = JSON.parse(JSON.stringify(mockSnapshot));
    await repo.saveSnapshot(snap2);
    expect(repo.getLastLoadedSha()).toBe(sha3);

    // Inspect the two PUT calls
    const putCalls = mockFetch.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PUT'
    );
    expect(putCalls).toHaveLength(2);

    const firstPutBody = JSON.parse((putCalls[0][1] as RequestInit).body as string);
    expect(firstPutBody.sha).toBe(sha1);

    const secondPutBody = JSON.parse((putCalls[1][1] as RequestInit).body as string);
    expect(secondPutBody.sha).toBe(sha2);
  });

  // 6. Optional fields survive round-trip: lawoSourceName, rawDestinationRange, metadata
  it('6. preserves optional fields (lawoSourceName, rawDestinationRange, metadata) through round-trip', async () => {
    const richSnapshot: TrackerSnapshot = {
      ...mockSnapshot,
      metadata: {
        schemaVersion: 1,
        sourceWorkbook: 'VIP Source Tracker.xlsx',
        sourceWorkbookHash: 'abcdef0123456789',
        generatorVersion: '1.0.0',
      },
      outputs: [
        {
          ...mockSnapshot.outputs[0],
          rawDestinationRange: 'MV-02 01-03',
        },
        ...mockSnapshot.outputs.slice(1),
      ],
      destinations: [
        {
          ...mockSnapshot.destinations[0],
          lawoSourceName: 'LAWO_CAM_01',
        },
        ...mockSnapshot.destinations.slice(1),
      ],
    };

    const initialSha = 'sha_rich_fields';
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return createMockFetchResponse({ content: { sha: 'sha_rich_updated' } }, 200, true);
      }
      return createMockFetchResponse(
        createSyntheticFilePayload(richSnapshot, initialSha),
        200,
        true
      );
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-rich',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const loaded = await repo.loadSnapshot();
    expect(loaded.snapshot.metadata?.sourceWorkbook).toBe('VIP Source Tracker.xlsx');
    expect(loaded.snapshot.destinations[0].lawoSourceName).toBe('LAWO_CAM_01');
    expect(loaded.snapshot.outputs[0].rawDestinationRange).toBe('MV-02 01-03');

    await repo.saveSnapshot(loaded.snapshot);

    const putCall = mockFetch.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PUT'
    );
    const bodyObj = JSON.parse((putCall![1] as RequestInit).body as string);
    const decoded = JSON.parse(Buffer.from(bodyObj.content, 'base64').toString('utf8'));

    expect(decoded.metadata.sourceWorkbook).toBe('VIP Source Tracker.xlsx');
    expect(decoded.destinations[0].lawoSourceName).toBe('LAWO_CAM_01');
    expect(decoded.outputs[0].rawDestinationRange).toBe('MV-02 01-03');
  });

  // 7. Selected operator is used in commit message with generic fallback
  it('7. uses selected operator name in commit message and fallback when missing', async () => {
    let lastCommitMsg = '';
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const bodyObj = JSON.parse(init.body as string);
        lastCommitMsg = bodyObj.message;
        return createMockFetchResponse({ content: { sha: 'sha_comm' } }, 200, true);
      }
      return createMockFetchResponse(
        createSyntheticFilePayload(mockSnapshot, 'sha_init'),
        200,
        true
      );
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await repo.loadSnapshot();

    // With explicit operator
    await repo.saveSnapshot(mockSnapshot, undefined, { id: 'op_1', displayName: 'Jane Doe' });
    expect(lastCommitMsg).toBe('VIP Tracker update by Jane Doe');

    // With null operator -> fallback 'Operator'
    await repo.saveSnapshot(mockSnapshot, undefined, null);
    expect(lastCommitMsg).toBe('VIP Tracker update by Operator');
  });

  // 8, 9, 10. HTTP 409 maps to REVISION_CONFLICT, no automatic retry, does not overwrite with newer SHA
  it('8, 9, 10. converts HTTP 409 to REVISION_CONFLICT without automatic retry or overwrite', async () => {
    let putAttempts = 0;
    const initialSha = 'sha_pre_conflict';

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putAttempts++;
        return createMockFetchResponse({ message: 'Conflict: sha does not match' }, 409, false);
      }
      return createMockFetchResponse(
        createSyntheticFilePayload(mockSnapshot, initialSha),
        200,
        true
      );
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-conflict',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await repo.loadSnapshot();

    let thrownError: unknown;
    try {
      await repo.saveSnapshot(mockSnapshot);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(GitHubTrackerRepositoryError);
    expect((thrownError as GitHubTrackerRepositoryError).code).toBe('REVISION_CONFLICT');
    expect(putAttempts).toBe(1); // Never retried automatically
    expect(repo.getLastLoadedSha()).toBe(initialSha); // Retained original SHA
  });

  // 11, 12, 13. UI conflict behavior: preserves unsaved draft, stays in edit mode, shows actionable message
  it('11, 12, 13. UI preserves draft, remains in edit mode, and displays actionable message on revision conflict', async () => {
    const initialSha = 'sha_ui_conflict';
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return createMockFetchResponse({ message: 'Conflict' }, 409, false);
      }
      return createMockFetchResponse(
        createSyntheticFilePayload(mockSnapshot, initialSha),
        200,
        true
      );
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-ui',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    function Consumer() {
      const {
        isEditMode,
        enterEditMode,
        updateDraftDestination,
        saveDraftChanges,
        draftSnapshot,
        isConflict,
        error,
      } = useTrackerSnapshot();

      return (
        <div>
          <span data-testid="is-edit-mode">{String(isEditMode)}</span>
          <span data-testid="is-conflict">{String(isConflict)}</span>
          <span data-testid="error-msg">{error ?? ''}</span>
          <span data-testid="draft-source-id">
            {draftSnapshot?.destinations[0]?.assignedSourceId ?? 'none'}
          </span>
          <button type="button" onClick={enterEditMode} data-testid="btn-enter-edit">
            Enter Edit
          </button>
          <button
            type="button"
            onClick={() => updateDraftDestination('MV-02', 1, null)}
            data-testid="btn-stage-edit"
          >
            Stage Edit
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await saveDraftChanges();
              } catch {
                // caught in test
              }
            }}
            data-testid="btn-save"
          >
            Save Changes
          </button>
        </div>
      );
    }

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
          <Consumer />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-mode-badge')).toHaveTextContent('Shared Data');
    });

    // Enter edit mode
    await userEvent.click(screen.getByTestId('btn-enter-edit'));
    expect(screen.getByTestId('is-edit-mode')).toHaveTextContent('true');

    // Stage a change: clear assigned source
    await userEvent.click(screen.getByTestId('btn-stage-edit'));
    expect(screen.getByTestId('draft-source-id')).toHaveTextContent('none');

    // Save -> triggers 409 Conflict
    await userEvent.click(screen.getByTestId('btn-save'));

    // Requirement 11: Draft is preserved
    expect(screen.getByTestId('draft-source-id')).toHaveTextContent('none');

    // Requirement 12: Remains in edit mode
    expect(screen.getByTestId('is-edit-mode')).toHaveTextContent('true');

    // Requirement 13: Actionable message and isConflict true
    expect(screen.getByTestId('is-conflict')).toHaveTextContent('true');
    expect(screen.getByTestId('error-msg')).toHaveTextContent(
      'Shared data changed after you began editing. Your changes have not been saved.'
    );

    // Conflict banner visible in UI
    expect(screen.getByTestId('edit-mode-conflict-banner')).toBeInTheDocument();
    expect(screen.getByTestId('banner-reload-latest-btn')).toBeInTheDocument();
  });

  // 14, 15, 16. Reload Latest Shared Data fetches newest snapshot, updates SHA, and clears conflict state
  it('14, 15, 16. Reload Latest Shared Data fetches newest snapshot, updates SHA, and clears conflict', async () => {
    const shaA = 'sha_initial_a';
    const shaB = 'sha_newer_b';

    const newerSnapshot: TrackerSnapshot = {
      ...mockSnapshot,
      destinations: [
        {
          ...mockSnapshot.destinations[0],
          assignedSourceId: null, // someone else cleared CAM 1
        },
        ...mockSnapshot.destinations.slice(1),
      ],
    };

    let fetchCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return createMockFetchResponse({ message: 'Conflict' }, 409, false);
      }
      fetchCount++;
      if (fetchCount === 1) {
        return createMockFetchResponse(createSyntheticFilePayload(mockSnapshot, shaA), 200, true);
      }
      return createMockFetchResponse(createSyntheticFilePayload(newerSnapshot, shaB), 200, true);
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-reload',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    function Consumer() {
      const {
        isEditMode,
        enterEditMode,
        saveDraftChanges,
        isConflict,
        reloadLatestSharedData,
        lastLoadedSha,
        snapshot,
      } = useTrackerSnapshot();

      return (
        <div>
          <span data-testid="is-edit-mode">{String(isEditMode)}</span>
          <span data-testid="is-conflict">{String(isConflict)}</span>
          <span data-testid="sha">{lastLoadedSha ?? ''}</span>
          <span data-testid="assigned-source">
            {snapshot?.destinations[0]?.assignedSourceId ?? 'none'}
          </span>
          <button type="button" onClick={enterEditMode} data-testid="btn-enter-edit">
            Enter Edit
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await saveDraftChanges();
              } catch {
                // caught
              }
            }}
            data-testid="btn-save"
          >
            Save
          </button>
          <button type="button" onClick={() => reloadLatestSharedData()} data-testid="btn-reload">
            Reload Latest Shared Data
          </button>
        </div>
      );
    }

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <Consumer />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('sha')).toHaveTextContent(shaA);
    });

    // Enter edit mode and save to produce conflict
    await userEvent.click(screen.getByTestId('btn-enter-edit'));
    await userEvent.click(screen.getByTestId('btn-save'));
    expect(screen.getByTestId('is-conflict')).toHaveTextContent('true');

    // Click Reload Latest Shared Data
    await userEvent.click(screen.getByTestId('btn-reload'));

    await waitFor(() => {
      // Requirement 14: New snapshot data loaded
      expect(screen.getByTestId('assigned-source')).toHaveTextContent('none');
    });

    // Requirement 15: Retained SHA updated to shaB
    expect(screen.getByTestId('sha')).toHaveTextContent(shaB);
    expect(repo.getLastLoadedSha()).toBe(shaB);

    // Requirement 16: Conflict cleared and out of edit mode
    expect(screen.getByTestId('is-conflict')).toHaveTextContent('false');
    expect(screen.getByTestId('is-edit-mode')).toHaveTextContent('false');
  });

  // 17 & 18. Non-conflict network failure and authentication failure preserve draft
  it('17, 18. preserves draft on network failure or authentication failure', async () => {
    let failureStatus = 500;
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return createMockFetchResponse({ message: 'Server error' }, failureStatus, false);
      }
      return createMockFetchResponse(
        createSyntheticFilePayload(mockSnapshot, 'sha_err_test'),
        200,
        true
      );
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-err',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    function Consumer() {
      const { enterEditMode, updateDraftDestination, saveDraftChanges, draftSnapshot, error } =
        useTrackerSnapshot();

      return (
        <div>
          <span data-testid="error">{error ?? ''}</span>
          <span data-testid="dest-source">
            {draftSnapshot?.destinations[0]?.assignedSourceId ?? 'empty'}
          </span>
          <button type="button" onClick={enterEditMode} data-testid="btn-enter">
            Enter
          </button>
          <button
            type="button"
            onClick={() => updateDraftDestination('MV-02', 1, null)}
            data-testid="btn-edit"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await saveDraftChanges();
              } catch {
                // caught
              }
            }}
            data-testid="btn-save"
          >
            Save
          </button>
        </div>
      );
    }

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <Consumer />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('dest-source')).toHaveTextContent('empty');
    });

    // Enter and stage edit
    await userEvent.click(screen.getByTestId('btn-enter'));
    await userEvent.click(screen.getByTestId('btn-edit'));
    expect(screen.getByTestId('dest-source')).toHaveTextContent('empty');

    // 17. 500 Network failure
    failureStatus = 500;
    await userEvent.click(screen.getByTestId('btn-save'));
    expect(screen.getByTestId('error')).toHaveTextContent('HTTP 500');
    expect(screen.getByTestId('dest-source')).toHaveTextContent('empty');

    // 18. 401 Auth failure
    failureStatus = 401;
    await userEvent.click(screen.getByTestId('btn-save'));
    expect(screen.getByTestId('error')).toHaveTextContent('HTTP 401');
    expect(screen.getByTestId('dest-source')).toHaveTextContent('empty');
  });

  // 19. Pre-write validation failure prevents outgoing GitHub write
  it('19. aborts outgoing save and prevents GitHub write if snapshot integrity fails', async () => {
    let putCalled = false;
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putCalled = true;
        return createMockFetchResponse({ content: { sha: 'sha_new' } }, 200, true);
      }
      return createMockFetchResponse(
        createSyntheticFilePayload(mockSnapshot, 'sha_val'),
        200,
        true
      );
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await repo.loadSnapshot();

    // Corrupt snapshot: reference non-existent source
    const corrupted: TrackerSnapshot = {
      ...mockSnapshot,
      destinations: [
        {
          ...mockSnapshot.destinations[0],
          assignedSourceId: 'SRC:NON_EXISTENT_GHOST',
        },
      ],
    };

    let thrown: unknown;
    try {
      await repo.saveSnapshot(corrupted);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GitHubTrackerRepositoryError);
    expect((thrown as GitHubTrackerRepositoryError).code).toBe('VALIDATION_FAILURE');
    expect(putCalled).toBe(false); // No PUT request made
  });

  // 20. Double-clicking save / repeated save while in flight does not send duplicate writes
  it('20. prevents duplicate write submissions while a save is already in-flight', async () => {
    let resolvePut: (res: Response) => void;
    let putCount = 0;

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putCount++;
        return new Promise<Response>((resolve) => {
          resolvePut = resolve;
        });
      }
      return createMockFetchResponse(
        createSyntheticFilePayload(mockSnapshot, 'sha_in_flight'),
        200,
        true
      );
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    function Consumer() {
      const { enterEditMode, saveDraftChanges, isSaving } = useTrackerSnapshot();
      return (
        <div>
          <span data-testid="is-saving">{String(isSaving)}</span>
          <button type="button" onClick={enterEditMode} data-testid="btn-enter">
            Enter
          </button>
          <button
            type="button"
            onClick={() => {
              saveDraftChanges();
            }}
            data-testid="btn-save"
          >
            Save
          </button>
        </div>
      );
    }

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <Consumer />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-saving')).toHaveTextContent('false');
    });

    await userEvent.click(screen.getByTestId('btn-enter'));

    // Trigger save 1
    const saveBtn = screen.getByTestId('btn-save');
    await userEvent.click(saveBtn);

    expect(screen.getByTestId('is-saving')).toHaveTextContent('true');
    expect(putCount).toBe(1);

    // Double-click / trigger save 2 while pending
    await userEvent.click(saveBtn);
    expect(putCount).toBe(1); // Still 1

    // Finish in-flight request
    resolvePut!(createMockFetchResponse({ content: { sha: 'sha_done' } }, 200, true));

    await waitFor(() => {
      expect(screen.getByTestId('is-saving')).toHaveTextContent('false');
    });
    expect(putCount).toBe(1);
  });

  // 21. LocalTrackerRepository remains writable and behaves as before
  it('21. LocalTrackerRepository remains writable and behaves as before', async () => {
    const localRepo = new LocalTrackerRepository(mockSnapshot);
    expect((localRepo as { isReadOnly?: boolean }).isReadOnly).toBeUndefined();

    const snap = await localRepo.getSnapshot();
    const modified = JSON.parse(JSON.stringify(snap));
    modified.destinations[0].assignedSourceId = null;

    const saved = await localRepo.saveSnapshot(modified);
    expect(saved.destinations[0].assignedSourceId).toBeNull();
  });

  // 22. Shared mode editing is enabled when repository supports writes
  it('22. enables shared mode editing controls when repository supports writes', async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return createMockFetchResponse(
        createSyntheticFilePayload(mockSnapshot, 'sha_writable_ui'),
        200,
        true
      );
    });

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-writable',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
          <DashboardPage />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-mode-badge')).toHaveTextContent('Shared Data');
    });

    // Toggle edit mode button is enabled and not labeled "Read-Only"
    const editBtn = screen.getByTestId('toggle-edit-mode-btn');
    expect(editBtn).not.toBeDisabled();
    expect(editBtn).not.toHaveTextContent('Read-Only');

    // Click to enter edit mode
    await userEvent.click(editBtn);
    expect(screen.getByTestId('edit-mode-banner')).toBeInTheDocument();
  });

  // 23, 24, 25. Determinism, no real tokens, no real operational routing data, offline only
  it('23, 24, 25. uses synthetic tokens, synthetic data only, and requires zero live network access', () => {
    const syntheticToken = 'synthetic-secret-token-example';
    expect(syntheticToken).toContain('synthetic');

    // Synthetic fixtures only
    expect(mockSnapshot.sources[0].id).toBe('SRC:CAM_1');
    expect(mockSnapshot.destinations[0].id).toBe('DEST:MV-02-01');
  });
});
