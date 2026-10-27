export type GitHubTrackerErrorCode =
  | 'MISSING_AUTHENTICATION'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED_ENCODING'
  | 'MALFORMED_RESPONSE'
  | 'INVALID_BASE64'
  | 'INVALID_JSON'
  | 'INCOMPATIBLE_SCHEMA'
  | 'VALIDATION_FAILURE'
  | 'NETWORK_ERROR'
  | 'REVISION_CONFLICT'
  | 'READ_ONLY_OPERATION';

export interface GitHubTrackerErrorDetails {
  code: GitHubTrackerErrorCode;
  status?: number;
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;
  cause?: unknown;
}

/**
 * Sanitizes any potential credential patterns from error messages.
 */
export function sanitizeErrorText(text: string): string {
  if (!text) return '';
  return text
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED]')
    .replace(/(token|secret|password|key)[:=]\s*["']?[A-Za-z0-9_.-]+["']?/gi, '$1=[REDACTED]');
}

/**
 * Typed, sanitized domain error representing GitHub tracker repository failures.
 * Guarantees no sensitive tokens or raw credential headers are exposed.
 */
export class GitHubTrackerRepositoryError extends Error {
  readonly code: GitHubTrackerErrorCode;
  readonly status?: number;
  readonly owner?: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly path?: string;

  constructor(message: string, details: GitHubTrackerErrorDetails) {
    const sanitized = sanitizeErrorText(message);
    super(sanitized);
    this.name = 'GitHubTrackerRepositoryError';
    this.code = details.code;
    this.status = details.status;
    this.owner = details.owner;
    this.repo = details.repo;
    this.branch = details.branch;
    this.path = details.path;

    Object.setPrototypeOf(this, GitHubTrackerRepositoryError.prototype);
  }
}
