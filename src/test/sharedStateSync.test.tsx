import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { EditModeBanner } from '../components/multiview/EditModeBanner';
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

class SimulatedGitHubRemote {
  currentSha: string;
  currentContent: string;
  fetchCount = 0;
  putCount = 0;

  constructor(initialSnapshot: TrackerSnapshot, initialSha = 'sha_rev_1') {
    this.currentSha = initialSha;
    this.currentContent = JSON.stringify(initialSnapshot, null, 2);
  }

  fetch(_url: string, init?: RequestInit): Response {
    if (init?.method === 'PUT') {
      this.putCount++;
      const body = JSON.parse(init.body as string);
      const expectedSha = body.sha;
      const newContent = Buffer.from(body.content, 'base64').toString('utf8');

      if (expectedSha !== this.currentSha) {
        return createMockFetchResponse(
          {
            message: `Conflict: expected SHA ${expectedSha} does not match current ${this.currentSha}`,
          },
          409,
          false
        );
      }

      this.currentSha = `sha_rev_remote_updated_${this.putCount}`;
      this.currentContent = newContent;

      return createMockFetchResponse(
        {
          content: { sha: this.currentSha },
          commit: { sha: 'commit_sha' },
        },
        200,
        true
      );
    }

    this.fetchCount++;
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

  updateRemoteSnapshotDirectly(newSnapshot: TrackerSnapshot, newSha: string) {
    this.currentSha = newSha;
    this.currentContent = JSON.stringify(newSnapshot, null, 2);
  }
}

const TestConsumer: React.FC = () => {
  const {
    snapshot,
    activeSnapshot,
    lastLoadedSha,
    isEditMode,
    enterEditMode,
    updateDraftOutput,
    isNewerSharedDataAvailable,
    reloadLatestSharedData,
    saveDraftChanges,
    isConflict,
  } = useTrackerSnapshot();

  return (
    <div>
      <div data-testid="sha">{lastLoadedSha ?? ''}</div>
      <div data-testid="output-assignment">
        {snapshot?.outputs.find((o) => o.id === 'OUT:MV-02-01')?.assignmentName}
      </div>
      <div data-testid="active-output-assignment">
        {activeSnapshot?.outputs.find((o) => o.id === 'OUT:MV-02-01')?.assignmentName}
      </div>
      <div data-testid="edit-mode">{isEditMode ? 'true' : 'false'}</div>
      <div data-testid="is-conflict">{isConflict ? 'true' : 'false'}</div>
      <div data-testid="newer-available">{isNewerSharedDataAvailable ? 'true' : 'false'}</div>
      <button data-testid="btn-enter-edit" onClick={enterEditMode}>
        Enter Edit
      </button>
      <button
        data-testid="btn-mutate-draft"
        onClick={() => {
          const out = snapshot?.outputs.find((o) => o.id === 'OUT:MV-02-01');
          if (out) {
            updateDraftOutput({ ...out, assignmentName: 'LOCAL DRAFT CHANGE' });
          }
        }}
      >
        Mutate Draft
      </button>
      <button data-testid="btn-reload" onClick={reloadLatestSharedData}>
        Reload Latest Shared Data
      </button>
      <button
        data-testid="btn-save"
        onClick={() => {
          void saveDraftChanges().catch(() => {});
        }}
      >
        Save Changes
      </button>
      <EditModeBanner />
    </div>
  );
};

describe('Phase 4A — Automatic Shared-State Synchronization', () => {
  const originalEnv = { ...process.env };
  let originalVisibilityState: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState);
    }
  });

  it('1 & 2: Shared idle mode performs periodic sync checks every 5s; Local mode does NOT poll', async () => {
    vi.useFakeTimers();

    const remote = new SimulatedGitHubRemote(mockSnapshot, 'sha_rev_initial');
    const gitHubRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-offline-token',
      fetchFn: vi
        .fn()
        .mockImplementation((url, init) =>
          Promise.resolve(remote.fetch(url, init))
        ) as unknown as typeof fetch,
    });

    const operatorStorage = new MemoryOperatorStorage();
    operatorStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });

    // Render Shared Repo
    const { unmount } = render(
      <TrackerRepositoryProvider repository={gitHubRepo} operatorStorage={operatorStorage}>
        <TestConsumer />
      </TrackerRepositoryProvider>
    );

    // Initial load fetch
    await act(async () => {
      await Promise.resolve();
    });

    const initialFetchCount = remote.fetchCount;
    expect(initialFetchCount).toBeGreaterThanOrEqual(1);

    // Advance 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(remote.fetchCount).toBe(initialFetchCount + 1);

    // Advance another 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(remote.fetchCount).toBe(initialFetchCount + 2);
    unmount();

    // Render Local Repo
    const localFetchSpy = vi.fn();
    vi.stubGlobal('fetch', localFetchSpy);
    const localRepo = new LocalTrackerRepository(mockSnapshot);
    expect(
      (localRepo as import('../services/TrackerRepository').TrackerRepository).checkForRemoteUpdate
    ).toBeUndefined();

    const { unmount: unmountLocal } = render(
      <TrackerRepositoryProvider repository={localRepo} operatorStorage={operatorStorage}>
        <TestConsumer />
      </TrackerRepositoryProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(15000);
      await Promise.resolve();
    });

    // Local mode should not poll GitHub or make fetch calls
    expect(localFetchSpy).not.toHaveBeenCalled();
    unmountLocal();

    vi.useRealTimers();
  });

  it('3, 4, 5, 6: Unchanged SHA causes no replacement; New remote revision automatically updates snapshot and lastLoadedSha without full page refresh', async () => {
    vi.useFakeTimers();

    const remote = new SimulatedGitHubRemote(mockSnapshot, 'sha_rev_initial');
    const gitHubRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-offline-token',
      fetchFn: vi
        .fn()
        .mockImplementation((url, init) =>
          Promise.resolve(remote.fetch(url, init))
        ) as unknown as typeof fetch,
    });

    const operatorStorage = new MemoryOperatorStorage();
    operatorStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });

    const screen = render(
      <TrackerRepositoryProvider repository={gitHubRepo} operatorStorage={operatorStorage}>
        <TestConsumer />
      </TrackerRepositoryProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_initial');
    expect(screen.getByTestId('output-assignment').textContent).toBe('BR ALERT 1');

    // 3: Advance 5s with NO change in remote
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_initial');
    expect(screen.getByTestId('output-assignment').textContent).toBe('BR ALERT 1');

    // 4 & 5 & 6: Remote changes (Browser A saved a change to remote)
    const updatedRemoteSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(mockSnapshot));
    updatedRemoteSnapshot.outputs[0].assignmentName = 'REMOTE SAVED BY BROWSER A';

    remote.updateRemoteSnapshotDirectly(updatedRemoteSnapshot, 'sha_rev_browser_a');

    // Next polling cycle (5s later)
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // Automatically reflected in Browser B without full page reload
    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_browser_a');
    expect(screen.getByTestId('output-assignment').textContent).toBe('REMOTE SAVED BY BROWSER A');

    screen.unmount();
    vi.useRealTimers();
  });

  it('7 & 8: Polling pauses when document is hidden; returning to visible triggers immediate check', async () => {
    vi.useFakeTimers();

    const remote = new SimulatedGitHubRemote(mockSnapshot, 'sha_rev_1');
    const gitHubRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-offline-token',
      fetchFn: vi
        .fn()
        .mockImplementation((url, init) =>
          Promise.resolve(remote.fetch(url, init))
        ) as unknown as typeof fetch,
    });

    const operatorStorage = new MemoryOperatorStorage();
    operatorStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });

    const screen = render(
      <TrackerRepositoryProvider repository={gitHubRepo} operatorStorage={operatorStorage}>
        <TestConsumer />
      </TrackerRepositoryProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    const fetchCountBeforeHide = remote.fetchCount;

    // Document becomes hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });

    // Advance timers by 15s while hidden
    await act(async () => {
      vi.advanceTimersByTime(15000);
      await Promise.resolve();
    });

    // Fetch count must not increase while hidden
    expect(remote.fetchCount).toBe(fetchCountBeforeHide);

    // Now update remote while hidden
    const updatedRemoteSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(mockSnapshot));
    updatedRemoteSnapshot.outputs[0].assignmentName = 'UPDATED WHILE USER AWAY';
    remote.updateRemoteSnapshotDirectly(updatedRemoteSnapshot, 'sha_rev_away');

    // Returning to visible tab triggers immediate check
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_away');
    expect(screen.getByTestId('output-assignment').textContent).toBe('UPDATED WHILE USER AWAY');

    screen.unmount();
    vi.useRealTimers();
  });

  it('9, 10, 11, 12, 13: New remote revision during edit mode preserves draft, shows notification, explicit reload works, and stale save triggers 409 conflict', async () => {
    vi.useFakeTimers();

    const remote = new SimulatedGitHubRemote(mockSnapshot, 'sha_rev_1');
    const gitHubRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-offline-token',
      fetchFn: vi
        .fn()
        .mockImplementation((url, init) =>
          Promise.resolve(remote.fetch(url, init))
        ) as unknown as typeof fetch,
    });

    const operatorStorage = new MemoryOperatorStorage();
    operatorStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });

    const screen = render(
      <TrackerRepositoryProvider repository={gitHubRepo} operatorStorage={operatorStorage}>
        <TestConsumer />
      </TrackerRepositoryProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Enter edit mode and mutate local draft
    await act(async () => {
      screen.getByTestId('btn-enter-edit').click();
      await Promise.resolve();
    });

    await act(async () => {
      screen.getByTestId('btn-mutate-draft').click();
      await Promise.resolve();
    });

    expect(screen.getByTestId('edit-mode').textContent).toBe('true');
    expect(screen.getByTestId('active-output-assignment').textContent).toBe('LOCAL DRAFT CHANGE');

    // Remote changes while user is actively editing
    const updatedRemoteSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(mockSnapshot));
    updatedRemoteSnapshot.outputs[0].assignmentName = 'REMOTE UPDATE FROM SOMEONE ELSE';
    remote.updateRemoteSnapshotDirectly(updatedRemoteSnapshot, 'sha_rev_concurrent');

    // Next polling interval fires
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // 9 & 10: State NOT replaced, draft preserved, edit mode preserved
    expect(screen.getByTestId('edit-mode').textContent).toBe('true');
    expect(screen.getByTestId('active-output-assignment').textContent).toBe('LOCAL DRAFT CHANGE');

    // 11: Notification shown
    expect(screen.getByTestId('newer-available').textContent).toBe('true');
    expect(screen.getByTestId('edit-mode-update-banner')).toBeDefined();
    expect(screen.getByText('Newer shared data is available.')).toBeDefined();

    // 13: Attempt to save stale draft triggers 409 revision conflict
    await act(async () => {
      screen.getByTestId('btn-save').click();
      await Promise.resolve();
    });

    expect(screen.getByTestId('is-conflict').textContent).toBe('true');
    expect(screen.getByTestId('edit-mode-conflict-banner')).toBeDefined();
    expect(screen.getByTestId('active-output-assignment').textContent).toBe('LOCAL DRAFT CHANGE');

    // 12: Explicit Reload Latest Shared Data resets state to latest remote
    await act(async () => {
      screen.getByTestId('btn-reload').click();
      await Promise.resolve();
    });

    expect(screen.getByTestId('edit-mode').textContent).toBe('false');
    expect(screen.getByTestId('is-conflict').textContent).toBe('false');
    expect(screen.getByTestId('newer-available').textContent).toBe('false');
    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_concurrent');
    expect(screen.getByTestId('output-assignment').textContent).toBe(
      'REMOTE UPDATE FROM SOMEONE ELSE'
    );

    screen.unmount();
    vi.useRealTimers();
  });

  it('14 & 15: Polling does not run competing refresh during save; successful save prevents immediate refetch', async () => {
    vi.useFakeTimers();

    const remote = new SimulatedGitHubRemote(mockSnapshot, 'sha_rev_1');
    const gitHubRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-offline-token',
      fetchFn: vi
        .fn()
        .mockImplementation((url, init) =>
          Promise.resolve(remote.fetch(url, init))
        ) as unknown as typeof fetch,
    });

    const operatorStorage = new MemoryOperatorStorage();
    operatorStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });

    const screen = render(
      <TrackerRepositoryProvider repository={gitHubRepo} operatorStorage={operatorStorage}>
        <TestConsumer />
      </TrackerRepositoryProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Enter edit and mutate
    await act(async () => {
      screen.getByTestId('btn-enter-edit').click();
      await Promise.resolve();
    });

    await act(async () => {
      screen.getByTestId('btn-mutate-draft').click();
      await Promise.resolve();
    });

    // Save successfully
    await act(async () => {
      screen.getByTestId('btn-save').click();
      await Promise.resolve();
    });

    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_remote_updated_1');
    expect(gitHubRepo.getLastLoadedSha()).toBe('sha_rev_remote_updated_1');

    // Advance 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // Polling checks remote, remote has same sha_rev_remote_updated_1, so hasUpdate: false
    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_remote_updated_1');
    expect(screen.getByTestId('newer-available').textContent).toBe('false');

    screen.unmount();
    vi.useRealTimers();
  });

  it('Phase 4B: In-flight poll started before save completes after save; old poll cannot roll state back; normal poll after save loads genuinely newer revision', async () => {
    vi.useFakeTimers();

    let resolvePendingPollFetch: ((resp: Response) => void) | null = null;
    let pollCount = 0;

    const initialSha = 'sha_rev_initial';
    const oldPayload = {
      name: 'tracker.json',
      path: 'data/tracker.json',
      sha: initialSha,
      size: JSON.stringify(mockSnapshot).length,
      encoding: 'base64',
      type: 'file',
      content: Buffer.from(JSON.stringify(mockSnapshot), 'utf8').toString('base64'),
    };

    let currentRemoteSha = initialSha;
    let currentRemoteSnapshot = JSON.parse(JSON.stringify(mockSnapshot));

    const gitHubRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-offline-token',
      fetchFn: vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          const body = JSON.parse(init.body as string);
          currentRemoteSha = 'sha_rev_saved_2';
          currentRemoteSnapshot = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
          return Promise.resolve(
            createMockFetchResponse(
              {
                content: { sha: currentRemoteSha },
                commit: { sha: 'commit_sha_2' },
              },
              200,
              true
            )
          );
        }

        // GET requests
        pollCount++;
        if (pollCount === 1) {
          // Initial load
          return Promise.resolve(createMockFetchResponse(oldPayload, 200, true));
        }

        if (pollCount === 2) {
          // Second GET request is delayed in flight
          return new Promise<Response>((resolve) => {
            resolvePendingPollFetch = resolve;
          });
        }

        // Subsequent polls return the current remote state
        const payload = {
          name: 'tracker.json',
          path: 'data/tracker.json',
          sha: currentRemoteSha,
          size: JSON.stringify(currentRemoteSnapshot).length,
          encoding: 'base64',
          type: 'file',
          content: Buffer.from(JSON.stringify(currentRemoteSnapshot), 'utf8').toString('base64'),
        };
        return Promise.resolve(createMockFetchResponse(payload, 200, true));
      }) as unknown as typeof fetch,
    });

    const operatorStorage = new MemoryOperatorStorage();
    operatorStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });

    const screen = render(
      <TrackerRepositoryProvider repository={gitHubRepo} operatorStorage={operatorStorage}>
        <TestConsumer />
      </TrackerRepositoryProvider>
    );

    // Initial mount hydration
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('sha').textContent).toBe(initialSha);
    expect(screen.getByTestId('output-assignment').textContent).toBe('BR ALERT 1');

    // Advance 5 seconds to trigger background poll #2 (which stays in flight)
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(resolvePendingPollFetch).not.toBeNull();

    // While poll #2 is still in flight:
    // Operator enters edit mode, mutates draft, and saves
    await act(async () => {
      screen.getByTestId('btn-enter-edit').click();
      await Promise.resolve();
    });

    await act(async () => {
      screen.getByTestId('btn-mutate-draft').click();
      await Promise.resolve();
    });

    await act(async () => {
      screen.getByTestId('btn-save').click();
      await Promise.resolve();
    });

    // Save has completed
    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_saved_2');
    expect(screen.getByTestId('output-assignment').textContent).toBe('LOCAL DRAFT CHANGE');

    // NOW, the in-flight poll #2 (which fetched oldPayload before save) finishes!
    await act(async () => {
      resolvePendingPollFetch!(createMockFetchResponse(oldPayload, 200, true));
      await Promise.resolve();
    });

    // EXPECTATION: The old poll response MUST NOT overwrite the newly saved state!
    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_saved_2');
    expect(screen.getByTestId('output-assignment').textContent).toBe('LOCAL DRAFT CHANGE');

    // Browser B or remote updates with a genuinely newer revision sha_rev_3
    currentRemoteSha = 'sha_rev_3';
    currentRemoteSnapshot.outputs[0].assignmentName = 'GENUINELY NEWER FROM BROWSER B';

    // Normal poll after save triggers at next 5s cycle
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // Genuinely newer revision is loaded correctly
    expect(screen.getByTestId('sha').textContent).toBe('sha_rev_3');
    expect(screen.getByTestId('output-assignment').textContent).toBe(
      'GENUINELY NEWER FROM BROWSER B'
    );

    screen.unmount();
    vi.useRealTimers();
  });

  it('Phase 4B: Multiple poll responses completing out of order cannot roll state backwards', async () => {
    vi.useFakeTimers();

    let resolveSlowPoll: ((resp: Response) => void) | null = null;
    let pollCount = 0;

    const snapshotV1 = JSON.parse(JSON.stringify(mockSnapshot));
    snapshotV1.outputs[0].assignmentName = 'STATE V1';
    const payloadV1 = {
      name: 'tracker.json',
      path: 'data/tracker.json',
      sha: 'sha_v1',
      size: JSON.stringify(snapshotV1).length,
      encoding: 'base64',
      type: 'file',
      content: Buffer.from(JSON.stringify(snapshotV1), 'utf8').toString('base64'),
    };

    const snapshotV2 = JSON.parse(JSON.stringify(mockSnapshot));
    snapshotV2.outputs[0].assignmentName = 'STATE V2';
    const payloadV2 = {
      name: 'tracker.json',
      path: 'data/tracker.json',
      sha: 'sha_v2',
      size: JSON.stringify(snapshotV2).length,
      encoding: 'base64',
      type: 'file',
      content: Buffer.from(JSON.stringify(snapshotV2), 'utf8').toString('base64'),
    };

    const gitHubRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-offline-token',
      fetchFn: vi.fn().mockImplementation(() => {
        pollCount++;
        if (pollCount === 1) {
          // Mount
          return Promise.resolve(createMockFetchResponse(payloadV1, 200, true));
        }
        if (pollCount === 2) {
          // Slow poll 1: delayed
          return new Promise<Response>((resolve) => {
            resolveSlowPoll = resolve;
          });
        }
        // Fast poll 2: returns V2
        return Promise.resolve(createMockFetchResponse(payloadV2, 200, true));
      }) as unknown as typeof fetch,
    });

    const operatorStorage = new MemoryOperatorStorage();
    operatorStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });

    const screen = render(
      <TrackerRepositoryProvider repository={gitHubRepo} operatorStorage={operatorStorage}>
        <TestConsumer />
      </TrackerRepositoryProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('sha').textContent).toBe('sha_v1');

    // Trigger slow poll (poll #2)
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(resolveSlowPoll).not.toBeNull();

    // While slow poll is in flight, user or app triggers reload/refresh returning V2
    await act(async () => {
      screen.getByTestId('btn-reload').click();
      await Promise.resolve();
    });

    // Reload applied V2
    expect(screen.getByTestId('sha').textContent).toBe('sha_v2');
    expect(screen.getByTestId('output-assignment').textContent).toBe('STATE V2');

    // Now slow poll (which carries older V1) resolves out of order
    await act(async () => {
      resolveSlowPoll!(createMockFetchResponse(payloadV1, 200, true));
      await Promise.resolve();
    });

    // State MUST NOT roll back to V1
    expect(screen.getByTestId('sha').textContent).toBe('sha_v2');
    expect(screen.getByTestId('output-assignment').textContent).toBe('STATE V2');

    screen.unmount();
    vi.useRealTimers();
  });

  it('Phase 4B: fetchFileContents specifies cache: no-store without manual Cache-Control/Pragma headers to prevent CORS preflight rejection', async () => {
    let capturedInit: RequestInit | undefined;
    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedInit = init;
      const payload = {
        name: 'tracker.json',
        path: 'data/tracker.json',
        sha: 'sha_test',
        size: JSON.stringify(mockSnapshot).length,
        encoding: 'base64',
        type: 'file',
        content: Buffer.from(JSON.stringify(mockSnapshot), 'utf8').toString('base64'),
      };
      return Promise.resolve(createMockFetchResponse(payload, 200, true));
    });

    const gitHubRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-offline-token',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await gitHubRepo.getSnapshot();

    expect(capturedInit).toBeDefined();
    expect(capturedInit?.cache).toBe('no-store');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer synthetic-offline-token');
    expect(headers['Accept']).toBe('application/vnd.github.v3+json');
    expect(headers['Cache-Control']).toBeUndefined();
    expect(headers['Pragma']).toBeUndefined();
  });
});
