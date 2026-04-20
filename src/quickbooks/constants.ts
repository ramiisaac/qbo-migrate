/**
 * Shared constants for QBO migration configuration defaults and limits.
 */

/** Default number of records per batch create call. */
export const DEFAULT_BATCH_SIZE = 30;

/** Default concurrency for parallel write operations. */
export const DEFAULT_CONCURRENCY = 5;

/** Default delay (ms) between write batches to avoid API throttling. */
export const DEFAULT_WRITE_DELAY_MS = 300;

/** Default number of retries for transient API errors. */
export const DEFAULT_RETRIES = 3;

/** Default base delay (ms) for exponential backoff between retries. */
export const DEFAULT_RETRY_BASE_DELAY_MS = 500;

/** Read-only fields automatically stripped from payloads before create. */
export const READ_ONLY_FIELDS = ['MetaData', 'SyncToken', 'domain', 'sparse'] as const;

/** Maximum string length before truncation in sanitized payloads. */
export const MAX_PAYLOAD_STRING_LENGTH = 1000;

/** Truncated string preview length. */
export const TRUNCATED_PREVIEW_LENGTH = 200;

/**
 * Default entity processing order.
 * Ordered to respect referential dependencies (e.g. Account before Invoice).
 */
export const DEFAULT_ENTITIES_ORDER: readonly string[] = [
  'Account',
  'Department',
  'Class',
  'Vendor',
  'Customer',
  'Item',
  'Employee',
  'Term',
  'Invoice',
  'SalesReceipt',
  'Payment',
  'Purchase',
  'PurchaseOrder',
  'Bill',
  'BillPayment',
  'JournalEntry',
  'RefundReceipt',
  'CreditMemo',
  'TimeActivity',
] as const;
