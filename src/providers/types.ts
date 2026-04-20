/**
 * Shared provider types and interfaces for QBO migration.
 */

/** Generic record type used across providers. */
export type UnknownRecord = Record<string, unknown>;

/** Result of a single QBO entity create operation. */
export interface QboCreateResult {
  success: boolean;
  id?: string;
  error?: string;
}

/** Progress callback payload for batch operations. */
export interface BatchProgress {
  entity: string;
  created: number;
  failed: number;
  attempted: number;
}

/**
 * Minimal interface consumed by QboMigrationService.
 * Keeps the service decoupled from the concrete QboProvider.
 */
export interface QboDataProvider {
  fetchAll(entity: string): Promise<{ items: UnknownRecord[]; error?: string }>;
  batchCreate(
    entity: string,
    items: UnknownRecord[],
    batchSize: number,
    delayMs: number,
    failFast: boolean,
    concurrency?: number,
    progressCb?: (p: BatchProgress) => void
  ): Promise<import('../quickbooks/migration-types.js').QboEntityWriteResult>;
}
