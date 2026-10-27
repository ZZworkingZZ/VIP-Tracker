import {
  GitHubTrackerRepositoryError,
  GitHubTrackerErrorCode,
  sanitizeErrorText,
} from './githubErrors';

export interface GitHubRepositoryConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export const DEFAULT_GITHUB_TRACKER_CONFIG: GitHubRepositoryConfig = {
  owner: 'ZZworkingZZ',
  repo: 'VIP-Tracker-Data',
  branch: 'main',
  path: 'data/tracker.json',
};

export type GitHubTokenProvider = () => Promise<string | null> | string | null;

export interface GitHubClientOptions {
  config?: Partial<GitHubRepositoryConfig>;
  tokenProvider?: GitHubTokenProvider;
  fetchFn?: typeof fetch;
  requireAuth?: boolean;
}

export interface GitHubFileContentResponse {
  content: string;
  sha: string;
  path: string;
  encoding: string;
  type: string;
  size?: number;
}

export interface GitHubFilePayload {
  decodedContent: string;
  sha: string;
  path: string;
  branch: string;
}

/**
 * Decodes Base64 string from GitHub contents API into UTF-8 text.
 * Strips whitespace/newlines and rejects non-base64 characters.
 */
export function decodeGitHubBase64(base64Content: string): string {
  if (typeof base64Content !== 'string') {
    throw new Error('Base64 content must be a string.');
  }

  const clean = base64Content.replace(/\s+/g, '');
  if (!clean || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    throw new Error('Invalid Base64 string format.');
  }

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(clean, 'base64').toString('utf8');
    }
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (err) {
    throw new Error(
      `Failed to decode Base64 content: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Encodes UTF-8 string into Base64 format for GitHub Contents API file updates.
 */
export function encodeGitHubBase64(utf8Content: string): string {
  if (typeof utf8Content !== 'string') {
    throw new Error('Content must be a string to encode to Base64.');
  }

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(utf8Content, 'utf8').toString('base64');
    }
    const bytes = new TextEncoder().encode(utf8Content);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    throw new Error(
      `Failed to encode content to Base64: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export interface GitHubUpdateFileOptions {
  content: string;
  expectedSha: string;
  commitMessage: string;
}

export interface GitHubUpdateFileResult {
  newSha: string;
  commitSha?: string;
  branch: string;
  path: string;
}

/**
 * Handles transport and communication with GitHub REST API for repository file contents.
 */
export class GitHubClient {
  readonly config: GitHubRepositoryConfig;
  private readonly tokenProvider?: GitHubTokenProvider;
  private readonly fetchFn: typeof fetch;
  private readonly requireAuth: boolean;

  constructor(options: GitHubClientOptions = {}) {
    this.config = {
      ...DEFAULT_GITHUB_TRACKER_CONFIG,
      ...options.config,
    };
    this.tokenProvider = options.tokenProvider;
    this.fetchFn =
      options.fetchFn ??
      (typeof fetch !== 'undefined'
        ? fetch.bind(globalThis)
        : (undefined as unknown as typeof fetch));
    this.requireAuth = options.requireAuth ?? true;
  }

  async fetchFileContents(): Promise<GitHubFilePayload> {
    if (!this.fetchFn) {
      throw new GitHubTrackerRepositoryError('Fetch API is not available in current environment.', {
        code: 'NETWORK_ERROR',
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      });
    }

    let token: string | null = null;
    if (this.tokenProvider) {
      try {
        token = await this.tokenProvider();
      } catch (err) {
        throw new GitHubTrackerRepositoryError(
          `Token provider failed: ${sanitizeErrorText(err instanceof Error ? err.message : String(err))}`,
          {
            code: 'MISSING_AUTHENTICATION',
            owner: this.config.owner,
            repo: this.config.repo,
            path: this.config.path,
            branch: this.config.branch,
          }
        );
      }
    }

    if (this.requireAuth && (!token || token.trim() === '')) {
      throw new GitHubTrackerRepositoryError(
        `Authentication token is required to access private repository ${this.config.owner}/${this.config.repo}.`,
        {
          code: 'MISSING_AUTHENTICATION',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    const encodedPath = this.config.path.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(this.config.branch)}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VIP-Tracker',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
    } catch (networkErr) {
      throw new GitHubTrackerRepositoryError(
        `Network error fetching ${this.config.path} from ${this.config.owner}/${this.config.repo}: ${sanitizeErrorText(networkErr instanceof Error ? networkErr.message : String(networkErr))}`,
        {
          code: 'NETWORK_ERROR',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
          cause: networkErr,
        }
      );
    }

    if (!response.ok) {
      const status = response.status;
      let isRateLimit = false;
      const rateLimitRemaining = response.headers?.get?.('x-ratelimit-remaining');
      if (rateLimitRemaining === '0' || status === 429) {
        isRateLimit = true;
      }

      let responseText = '';
      try {
        responseText = await response.text();
        if (/rate limit/i.test(responseText)) {
          isRateLimit = true;
        }
      } catch {
        // Ignore response text read errors
      }

      let code: GitHubTrackerErrorCode = 'NETWORK_ERROR';
      let message = `GitHub request failed with HTTP ${status}`;

      if (status === 401) {
        code = 'AUTHENTICATION_FAILED';
        message = `Authentication failed for repository ${this.config.owner}/${this.config.repo} (HTTP 401).`;
      } else if (status === 403) {
        if (isRateLimit) {
          code = 'RATE_LIMITED';
          message = `GitHub API rate limit exceeded for ${this.config.owner}/${this.config.repo} (HTTP 403).`;
        } else {
          code = 'AUTHORIZATION_FAILED';
          message = `Access forbidden to repository ${this.config.owner}/${this.config.repo} (HTTP 403).`;
        }
      } else if (status === 404) {
        code = 'NOT_FOUND';
        message = `Repository or file not found: ${this.config.owner}/${this.config.repo}/${this.config.path} on branch ${this.config.branch} (HTTP 404).`;
      }

      throw new GitHubTrackerRepositoryError(message, {
        code,
        status,
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GitHubTrackerRepositoryError(
        `Failed to parse JSON response from GitHub for ${this.config.path}.`,
        {
          code: 'MALFORMED_RESPONSE',
          status: response.status,
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new GitHubTrackerRepositoryError(
        `Malformed GitHub response for ${this.config.path}: expected file contents object.`,
        {
          code: 'MALFORMED_RESPONSE',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    const fileResp = payload as Partial<GitHubFileContentResponse>;

    if (fileResp.type !== 'file') {
      throw new GitHubTrackerRepositoryError(
        `Resource at ${this.config.path} is not a file (type: ${fileResp.type ?? 'unknown'}).`,
        {
          code: 'UNSUPPORTED_ENCODING',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    if (fileResp.encoding !== 'base64') {
      throw new GitHubTrackerRepositoryError(
        `Unsupported content encoding for ${this.config.path}: ${fileResp.encoding ?? 'none'}.`,
        {
          code: 'UNSUPPORTED_ENCODING',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    if (typeof fileResp.content !== 'string' || !fileResp.content.trim()) {
      throw new GitHubTrackerRepositoryError(
        `GitHub response for ${this.config.path} contains empty or missing content.`,
        {
          code: 'MALFORMED_RESPONSE',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    if (typeof fileResp.sha !== 'string' || !fileResp.sha) {
      throw new GitHubTrackerRepositoryError(
        `GitHub response for ${this.config.path} is missing file SHA.`,
        {
          code: 'MALFORMED_RESPONSE',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    let decodedContent: string;
    try {
      decodedContent = decodeGitHubBase64(fileResp.content);
    } catch (decodeErr) {
      throw new GitHubTrackerRepositoryError(
        `Failed to decode Base64 file content: ${decodeErr instanceof Error ? decodeErr.message : String(decodeErr)}`,
        {
          code: 'INVALID_BASE64',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
          cause: decodeErr,
        }
      );
    }

    return {
      decodedContent,
      sha: fileResp.sha,
      path: this.config.path,
      branch: this.config.branch,
    };
  }

  async updateFileContents(options: GitHubUpdateFileOptions): Promise<GitHubUpdateFileResult> {
    if (!this.fetchFn) {
      throw new GitHubTrackerRepositoryError('Fetch API is not available in current environment.', {
        code: 'NETWORK_ERROR',
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      });
    }

    if (!options.expectedSha || !options.expectedSha.trim()) {
      throw new GitHubTrackerRepositoryError(
        'File update requires expected blob SHA for optimistic concurrency.',
        {
          code: 'VALIDATION_FAILURE',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    let token: string | null = null;
    if (this.tokenProvider) {
      try {
        token = await this.tokenProvider();
      } catch (err) {
        throw new GitHubTrackerRepositoryError(
          `Token provider failed: ${sanitizeErrorText(err instanceof Error ? err.message : String(err))}`,
          {
            code: 'MISSING_AUTHENTICATION',
            owner: this.config.owner,
            repo: this.config.repo,
            path: this.config.path,
            branch: this.config.branch,
          }
        );
      }
    }

    if (this.requireAuth && (!token || token.trim() === '')) {
      throw new GitHubTrackerRepositoryError(
        `Authentication token is required to update repository ${this.config.owner}/${this.config.repo}.`,
        {
          code: 'MISSING_AUTHENTICATION',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    const encodedPath = this.config.path.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/contents/${encodedPath}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'VIP-Tracker',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const base64Content = encodeGitHubBase64(options.content);

    const requestBody = {
      message: options.commitMessage,
      content: base64Content,
      sha: options.expectedSha.trim(),
      branch: this.config.branch,
    };

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (networkErr) {
      throw new GitHubTrackerRepositoryError(
        `Network error updating ${this.config.path} in ${this.config.owner}/${this.config.repo}: ${sanitizeErrorText(networkErr instanceof Error ? networkErr.message : String(networkErr))}`,
        {
          code: 'NETWORK_ERROR',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
          cause: networkErr,
        }
      );
    }

    if (!response.ok) {
      const status = response.status;
      let isRateLimit = false;
      const rateLimitRemaining = response.headers?.get?.('x-ratelimit-remaining');
      if (rateLimitRemaining === '0' || status === 429) {
        isRateLimit = true;
      }

      let responseText = '';
      try {
        responseText = await response.text();
        if (/rate limit/i.test(responseText)) {
          isRateLimit = true;
        }
      } catch {
        // Ignore response text read errors
      }

      let code: import('./githubErrors').GitHubTrackerErrorCode = 'NETWORK_ERROR';
      let message = `GitHub request failed with HTTP ${status}`;

      if (status === 409) {
        code = 'REVISION_CONFLICT';
        message = `Revision conflict: ${this.config.path} on branch ${this.config.branch} has been modified by another commit or user (HTTP 409).`;
      } else if (status === 401) {
        code = 'AUTHENTICATION_FAILED';
        message = `Authentication failed for repository ${this.config.owner}/${this.config.repo} (HTTP 401).`;
      } else if (status === 403) {
        if (isRateLimit) {
          code = 'RATE_LIMITED';
          message = `GitHub API rate limit exceeded for ${this.config.owner}/${this.config.repo} (HTTP 403).`;
        } else {
          code = 'AUTHORIZATION_FAILED';
          message = `Access forbidden to repository ${this.config.owner}/${this.config.repo} (HTTP 403).`;
        }
      } else if (status === 404) {
        code = 'NOT_FOUND';
        message = `Repository or file not found: ${this.config.owner}/${this.config.repo}/${this.config.path} on branch ${this.config.branch} (HTTP 404).`;
      } else if (status === 422) {
        code = 'VALIDATION_FAILURE';
        message = `GitHub rejected file update for ${this.config.path} (HTTP 422): ${sanitizeErrorText(responseText)}`;
      }

      throw new GitHubTrackerRepositoryError(message, {
        code,
        status,
        owner: this.config.owner,
        repo: this.config.repo,
        path: this.config.path,
        branch: this.config.branch,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GitHubTrackerRepositoryError(
        `Failed to parse JSON response from GitHub for ${this.config.path} update.`,
        {
          code: 'MALFORMED_RESPONSE',
          status: response.status,
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new GitHubTrackerRepositoryError(
        `Malformed GitHub response for ${this.config.path} update: expected object.`,
        {
          code: 'MALFORMED_RESPONSE',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    const payloadObj = payload as { content?: { sha?: string }; commit?: { sha?: string } };
    const newSha = payloadObj?.content?.sha;
    if (typeof newSha !== 'string' || !newSha) {
      throw new GitHubTrackerRepositoryError(
        `GitHub update response for ${this.config.path} is missing updated file SHA.`,
        {
          code: 'MALFORMED_RESPONSE',
          owner: this.config.owner,
          repo: this.config.repo,
          path: this.config.path,
          branch: this.config.branch,
        }
      );
    }

    return {
      newSha,
      commitSha: payloadObj.commit?.sha,
      branch: this.config.branch,
      path: this.config.path,
    };
  }
}
