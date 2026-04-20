import { logger } from '../utils/log.js';
import { rateLimiters } from '../utils/rate-limiter.js';
import { maskValue } from '../utils/masking.js';
import type { QboAuthConfig, QboEntityWriteResult } from '../quickbooks/migration-types.js';
import type { QboDataProvider, BatchProgress, UnknownRecord, QboCreateResult } from './types.js';
import {
  DEFAULT_RETRIES,
  DEFAULT_RETRY_BASE_DELAY_MS,
  READ_ONLY_FIELDS,
  MAX_PAYLOAD_STRING_LENGTH,
  TRUNCATED_PREVIEW_LENGTH,
} from '../quickbooks/constants.js';
import pLimit from 'p-limit';

// Re-export shared types for backward compatibility
export type { QboCreateResult, UnknownRecord, BatchProgress, QboDataProvider } from './types.js';

interface RetryOptions {
  retries: number;
  baseDelay: number;
}

function isTransientError(err: unknown): boolean {
  const msg = String(err || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('429') ||
    msg.includes('rate')
  );
}

/**
 * Concrete QBO API provider backed by `node-quickbooks`.
 *
 * Handles lazy client initialization, automatic retries with exponential
 * backoff for transient errors (429 / timeout / network), rate-limiting,
 * and payload sanitization (removes read-only fields, truncates long values).
 */
type QboClientMethod = (...args: unknown[]) => unknown;
type QboClient = Record<string, QboClientMethod | undefined>;

export class QboProvider implements QboDataProvider {
  private cfg: QboAuthConfig;
  private clientPromise: Promise<QboClient> | null = null; // lazy
  private debug: boolean;
  private retry: RetryOptions = {
    retries: DEFAULT_RETRIES,
    baseDelay: DEFAULT_RETRY_BASE_DELAY_MS,
  };

  constructor(cfg: QboAuthConfig, debug = false) {
    this.cfg = cfg;
    this.debug = debug || Boolean(cfg.debug);
  }

