/** OAuth2 credentials for connecting to a QuickBooks Online company. */
export interface QboAuthConfig {
  /** OAuth2 client ID (consumer key). */
  clientId: string;
  /** OAuth2 client secret (consumer secret). */
  clientSecret: string;
  /** Short-lived OAuth2 access token. */
  accessToken: string;
  /** Refresh token for automatic token rotation. */
  refreshToken: string;
  /** QBO company/realm ID (identifies the source or target company). */
  realmId: string;
  /** Connect to the QBO sandbox environment instead of production. */
  useSandbox?: boolean;
  /** Enable verbose debug logging for API calls. */
  debug?: boolean;
  /** QBO API minor version override (e.g. 65). */
  minorVersion?: number | null;
}

/**
 * Configuration for a full migration run.
 * Source is the company to read from; target is the clean company to write into.
 */
export interface QboMigrationOptions {
  source: QboAuthConfig;
  /** Target company — assumed to be a new/clean account. */
  target: QboAuthConfig;
  /** If true, perform a dry run (just counts) */
  dryRun?: boolean;
  /** Maximum records per batch create */
  batchSize?: number;
  /** Stop after first error */
  failFast?: boolean;
  /** Explicit list of entity types to include (default: sensible ordered list) */
  includeEntities?: string[];
  /** Exclude list (applied after includeEntities) */
  excludeEntities?: string[];
  /** Concurrency for fetch operations */
  concurrency?: number;
  /** Optional delay between write batches (ms) to avoid throttle */
  writeDelayMs?: number;
}

/** Per-entity fetch result with the raw items array. */
export interface QboEntityFetchResult<T = unknown> {
  entity: string;
  count: number;
  items: T[];
  skipped?: number;
  /** Set when the fetch call threw or returned an error. */
  error?: string;
}

/** Per-entity write result including error details. */
export interface QboEntityWriteResult {
  entity: string;
  attempted: number;
  created: number;
  failed: number;
  errors?: Array<{ index: number; message: string; payload: Record<string, unknown> }>; // sanitized
}

/** Aggregate migration report written as JSON after a run. */
export interface QboMigrationReport {
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  dryRun: boolean;
  fetch: QboEntityFetchResult[];
  write: QboEntityWriteResult[];
  failures: number;
  success: boolean;
}
