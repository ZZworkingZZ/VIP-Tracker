import { GitHubRepositoryConfig, DEFAULT_GITHUB_TRACKER_CONFIG } from './githubClient';
import { TrackerRepository } from './TrackerRepository';
import { GitHubTrackerRepository } from './GitHubTrackerRepository';
import { defaultRepository } from './LocalTrackerRepository';

export const SHARED_DATA_ENV_VAR = 'VITE_VIP_TRACKER_DATA_TOKEN';

/**
 * Reads the browser-visible shared data repository token from Vite environment variables.
 * Returns undefined if running in environments without import.meta.env or if empty.
 */
export function getSharedDataToken(): string | undefined {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const val = import.meta.env.VITE_VIP_TRACKER_DATA_TOKEN;
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return undefined;
}

/**
 * Returns true if shared data configuration (token) is present.
 */
export function isSharedDataConfigured(): boolean {
  return Boolean(getSharedDataToken());
}

export interface TrackerRepositoryFactoryOptions {
  token?: string | null;
  config?: Partial<GitHubRepositoryConfig>;
  fetchFn?: typeof fetch;
}

/**
 * Primary repository-selection rule:
 * If shared GitHub configuration is available (token present):
 *   -> GitHubTrackerRepository
 * Otherwise:
 *   -> LocalTrackerRepository
 */
export function createDefaultTrackerRepository(
  options: TrackerRepositoryFactoryOptions = {}
): TrackerRepository {
  const token = options.token !== undefined ? options.token : getSharedDataToken();

  if (token && token.trim().length > 0) {
    const trimmed = token.trim();
    return new GitHubTrackerRepository({
      config: {
        ...DEFAULT_GITHUB_TRACKER_CONFIG,
        ...options.config,
      },
      tokenProvider: () => trimmed,
      fetchFn: options.fetchFn,
    });
  }

  return defaultRepository;
}
