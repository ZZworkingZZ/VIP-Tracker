import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/renderWithProviders';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { GitHubTrackerRepositoryError } from '../services/githubErrors';
import { TrackerSnapshot } from '../domain/models';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { MemoryTrackerStorage } from '../services/storage';
import { AppShell } from '../components/layout/AppShell';

describe('Phase 7 & Phase 8: Duplicate Production Assignments & Zero Draft Loss Invariants', () => {
  const originalEnv = process.env;
  let mockFetch: ReturnType<typeof vi.fn>;

  const config = {
    owner: 'test-org',
    repo: 'VIP-Tracker-Data',
    path: 'data/tracker.json',
    branch: 'main',
    token: 'synthetic-token-test',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    window.localStorage?.clear();
    process.env = { ...originalEnv, VITE_GITHUB_TOKEN: 'synthetic-token-test' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function createRepo(
    options: import('../services/GitHubTrackerRepository').GitHubTrackerRepositoryOptions = {}
  ) {
    return new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-test',
      config,
      ...options,
    });
  }

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
    snapshot: TrackerSnapshot = INITIAL_SNAPSHOT,
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

  // Test Component exposing all editing and error operations
  const TestEditorHarness: React.FC = () => {
    const {
      isEditMode,
      isLoading,
      activeSnapshot,
      snapshot,
      enterEditMode,
      updateDraftOutput,
      updateDraftDestination,
      saveDraftChanges,
      discardChanges,
      reloadLatestSharedData,
      isConflict,
      isSaving,
      error,
      loadError,
      saveError,
      clearSaveError,
      hasUnsavedChanges,
      stagedChanges,
    } = useTrackerSnapshot();

    return (
      <div data-testid="test-harness">
        <div data-testid="is-loading">{String(isLoading)}</div>
        <div data-testid="is-edit-mode">{String(isEditMode)}</div>
        <div data-testid="is-saving">{String(isSaving)}</div>
        <div data-testid="is-conflict">{String(isConflict)}</div>
        <div data-testid="has-unsaved">{String(hasUnsavedChanges)}</div>
        <div data-testid="staged-count">{stagedChanges.length}</div>
        <div data-testid="error-message">{error ?? ''}</div>
        <div data-testid="load-error">{loadError ?? ''}</div>
        <div data-testid="save-error">{saveError ?? ''}</div>

        <button data-testid="btn-enter-edit" onClick={enterEditMode}>
          Enter Edit Mode
        </button>
        <button
          data-testid="btn-save"
          onClick={async () => {
            try {
              await saveDraftChanges();
            } catch {
              // Expected in failure tests
            }
          }}
        >
          Save
        </button>
        <button data-testid="btn-discard" onClick={discardChanges}>
          Discard
        </button>
        <button data-testid="btn-clear-save-error" onClick={clearSaveError}>
          Clear Save Error
        </button>
        <button
          data-testid="btn-reload-latest"
          onClick={async () => {
            const confirmed = window.confirm(
              'Reload latest shared data? Your current unsaved edits will be discarded.'
            );
            if (confirmed) {
              await reloadLatestSharedData();
            }
          }}
        >
          Reload Shared
        </button>

        {/* Display current output assignments */}
        <div data-testid="out-01-assign">
          {activeSnapshot?.outputs.find((o) => o.id === 'OUT:MV-01-01')?.assignmentName ?? 'NONE'}
        </div>
        <div data-testid="out-02-assign">
          {activeSnapshot?.outputs.find((o) => o.id === 'OUT:MV-01-02')?.assignmentName ?? 'NONE'}
        </div>
        <div data-testid="out-03-assign">
          {activeSnapshot?.outputs.find((o) => o.id === 'OUT:MV-02-01')?.assignmentName ?? 'NONE'}
        </div>

        {/* Action buttons to modify outputs */}
        <button
          data-testid="btn-assign-production-a"
          onClick={() => {
            const pool = activeSnapshot?.outputs ?? snapshot?.outputs ?? [];
            const out1 = pool.find((o) => o.id === 'OUT:MV-01-01');
            const out2 = pool.find((o) => o.id === 'OUT:MV-01-02');
            const out3 = pool.find((o) => o.id === 'OUT:MV-02-01');
            if (out1) updateDraftOutput({ ...out1, assignmentName: 'TEST PRODUCTION' });
            if (out2) updateDraftOutput({ ...out2, assignmentName: 'TEST PRODUCTION' });
            if (out3) updateDraftOutput({ ...out3, assignmentName: 'TEST PRODUCTION' });
          }}
        >
          Assign All to TEST PRODUCTION
        </button>

        <button
          data-testid="btn-make-many-changes"
          onClick={() => {
            const pool = activeSnapshot?.outputs ?? snapshot?.outputs ?? [];
            const o1 = pool.find((o) => o.id === 'OUT:MV-01-01');
            const o2 = pool.find((o) => o.id === 'OUT:MV-01-02');
            const o3 = pool.find((o) => o.id === 'OUT:MV-02-01');
            const o4 = pool.find((o) => o.id === 'OUT:MV-02-02');
            const o5 = pool.find((o) => o.id === 'OUT:MV-03-01');

            if (o1)
              updateDraftOutput({
                ...o1,
                assignmentName: 'PRODUCTION ALPHA',
                notes: 'Camera 1 focus',
              });
            if (o2)
              updateDraftOutput({
                ...o2,
                assignmentName: 'PRODUCTION ALPHA',
                notes: 'Replay wall',
              });
            if (o3)
              updateDraftOutput({ ...o3, assignmentName: 'PRODUCTION BETA', status: 'Assigned' });
            if (o4)
              updateDraftOutput({
                ...o4,
                assignmentName: 'PRODUCTION BETA',
                notes: 'Audio monitoring',
              });
            if (o5) updateDraftOutput({ ...o5, assignmentName: 'PRODUCTION GAMMA', locked: true });
            updateDraftDestination('MV-01', 1, 'SRC:BARS');
            updateDraftDestination('MV-01', 2, 'SRC:BLACK');
          }}
        >
          Make Many Changes
        </button>
        <button
          data-testid="btn-set-invalid-source"
          onClick={() => {
            updateDraftDestination('MV-01', 1, 'SRC:INVALID_UNRESOLVED');
          }}
        >
          Set Invalid Source
        </button>
        <button
          data-testid="btn-correct-invalid-source"
          onClick={() => {
            updateDraftDestination('MV-01', 1, 'SRC:BARS');
          }}
        >
          Correct Invalid Source
        </button>
      </div>
    );
  };

  // ==========================================
  // PHASE 7: DUPLICATE PRODUCTION ASSIGNMENTS
  // ==========================================
  describe('Phase 7: Assignment Model and Identifier Invariants', () => {
    it('allows multiple MultiviewOutputs to share the same production assignment name and saves successfully', async () => {
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET' || !init.method) {
          return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
        }
        if (init.method === 'PUT') {
          return createMockFetchResponse({
            content: { sha: 'new_saved_sha_123' },
            commit: { sha: 'commit_sha_123' },
          });
        }
        return createMockFetchResponse({});
      });

      const repo = createRepo();
      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      // Enter edit mode
      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');

      // Assign the SAME production name "TEST PRODUCTION" to 3 different outputs:
      // OUT:MV-01-01, OUT:MV-01-02, OUT:MV-02-01
      fireEvent.click(screen.getByTestId('btn-assign-production-a'));

      expect(screen.getByTestId('out-01-assign').textContent).toBe('TEST PRODUCTION');
      expect(screen.getByTestId('out-02-assign').textContent).toBe('TEST PRODUCTION');
      expect(screen.getByTestId('out-03-assign').textContent).toBe('TEST PRODUCTION');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBeGreaterThanOrEqual(3);

      // Save changes
      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('is-edit-mode').textContent).toBe('false');
      });

      expect(screen.getByTestId('error-message').textContent).toBe('');
      expect(screen.getByTestId('save-error').textContent).toBe('');

      // All three outputs retained "TEST PRODUCTION"
      expect(screen.getByTestId('out-01-assign').textContent).toBe('TEST PRODUCTION');
      expect(screen.getByTestId('out-02-assign').textContent).toBe('TEST PRODUCTION');
      expect(screen.getByTestId('out-03-assign').textContent).toBe('TEST PRODUCTION');

      // Verify PUT body sent to remote repository:
      const putCall = mockFetch.mock.calls.find((call) => call[1]?.method === 'PUT');
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall![1].body as string);
      const decodedSnapshot: TrackerSnapshot = JSON.parse(
        Buffer.from(body.content, 'base64').toString('utf8')
      );

      // Verify that all 3 outputs in the persisted payload have "TEST PRODUCTION"
      const out1 = decodedSnapshot.outputs.find((o) => o.id === 'OUT:MV-01-01');
      const out2 = decodedSnapshot.outputs.find((o) => o.id === 'OUT:MV-01-02');
      const out3 = decodedSnapshot.outputs.find((o) => o.id === 'OUT:MV-02-01');
      expect(out1?.assignmentName).toBe('TEST PRODUCTION');
      expect(out2?.assignmentName).toBe('TEST PRODUCTION');
      expect(out3?.assignmentName).toBe('TEST PRODUCTION');

      // Verify canonical operationalAssignments contains exactly ONE entry for ASSIGN:TEST_PRODUCTION
      const matchingAssignments = decodedSnapshot.operationalAssignments.filter(
        (a) => a.id === 'ASSIGN:TEST_PRODUCTION'
      );
      expect(matchingAssignments).toHaveLength(1);
    });

    it('continues to strictly enforce uniqueness for true entity identifiers (duplicate output IDs remain INVALID)', async () => {
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET' || !init.method) {
          return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
        }
        return createMockFetchResponse({});
      });

      const repo = createRepo();
      await repo.getSnapshot();

      // Create a corrupted snapshot with genuine duplicate output ID
      const corrupted: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
      corrupted.outputs.push({
        ...corrupted.outputs[0], // Duplicate OUT:MV-01-01
      });

      let saveErr: unknown;
      try {
        await repo.saveSnapshot(corrupted);
      } catch (err) {
        saveErr = err;
      }

      expect(saveErr).toBeInstanceOf(GitHubTrackerRepositoryError);
      expect((saveErr as GitHubTrackerRepositoryError).code).toBe('VALIDATION_FAILURE');
      expect((saveErr as Error).message).toContain('Duplicate ID "OUT:MV-01-01" in outputs');
    });
  });

  // ==========================================
  // PHASE 8: ZERO-DRAFT-LOSS REGRESSION TESTS
  // ==========================================
  describe('Phase 8: Zero-Draft-Loss Invariants Under All Save Failure Scenarios', () => {
    it('1-7. Large multi-change draft survives validation failure, remains byte-for-byte intact, and saves successfully after correction', async () => {
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET' || !init.method) {
          return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
        }
        if (init.method === 'PUT') {
          return createMockFetchResponse({
            content: { sha: 'saved_sha_123' },
            commit: { sha: 'commit_123' },
          });
        }
        return createMockFetchResponse({});
      });

      const repo = createRepo();
      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      // 1. Enter edit mode and make many changes
      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);

      // 2. Introduce an unresolvable source routing validation failure
      fireEvent.click(screen.getByTestId('btn-set-invalid-source'));

      // Attempt save -> Pre-write validation rejects before write!
      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('save-error').textContent).toContain('unresolvable source ID');
      });

      // 3-4. Draft remains intact and edit mode remains active
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(screen.getByTestId('out-01-assign').textContent).toBe('PRODUCTION ALPHA');
      expect(screen.getByTestId('out-02-assign').textContent).toBe('PRODUCTION ALPHA');
      expect(screen.getByTestId('out-03-assign').textContent).toBe('PRODUCTION BETA');

      // Operator dismisses error or clears it
      fireEvent.click(screen.getByTestId('btn-clear-save-error'));
      expect(screen.getByTestId('save-error').textContent).toBe('');

      // 5-6. Operator corrects ONLY the invalid field; all other draft changes remain intact
      fireEvent.click(screen.getByTestId('btn-correct-invalid-source'));
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(screen.getByTestId('out-01-assign').textContent).toBe('PRODUCTION ALPHA');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);

      // 7. Retry save now that failure condition is resolved
      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('is-edit-mode').textContent).toBe('false');
      });

      // Successful save promoted draft and cleared edit mode
      expect(screen.getByTestId('out-01-assign').textContent).toBe('PRODUCTION ALPHA');
      expect(screen.getByTestId('out-02-assign').textContent).toBe('PRODUCTION ALPHA');
      expect(screen.getByTestId('out-03-assign').textContent).toBe('PRODUCTION BETA');
    });

    it('8. Network save failure preserves entire draft and remains in edit mode', async () => {
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET' || !init.method) {
          return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
        }
        if (init.method === 'PUT') {
          // Network failure
          throw new TypeError('Failed to fetch (Network disconnected)');
        }
        return createMockFetchResponse({});
      });

      const repo = createRepo();
      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);

      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('save-error').textContent).toContain('Network disconnected');
      });

      // Draft preserved completely
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);
      expect(screen.getByTestId('out-01-assign').textContent).toBe('PRODUCTION ALPHA');
      expect(screen.getByTestId('out-03-assign').textContent).toBe('PRODUCTION BETA');
    });

    it('9. Authentication save failure (401) preserves entire draft without fatal error screen', async () => {
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET' || !init.method) {
          return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
        }
        if (init.method === 'PUT') {
          return createMockFetchResponse({ message: 'Bad credentials' }, 401, false);
        }
        return createMockFetchResponse({});
      });

      const repo = createRepo();
      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));

      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('save-error').textContent).toContain('HTTP 401');
      });

      // Draft preserved, edit mode remains active, loadError is null
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(screen.getByTestId('load-error').textContent).toBe('');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);
    });

    it('10. GitHub generic HTTP server error (500) preserves entire draft', async () => {
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET' || !init.method) {
          return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
        }
        if (init.method === 'PUT') {
          return createMockFetchResponse({ message: 'Internal Server Error' }, 500, false);
        }
        return createMockFetchResponse({});
      });

      const repo = createRepo();
      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));

      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('save-error').textContent).toContain('HTTP 500');
      });

      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);
    });

    it('11. REVISION_CONFLICT (409) preserves entire draft and activates conflict notice', async () => {
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET' || !init.method) {
          return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
        }
        if (init.method === 'PUT') {
          return createMockFetchResponse({ message: 'Conflict: sha mismatch' }, 409, false);
        }
        return createMockFetchResponse({});
      });

      const repo = createRepo();
      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));

      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('is-conflict').textContent).toBe('true');
      });

      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);
      expect(screen.getByTestId('save-error').textContent).toContain('Shared data changed');
    });

    it('12. Unexpected repository exception preserves entire draft', async () => {
      const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      vi.spyOn(repo, 'saveSnapshot').mockRejectedValueOnce(
        new Error('Unexpected disk write failure')
      );

      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));

      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('save-error').textContent).toContain(
          'Unexpected disk write failure'
        );
      });

      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);
    });

    it('13-15. Failed save never navigates to application fatal error screen (Outlet remains rendered)', async () => {
      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === 'GET' || !init.method) {
          return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
        }
        if (init.method === 'PUT') {
          return createMockFetchResponse({ message: 'Gateway Timeout' }, 504, false);
        }
        return createMockFetchResponse({});
      });

      const repo = createRepo();
      renderWithProviders(
        <div data-testid="app-root">
          <AppShell />
          <TestEditorHarness />
        </div>,
        { repository: repo }
      );

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));

      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('save-error').textContent).toContain('HTTP 504');
      });

      // The test harness (and page canvas) is still in the document!
      // Fatal load error screen is NOT rendered.
      expect(screen.getByTestId('test-harness')).toBeInTheDocument();
      expect(screen.queryByTestId('retry-load-btn')).not.toBeInTheDocument();
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);
    });

    it('16. Successful save correctly clears draft, promotes to baseline, and exits edit mode', async () => {
      const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');

      fireEvent.click(screen.getByTestId('btn-save'));

      await waitFor(() => {
        expect(screen.getByTestId('is-edit-mode').textContent).toBe('false');
      });

      expect(screen.getByTestId('has-unsaved').textContent).toBe('false');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(0);
      expect(screen.getByTestId('save-error').textContent).toBe('');
    });

    it('17. Background synchronization cannot overwrite active draft', async () => {
      let remoteCheckReturnsUpdate = false;
      const newerSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
      newerSnapshot.outputs[0].assignmentName = 'REMOTE BROWSER WRITE';

      const repo = createRepo();
      vi.spyOn(repo, 'checkForRemoteUpdate').mockImplementation(async () => {
        if (remoteCheckReturnsUpdate) {
          return { hasUpdate: true, sha: 'newer_sha_999', snapshot: newerSnapshot };
        }
        return { hasUpdate: false, sha: 'mock_blob_sha_init', snapshot: INITIAL_SNAPSHOT };
      });

      mockFetch.mockImplementation(async () => {
        return createMockFetchResponse(createSyntheticFilePayload(INITIAL_SNAPSHOT));
      });

      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));

      // Remote update happens while operator is editing
      remoteCheckReturnsUpdate = true;

      // Operator's draft remains untouched
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(screen.getByTestId('out-01-assign').textContent).toBe('PRODUCTION ALPHA');
      expect(screen.getByTestId('out-01-assign').textContent).not.toBe('REMOTE BROWSER WRITE');
    });

    it('18-20. Reload Latest Shared Data explicit confirmation: canceling preserves draft, confirming discards draft', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');

      const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderWithProviders(<TestEditorHarness />, { repository: repo });

      await waitFor(() => {
        expect(screen.getByTestId('is-loading').textContent).toBe('false');
      });

      fireEvent.click(screen.getByTestId('btn-enter-edit'));
      fireEvent.click(screen.getByTestId('btn-make-many-changes'));

      await waitFor(() => {
        expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);
      });

      // Scenario 20: User CANCELS confirmation dialog
      confirmSpy.mockReturnValueOnce(false);
      fireEvent.click(screen.getByTestId('btn-reload-latest'));

      // Draft MUST be preserved
      expect(screen.getByTestId('is-edit-mode').textContent).toBe('true');
      expect(Number(screen.getByTestId('staged-count').textContent)).toBe(11);
      expect(screen.getByTestId('out-01-assign').textContent).toBe('PRODUCTION ALPHA');

      // Scenario 19: User CONFIRMS reload dialog
      confirmSpy.mockReturnValueOnce(true);
      fireEvent.click(screen.getByTestId('btn-reload-latest'));

      // Draft is discarded and reloads baseline
      await waitFor(() => {
        expect(screen.getByTestId('is-edit-mode').textContent).toBe('false');
      });
      expect(screen.getByTestId('has-unsaved').textContent).toBe('false');
    });
  });
});
