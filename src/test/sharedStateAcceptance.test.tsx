import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { AppShell } from '../components/layout/AppShell';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { TrackerSnapshot } from '../domain/models';
import { mockSnapshot } from './fixtures';
import { MemoryOperatorStorage } from '../services/operatorStorage';

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

/**
 * Deterministic remote GitHub repository simulator implementing optimistic concurrency via file SHA.
 */
class SimulatedGitHubRemote {
  currentSha: string;
  currentContent: string;
  commits: { sha: string; message: string }[] = [];

  constructor(initialSnapshot: TrackerSnapshot, initialSha = 'sha_rev_1') {
    this.currentSha = initialSha;
    this.currentContent = JSON.stringify(initialSnapshot, null, 2);
  }

  fetch(_url: string, init?: RequestInit): Response {
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body as string);
      const expectedSha = body.sha;
      const message = body.message;
      const newContent = Buffer.from(body.content, 'base64').toString('utf8');

      // Optimistic concurrency conflict check
      if (expectedSha !== this.currentSha) {
        return createMockFetchResponse(
          {
            message: `Conflict: expected SHA ${expectedSha} does not match current ${this.currentSha}`,
          },
          409,
          false
        );
      }

      // Successful write: advance SHA and record commit
      const newSha = `sha_rev_${this.commits.length + 2}`;
      const commitSha = `commit_sha_${this.commits.length + 1}`;
      this.currentSha = newSha;
      this.currentContent = newContent;
      this.commits.push({ sha: commitSha, message });

      return createMockFetchResponse(
        {
          content: { sha: newSha },
          commit: { sha: commitSha },
        },
        200,
        true
      );
    }

    // GET file contents
    const payload = {
      name: 'tracker.json',
      path: 'data/tracker.json',
      sha: this.currentSha,
      size: this.currentContent.length,
      encoding: 'base64',
      type: 'file',
      content: Buffer.from(this.currentContent, 'utf8').toString('base64'),
    };
    return createMockFetchResponse(payload, 200, true);
  }

  getCurrentSnapshot(): TrackerSnapshot {
    return JSON.parse(this.currentContent);
  }
}

