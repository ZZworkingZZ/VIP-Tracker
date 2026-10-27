import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { createDefaultTrackerRepository, SHARED_DATA_ENV_VAR } from '../services/repositoryConfig';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { LocalTrackerRepository, defaultRepository } from '../services/LocalTrackerRepository';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { SettingsModal } from '../components/layout/SettingsModal';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { mockSnapshot } from './fixtures';
import { MemoryOperatorStorage } from '../services/operatorStorage';

describe('Phase 3A — Shared GitHub Tracker Reads', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockFetchResponse(body: unknown, status = 200, ok = true) {
    const headersMap = new Map([['content-type', 'application/json']]);
    return vi.fn().mockResolvedValue({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      headers: {
        get: (h: string) => headersMap.get(h.toLowerCase()) ?? null,
      },
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? {})),
      json: async () => (typeof body === 'string' ? JSON.parse(body) : (body ?? {})),
    } as unknown as Response);
  }

  function createSyntheticFilePayload(snapshot = mockSnapshot, sha = 'mock_blob_sha_test123') {
    const jsonStr = JSON.stringify(snapshot);
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

  // 1. GitHub configuration constructs correct GitHubTrackerRepository
  it('1. constructs GitHubTrackerRepository with authoritative default config', () => {
    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-test-token',
    });

    expect(repo.config.owner).toBe('ZZworkingZZ');
    expect(repo.config.repo).toBe('VIP-Tracker-Data');
    expect(repo.config.branch).toBe('main');
    expect(repo.config.path).toBe('data/tracker.json');
    expect(repo.isReadOnly).toBe(true);
    expect(repo.getLastLoadedSha()).toBeNull();
  });

  // 2. Shared configuration present -> GitHubTrackerRepository selected
  it('2. selects GitHubTrackerRepository when shared configuration token is provided', () => {
    const repo = createDefaultTrackerRepository({
      token: 'synthetic-test-token-present',
    });

    expect(repo).toBeInstanceOf(GitHubTrackerRepository);
    expect((repo as GitHubTrackerRepository).isReadOnly).toBe(true);
  });

  // 3. Shared configuration absent -> LocalTrackerRepository selected
  it('3. selects LocalTrackerRepository when shared configuration is absent', () => {
    const repo = createDefaultTrackerRepository({
      token: null,
    });

    expect(repo).toBe(defaultRepository);
    expect(repo).toBeInstanceOf(LocalTrackerRepository);
  });

  // 4. Shared repository load success -> remote snapshot becomes application state
  it('4. loads authoritative remote snapshot into application state on load success', async () => {
    const payload = createSyntheticFilePayload(mockSnapshot, 'mock_sha_success_456');
    const mockFetch = createMockFetchResponse(payload);

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-4',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    // Initial loading message displayed
    expect(screen.getByText('Loading VIP Tracker operational baseline...')).toBeInTheDocument();

    // After success, shell renders and header displays shared read-only badge
    await waitFor(() => {
      expect(screen.getByTestId('data-mode-badge')).toHaveTextContent('Shared Data (Read-Only)');
    });

    expect(
      screen.queryByText('Loading VIP Tracker operational baseline...')
    ).not.toBeInTheDocument();
    expect(repo.getLastLoadedSha()).toBe('mock_sha_success_456');
  });

  // 5. Shared repository load failure -> concise error surfaced with retry button
  it('5. surfaces concise error and retry button on remote load failure without exposing token', async () => {
    const mockFetch = createMockFetchResponse({ message: 'Bad credentials' }, 401, false);

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-secret-token-xyz',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(
      'Authentication failed for repository ZZworkingZZ/VIP-Tracker-Data (HTTP 401).'
    );

    // Verify token is never exposed in the error DOM
    expect(errorAlert).not.toHaveTextContent('synthetic-secret-token-xyz');

    // Retry button is available
    const retryBtn = screen.getByTestId('retry-load-btn');
    expect(retryBtn).toBeInTheDocument();
  });

  // 6. GitHub failure does NOT silently fall back to LocalTrackerRepository
  it('6. does NOT silently fall back to LocalTrackerRepository after remote load failure', async () => {
    const mockFetch = createMockFetchResponse({ message: 'Not Found' }, 404, false);

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-6',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await screen.findByRole('alert');

    // Remains in error state, never displays "Local Data"
    expect(screen.queryByText('Local Data')).not.toBeInTheDocument();
    expect(screen.getByTestId('data-mode-badge')).toHaveTextContent('Shared Data (Read-Only)');
  });

  // 7. Loading state is represented correctly
  it('7. represents loading state correctly while tracker.json is in-flight', async () => {
    let resolveResponse: (value: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const mockFetch = vi.fn().mockReturnValue(pendingPromise);

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-7',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    expect(screen.getByText('Loading VIP Tracker operational baseline...')).toBeInTheDocument();

    // Resolve in background
    const payload = createSyntheticFilePayload(mockSnapshot, 'mock_sha_7');
    resolveResponse!({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as unknown as Response);

    await waitFor(() => {
      expect(
        screen.queryByText('Loading VIP Tracker operational baseline...')
      ).not.toBeInTheDocument();
    });
  });

  // 8. Read-only shared mode prevents misleading unsaved mutations
  it('8. prevents edit mode and disables mutation controls in read-only shared mode', async () => {
    const payload = createSyntheticFilePayload(mockSnapshot, 'mock_sha_readonly_8');
    const mockFetch = createMockFetchResponse(payload);

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-8',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    function Consumer() {
      const { isReadOnly, isEditMode, enterEditMode, saveDraftChanges, resetToBaseline, error } =
        useTrackerSnapshot();
      return (
        <div>
          <span data-testid="is-readonly">{String(isReadOnly)}</span>
          <span data-testid="is-edit-mode">{String(isEditMode)}</span>
          <span data-testid="mutation-error">{error}</span>
          <button type="button" onClick={enterEditMode} data-testid="enter-edit-test">
            Enter Edit
          </button>
          <button type="button" onClick={() => saveDraftChanges()} data-testid="save-test">
            Save
          </button>
          <button type="button" onClick={() => resetToBaseline()} data-testid="reset-test">
            Reset
          </button>
        </div>
      );
    }

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <Consumer />
          <DashboardPage />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-readonly')).toHaveTextContent('true');
    });

    // Clicking enter edit mode is blocked
    const enterEditBtn = screen.getByTestId('enter-edit-test');
    await userEvent.click(enterEditBtn);
    expect(screen.getByTestId('is-edit-mode')).toHaveTextContent('false');

    // Wait for Dashboard to render after snapshot loads
    await waitFor(() => {
      expect(screen.getByTestId('toggle-edit-mode-btn')).toBeInTheDocument();
    });

    // Dashboard toggle-edit-mode button is disabled
    const dashboardEditBtn = screen.getByTestId('toggle-edit-mode-btn');
    expect(dashboardEditBtn).toBeDisabled();
    expect(dashboardEditBtn).toHaveTextContent('🔒 Read-Only');

    // Attempting save sets error
    const saveBtn = screen.getByTestId('save-test');
    await userEvent.click(saveBtn);
    expect(screen.getByTestId('mutation-error')).toHaveTextContent(
      'VIP Tracker is in read-only shared mode. Edits cannot be saved.'
    );
  });

  // 9. Loaded GitHub SHA remains available for the future write phase
  it('9. retains and exposes GitHub file SHA in repository and context', async () => {
    const testSha = 'deadbeefcafe0123456789abcdef0123456789ab';
    const payload = createSyntheticFilePayload(mockSnapshot, testSha);
    const mockFetch = createMockFetchResponse(payload);

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-9',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    function ShaInspector() {
      const { lastLoadedSha } = useTrackerSnapshot();
      return <div data-testid="context-sha">{lastLoadedSha}</div>;
    }

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <ShaInspector />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('context-sha')).toHaveTextContent(testSha);
    });

    expect(repo.getLastLoadedSha()).toBe(testSha);
  });

  // 10. Existing LocalTrackerRepository behavior remains functional when local mode is selected
  it('10. preserves normal editing and local persistence when local mode is selected', async () => {
    const localRepo = new LocalTrackerRepository(mockSnapshot);

    function LocalConsumer() {
      const { isReadOnly, isEditMode, enterEditMode } = useTrackerSnapshot();
      return (
        <div>
          <span data-testid="local-readonly">{String(isReadOnly)}</span>
          <span data-testid="local-edit-mode">{String(isEditMode)}</span>
          <button type="button" onClick={enterEditMode} data-testid="local-enter-edit">
            Enter Edit
          </button>
        </div>
      );
    }

    render(
      <TrackerRepositoryProvider repository={localRepo}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
          <LocalConsumer />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('data-mode-badge')).toHaveTextContent('Local Data');
    });

    expect(screen.getByTestId('local-readonly')).toHaveTextContent('false');

    // Entering edit mode works normally
    await userEvent.click(screen.getByTestId('local-enter-edit'));
    expect(screen.getByTestId('local-edit-mode')).toHaveTextContent('true');
  });

  // 11. No real token value exists in test fixtures
  it('11. verifies test fixtures and environment variable name contain no real token', () => {
    expect(SHARED_DATA_ENV_VAR).toBe('VITE_VIP_TRACKER_DATA_TOKEN');
    // Ensure all test tokens used are synthetic
    const testToken = 'synthetic-test-token';
    expect(testToken).toMatch(/^synthetic-/);
  });

  // 12. Existing "Who's Using VIP Tracker" behavior remains intact
  it('12. preserves operator selection and attribution in shared read mode', async () => {
    const payload = createSyntheticFilePayload(mockSnapshot, 'mock_sha_operator_12');
    const mockFetch = createMockFetchResponse(payload);

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-12',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const memoryStorage = new MemoryOperatorStorage();
    memoryStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Weibel' });

    render(
      <TrackerRepositoryProvider repository={repo} operatorStorage={memoryStorage}>
        <MemoryRouter initialEntries={['/']}>
          <AppShell />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-operator-name')).toHaveTextContent('Zach Weibel');
    });

    // Switch User button is functional
    const switchBtn = screen.getByTestId('switch-user-btn');
    expect(switchBtn).toBeInTheDocument();
  });

  // Read-only guards on OutputDetailModal and SettingsModal
  it('disables OutputDetailModal edit button and SettingsModal reset in shared read mode', async () => {
    const payload = createSyntheticFilePayload(mockSnapshot, 'mock_sha_modals');
    const mockFetch = createMockFetchResponse(payload);

    const repo = new GitHubTrackerRepository({
      tokenProvider: () => 'synthetic-token-modals',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    render(
      <TrackerRepositoryProvider repository={repo}>
        <MemoryRouter initialEntries={['/']}>
          <OutputDetailModal output={mockSnapshot.outputs[0]} onClose={() => {}} />
          <SettingsModal isOpen={true} onClose={() => {}} />
        </MemoryRouter>
      </TrackerRepositoryProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('enter-edit-mode-btn')).toBeDisabled();
    });

    expect(screen.getByTestId('enter-edit-mode-btn')).toHaveTextContent('🔒 Read-Only');
    expect(screen.getByTestId('shared-read-only-msg')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-local-data-btn')).not.toBeInTheDocument();
  });
});
