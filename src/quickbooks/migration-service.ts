import { logger } from '../utils/log.js';
import type {
  QboMigrationOptions,
  QboMigrationReport,
  QboEntityFetchResult,
  QboEntityWriteResult,
} from './migration-types.js';
import type { QboDataProvider, UnknownRecord } from '../providers/types.js';
import { QboProvider } from '../providers/qbo.js';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_WRITE_DELAY_MS,
  DEFAULT_ENTITIES_ORDER,
} from './constants.js';
// Re-export for backward compatibility
export type { UnknownRecord } from '../providers/types.js';

/**
 * Orchestrates a full entity migration from a source QBO company to a target.
 *
 * Entities are processed in dependency order (accounts before invoices, etc.).
 * Supports dry-run mode, batched writes with configurable concurrency,
 * and produces a structured {@link QboMigrationReport} on completion.
 */
export class QboMigrationService {
  private readonly options: Required<
    Omit<QboMigrationOptions, 'includeEntities' | 'excludeEntities'>
  > & {
    includeEntities?: string[];
    excludeEntities?: string[];
  };

  private report: QboMigrationReport;

  constructor(opts: QboMigrationOptions) {
    this.options = {
      dryRun: opts.dryRun ?? false,
      batchSize: opts.batchSize ?? DEFAULT_BATCH_SIZE,
      failFast: opts.failFast ?? false,
      concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
      writeDelayMs: opts.writeDelayMs ?? DEFAULT_WRITE_DELAY_MS,
      source: opts.source,
      target: opts.target,
      includeEntities: opts.includeEntities,
      excludeEntities: opts.excludeEntities,
    } as const;

    this.report = {
      startedAt: new Date().toISOString(),
      dryRun: this.options.dryRun,
      fetch: [],
      write: [],
      failures: 0,
      success: false,
    };
  }

  getReport(): QboMigrationReport {
    return this.report;
  }

  private resolveEntityList(): string[] {
    let list: readonly string[] = this.options.includeEntities?.length
      ? this.options.includeEntities
      : DEFAULT_ENTITIES_ORDER;
    if (this.options.excludeEntities?.length) {
      const excluded = new Set(this.options.excludeEntities);
      list = list.filter(e => !excluded.has(e));
    }
    return [...list];
  }

  async migrate(providers?: {
    source?: QboDataProvider;
    target?: QboDataProvider;
  }): Promise<QboMigrationReport> {
    const entities = this.resolveEntityList();
    logger.info(`QBO Migration starting. Entities: ${entities.join(', ')}`);
    const sourceProvider =
      providers?.source || new QboProvider(this.options.source, this.options.source.debug);
    const targetProvider =
      providers?.target || new QboProvider(this.options.target, this.options.target.debug);

    for (const entity of entities) {
      logger.startSpinner(`${entity}: fetching…`);
      const fetchRes = await this.fetchAll(sourceProvider, entity);
      if (fetchRes.error) {
        logger.stopSpinner(false, `${entity}: fetch failed — ${fetchRes.error}`);
      } else {
        logger.stopSpinner(true, `${entity}: fetched ${fetchRes.count}`);
      }
      this.report.fetch.push(fetchRes);
      if (this.options.dryRun) continue;
      if (fetchRes.items.length === 0) {
        this.report.write.push({ entity, attempted: 0, created: 0, failed: 0 });
        continue;
      }
      logger.startSpinner(`${entity}: writing 0/${fetchRes.count}…`);
      const writeRes = await this.writeAll(
        targetProvider,
        entity,
        fetchRes.items as UnknownRecord[],
        fetchRes.count
      );
      if (writeRes.failed > 0) {
        logger.stopSpinner(
          false,
          `${entity}: ${writeRes.created} created, ${writeRes.failed} failed`
        );
      } else {
        logger.stopSpinner(true, `${entity}: created ${writeRes.created}`);
      }
      this.report.write.push(writeRes);
      if (this.options.failFast && writeRes.failed > 0) {
        logger.error(`Fail-fast triggered after errors in entity ${entity}`);
        break;
      }
    }

    this.report.finishedAt = new Date().toISOString();
    this.report.durationMs =
      new Date(this.report.finishedAt).getTime() - new Date(this.report.startedAt).getTime();
    this.report.failures = this.report.write.reduce((acc, w) => acc + w.failed, 0);
    this.report.success = this.report.failures === 0;
    // Strip raw items from fetch entries before returning — they were retained
    // in-memory only to feed the write phase. Keeping them in the serialized
    // report risks huge files and PII leakage.
    this.report.fetch = this.report.fetch.map(f => ({
      entity: f.entity,
      count: f.count,
      items: [],
      ...(f.skipped !== undefined ? { skipped: f.skipped } : {}),
      ...(f.error ? { error: f.error } : {}),
    }));
    return this.report;
  }

  private async fetchAll(provider: QboDataProvider, entity: string): Promise<QboEntityFetchResult> {
    const result = await provider.fetchAll(entity);
    return { entity, count: result.items.length, items: result.items, error: result.error };
  }

  private async writeAll(
    provider: QboDataProvider,
    entity: string,
    items: UnknownRecord[],
    total: number
  ): Promise<QboEntityWriteResult> {
    if (items.length === 0) return { entity, attempted: 0, created: 0, failed: 0 };
    const res = await provider.batchCreate(
      entity,
      items,
      this.options.batchSize,
      this.options.writeDelayMs,
      this.options.failFast,
      this.options.concurrency,
      p => {
        logger.updateSpinner(
          `${entity}: ${p.created}/${total} created${p.failed ? ` (${p.failed} failed)` : ''}…`
        );
      }
    );
    return res;
  }

  // sanitize & delay moved to provider; keep minimal helpers if needed (none currently)
}