describe('Phase 4 — Multi-Session Shared-State Acceptance & Concurrency Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Harness Component to interact with a session
  function SessionControlHarness({ testIdPrefix }: { testIdPrefix: string }) {
    const {
      isEditMode,
      enterEditMode,
      updateDraftDestination,
      saveDraftChanges,
      discardChanges,
      reloadLatestSharedData,
      lastLoadedSha,
      snapshot,
      draftSnapshot,
      isConflict,
      error,
      currentOperator,
    } = useTrackerSnapshot();

    const dest1Source = isEditMode
      ? draftSnapshot?.destinations[0]?.assignedSourceId
      : snapshot?.destinations[0]?.assignedSourceId;

    return (
      <div data-testid={`${testIdPrefix}-harness`}>
        <span data-testid={`${testIdPrefix}-operator`}>
          {currentOperator?.displayName ?? 'none'}
        </span>
        <span data-testid={`${testIdPrefix}-sha`}>{lastLoadedSha ?? 'none'}</span>
        <span data-testid={`${testIdPrefix}-editmode`}>{String(isEditMode)}</span>
        <span data-testid={`${testIdPrefix}-conflict`}>{String(isConflict)}</span>
        <span data-testid={`${testIdPrefix}-error`}>{error ?? ''}</span>
        <span data-testid={`${testIdPrefix}-dest1-source`}>{dest1Source ?? 'null'}</span>

        <button type="button" data-testid={`${testIdPrefix}-enter-edit`} onClick={enterEditMode}>
          Enter Edit
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-clear-dest1`}
          onClick={() => updateDraftDestination('MV-02', 1, null)}
        >
          Clear Dest 1
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-save`}
          onClick={async () => {
            try {
              await saveDraftChanges();
            } catch {
              // error handled in context
            }
          }}
        >
          Save
        </button>
        <button type="button" data-testid={`${testIdPrefix}-discard`} onClick={discardChanges}>
          Discard
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-reload-shared`}
          onClick={() => reloadLatestSharedData()}
        >
          Reload Shared Data
        </button>
      </div>
    );
  }

  it('Phase 4.5, 4.6, 4.7, 4.8, 4.9: Full multi-session acceptance scenario with concurrent conflict and recovery', async () => {
    // 1. Initial State: Two isolated sessions backed by the same remote GitHub repository
    const remote = new SimulatedGitHubRemote(mockSnapshot, 'sha_rev_1');

    const repoA = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-a',
      fetchFn: vi
        .fn()
        .mockImplementation((url, init) =>
          Promise.resolve(remote.fetch(url, init))
        ) as unknown as typeof fetch,
    });

    const repoB = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-b',
      fetchFn: vi
        .fn()
        .mockImplementation((url, init) =>
          Promise.resolve(remote.fetch(url, init))
        ) as unknown as typeof fetch,
    });

    const storageA = new MemoryOperatorStorage();
    storageA.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });

    const storageB = new MemoryOperatorStorage();
    storageB.saveOperator({ id: 'op_alex_s', displayName: 'Alex S' });

    // Render Session A
    const renderA = render(
      <TrackerRepositoryProvider repository={repoA} operatorStorage={storageA}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
          <SessionControlHarness testIdPrefix="session-a" />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    // Render Session B
    const renderB = render(
      <TrackerRepositoryProvider repository={repoB} operatorStorage={storageB}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
          <SessionControlHarness testIdPrefix="session-b" />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    // Initial SHA check: A and B both start at sha_rev_1
    await waitFor(() => {
      expect(renderA.getByTestId('session-a-sha')).toHaveTextContent('sha_rev_1');
      expect(renderB.getByTestId('session-b-sha')).toHaveTextContent('sha_rev_1');
    });

    expect(renderA.getByTestId('session-a-dest1-source')).toHaveTextContent('SRC:CAM_1');
    expect(renderB.getByTestId('session-b-dest1-source')).toHaveTextContent('SRC:CAM_1');

    // -------------------------------------------------------------
    // PHASE 4.5: FIRST SAVE (Session A saves from R1 -> R2)
    // -------------------------------------------------------------
    await userEvent.click(renderA.getByTestId('session-a-enter-edit'));
    expect(renderA.getByTestId('session-a-editmode')).toHaveTextContent('true');

    // Operator A clears destination 1 routing
    await userEvent.click(renderA.getByTestId('session-a-clear-dest1'));
    expect(renderA.getByTestId('session-a-dest1-source')).toHaveTextContent('null');

    // Operator A saves
    await userEvent.click(renderA.getByTestId('session-a-save'));

    await waitFor(() => {
      expect(renderA.getByTestId('session-a-editmode')).toHaveTextContent('false');
      expect(renderA.getByTestId('session-a-sha')).toHaveTextContent('sha_rev_2');
    });

    // Remote is now sha_rev_2 and has A's commit
    expect(remote.currentSha).toBe('sha_rev_2');
    expect(remote.commits).toHaveLength(1);
    expect(remote.commits[0].message).toBe('VIP Tracker update by Zach Z');
    expect(remote.getCurrentSnapshot().destinations[0].assignedSourceId).toBeNull();

    // Session B explicitly reloads shared data
    await userEvent.click(renderB.getByTestId('session-b-reload-shared'));

    await waitFor(() => {
      expect(renderB.getByTestId('session-b-sha')).toHaveTextContent('sha_rev_2');
      expect(renderB.getByTestId('session-b-dest1-source')).toHaveTextContent('null');
    });

    // -------------------------------------------------------------
    // PHASE 4.6: SECOND OPERATOR SAVE (Session B saves from R2 -> R3)
    // -------------------------------------------------------------
    await userEvent.click(renderB.getByTestId('session-b-enter-edit'));
    expect(renderB.getByTestId('session-b-editmode')).toHaveTextContent('true');

    // B saves a state update
    await userEvent.click(renderB.getByTestId('session-b-save'));

    await waitFor(() => {
      expect(renderB.getByTestId('session-b-editmode')).toHaveTextContent('false');
      expect(renderB.getByTestId('session-b-sha')).toHaveTextContent('sha_rev_3');
    });

    // Remote is now sha_rev_3 and has B's commit
    expect(remote.currentSha).toBe('sha_rev_3');
    expect(remote.commits).toHaveLength(2);
    expect(remote.commits[1].message).toBe('VIP Tracker update by Alex S');

    // Session A reloads and receives sha_rev_3
    await userEvent.click(renderA.getByTestId('session-a-reload-shared'));
    await waitFor(() => {
      expect(renderA.getByTestId('session-a-sha')).toHaveTextContent('sha_rev_3');
    });

    // -------------------------------------------------------------
    // PHASE 4.7: DELIBERATE CONFLICT TEST
    // Both sessions start at sha_rev_3 and enter edit mode concurrently
    // -------------------------------------------------------------
    await userEvent.click(renderA.getByTestId('session-a-enter-edit'));
    await userEvent.click(renderB.getByTestId('session-b-enter-edit'));

    expect(renderA.getByTestId('session-a-editmode')).toHaveTextContent('true');
    expect(renderB.getByTestId('session-b-editmode')).toHaveTextContent('true');

    // Operator A saves first -> Remote advances to sha_rev_4
    await userEvent.click(renderA.getByTestId('session-a-save'));

    await waitFor(() => {
      expect(renderA.getByTestId('session-a-sha')).toHaveTextContent('sha_rev_4');
      expect(renderA.getByTestId('session-a-editmode')).toHaveTextContent('false');
    });
    expect(remote.currentSha).toBe('sha_rev_4');
    expect(remote.commits).toHaveLength(3);

    // Operator B attempts to save using stale expected SHA sha_rev_3
    await userEvent.click(renderB.getByTestId('session-b-save'));

    // Verify REQUIRED CONFLICT BEHAVIOR:
    // 1. Save fails and sets isConflict = true
    await waitFor(() => {
      expect(renderB.getByTestId('session-b-conflict')).toHaveTextContent('true');
    });

    // 2. Actionable operator error message
    expect(renderB.getByTestId('session-b-error')).toHaveTextContent(
      'Shared data changed after you began editing. Your changes have not been saved.'
    );

    // 3. Draft remains intact and B remains in edit mode
    expect(renderB.getByTestId('session-b-editmode')).toHaveTextContent('true');

    // 4. Remote state was NOT overwritten: still sha_rev_4 and commits count is still 3
    expect(remote.currentSha).toBe('sha_rev_4');
    expect(remote.commits).toHaveLength(3);

    // -------------------------------------------------------------
    // PHASE 4.8: CONFLICT RECOVERY TEST
    // Session B invokes Reload Latest Shared Data
    // -------------------------------------------------------------
    await userEvent.click(renderB.getByTestId('session-b-reload-shared'));

    await waitFor(() => {
      // 1. Conflict cleared
      expect(renderB.getByTestId('session-b-conflict')).toHaveTextContent('false');
      // 2. Edit mode exited
      expect(renderB.getByTestId('session-b-editmode')).toHaveTextContent('false');
      // 3. Newest SHA retrieved
      expect(renderB.getByTestId('session-b-sha')).toHaveTextContent('sha_rev_4');
    });

    // Both sessions now synchronized at sha_rev_4
    expect(renderA.getByTestId('session-a-sha')).toHaveTextContent('sha_rev_4');
    expect(renderB.getByTestId('session-b-sha')).toHaveTextContent('sha_rev_4');

    // -------------------------------------------------------------
    // Subsequent Save: Session B can now save successfully from sha_rev_4
    // -------------------------------------------------------------
    await userEvent.click(renderB.getByTestId('session-b-enter-edit'));
    expect(renderB.getByTestId('session-b-editmode')).toHaveTextContent('true');

    await userEvent.click(renderB.getByTestId('session-b-save'));

    await waitFor(() => {
      expect(renderB.getByTestId('session-b-editmode')).toHaveTextContent('false');
      expect(renderB.getByTestId('session-b-sha')).toHaveTextContent('sha_rev_5');
    });

    expect(remote.currentSha).toBe('sha_rev_5');
    expect(remote.commits).toHaveLength(4);
    expect(remote.commits[3].message).toBe('VIP Tracker update by Alex S');
  });
});