  private async getClient(): Promise<QboClient> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        // dynamic import to avoid type/bundle issues
        const mod = await import('node-quickbooks');
        // commonjs interop: some bundlers expose the ctor on `.default`
        const QB = ((mod as { default?: unknown }).default ?? mod) as new (
          ...args: unknown[]
        ) => QboClient;
        const c = new QB(
          this.cfg.clientId,
          this.cfg.clientSecret,
          this.cfg.accessToken,
          false,
          this.cfg.realmId,
          this.cfg.useSandbox || false,
          this.cfg.debug || this.debug,
          this.cfg.minorVersion ?? null,
          '2.0',
          this.cfg.refreshToken
        );
        if (this.debug) {
          logger.debug(
            `Initialized QBO client realm=${this.cfg.realmId} sandbox=${this.cfg.useSandbox}`
          );
        }
        return c;
      })();
    }
    return this.clientPromise;
  }

  async fetchAll(entity: string): Promise<{ items: UnknownRecord[]; error?: string }> {
    const client = await this.getClient();
    const method = `find${entity}${entity.endsWith('s') ? 'es' : 's'}`;
    const fn = client[method];
    if (typeof fn !== 'function') {
      logger.warn(`QBO: method ${method} not found; skipping entity ${entity}`);
      return { items: [], error: `Method ${method} not found on QBO client` };
    }
    await rateLimiters.general.waitForToken();
    if (this.debug) logger.debug(`QBO fetchAll ${entity}`);
    return await new Promise(resolve => {
      try {
        fn.call(client, { fetchAll: true }, (err: unknown, data: unknown) => {
          if (err) {
            logger.error(`QBO fetch ${entity} failed: ${String(err)}`);
            return resolve({ items: [], error: String(err) });
          }
          if (!data) return resolve({ items: [] });
          if (Array.isArray(data)) return resolve({ items: data as UnknownRecord[] });
          const qr = (data as { QueryResponse?: Record<string, unknown> }).QueryResponse;
          if (qr) {
            const plural = entity.endsWith('s') ? entity : `${entity}s`;
            const arr = qr[plural];
            if (Array.isArray(arr)) return resolve({ items: arr as UnknownRecord[] });
          }
          resolve({ items: [] });
        });
      } catch (e) {
        logger.error(`QBO unexpected fetch error ${entity}: ${String(e)}`);
        resolve({ items: [], error: String(e) });
      }
    });
  }

  async create(entity: string, payload: UnknownRecord): Promise<QboCreateResult> {
    const client = await this.getClient();
    const method = `create${entity}`;
    const fn = client[method];
    if (typeof fn !== 'function') {
      return { success: false, error: `Method ${method} not found` };
    }

    const sanitized = this.stripReadOnlyFields(payload);
    for (let attempt = 0; attempt <= this.retry.retries; attempt++) {
      await rateLimiters.general.waitForToken();
      try {
        const result = await new Promise<{ id?: string }>((resolve, reject) => {
          fn.call(client, sanitized, (err: unknown, created: unknown) => {
            if (err) return reject(err);
            const c = (created ?? {}) as { Id?: string; id?: string };
            resolve({ id: c.Id || c.id });
          });
        });
        return { success: true, id: result.id };
      } catch (err) {
        const transient = isTransientError(err);
        if (this.debug)
          logger.debug(
            `QBO create ${entity} attempt ${attempt + 1} failed transient=${transient}: ${String(err)}`
          );
        if (!transient || attempt === this.retry.retries) {
          return { success: false, error: String(err) };
        }
        const delay = this.retry.baseDelay * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    return { success: false, error: 'Unknown failure' };
  }

  async batchCreate(
    entity: string,
    items: UnknownRecord[],
    batchSize: number,
    delayMs: number,
    failFast: boolean,
    concurrency = 5,
    progressCb?: (p: BatchProgress) => void
  ): Promise<QboEntityWriteResult> {
    let created = 0;
    const errors: QboEntityWriteResult['errors'] = [];
    const limiter = pLimit(concurrency);

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(
        batch.map((rec, idx) =>
          limiter(async () => {
            const res = await this.create(entity, rec);
            if (res.success) {
              created += 1;
            } else {
              errors.push({
                index: i + idx,
                message: res.error || 'Unknown',
                payload: this.sanitizeForLog(rec),
              });
              if (failFast) return; // allow others to settle
            }
            progressCb?.({ entity, created, failed: errors.length, attempted: i + idx + 1 });
          })
        )
      );
      if (failFast && errors.length > 0) break;
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }

    return {
      entity,
      attempted: items.length,
      created,
      failed: errors.length,
      errors: errors.length ? errors : undefined,
    };
  }

  /**
   * Strip read-only fields before sending to QBO API.
   * Does NOT truncate values — data is sent as-is.
   */
  stripReadOnlyFields(payload: UnknownRecord): UnknownRecord {
    const out: UnknownRecord = { ...payload };
    for (const field of READ_ONLY_FIELDS) {
      delete out[field];
    }
    return out;
  }

  /**
   * Sanitize a payload for safe inclusion in logs / error reports.
   * Strips read-only fields AND truncates long string values.
   */
  sanitizeForLog(payload: UnknownRecord): UnknownRecord {
    const out: UnknownRecord = {};
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === 'string') {
        out[k] =
          v.length > MAX_PAYLOAD_STRING_LENGTH
            ? `${v.slice(0, TRUNCATED_PREVIEW_LENGTH)}…<truncated>`
            : v;
      } else {
        out[k] = v;
      }
    }
    for (const field of READ_ONLY_FIELDS) {
      delete out[field];
    }
    return out;
  }

  maskConfig(): Record<string, unknown> {
    return {
      realmId: this.cfg.realmId,
      clientId: maskValue(this.cfg.clientId, 6),
      clientSecret: maskValue(this.cfg.clientSecret, 6),
      accessToken: maskValue(this.cfg.accessToken, 6),
      refreshToken: maskValue(this.cfg.refreshToken, 6),
      sandbox: this.cfg.useSandbox,
    };
  }
}
