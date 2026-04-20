# qbo-migrate — Usage Reference

Deep-dive reference for the `qbo:migrate` command. For install, quick-start, and a flag summary, see the [README](../README.md). This document covers credential setup, current tool reliability, the full report schema, security guidance, and troubleshooting.

---

## Current status and reliability

`qbo-migrate` is pre-1.0. The plumbing (CLI, retries, batching, rate limiting, reports) is stable, but several pieces of core migration logic are still in progress. Read this section before pointing the tool at data you care about.

### Known blockers before a faithful end-to-end migration

| Area                                                     | Status                   | Impact                                                                                                  |
| -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| ID remapping (`sourceId` → `targetId` for `*Ref` fields) | Not implemented          | Any entity that references another entity will fail or link to the wrong target record                  |
| OAuth2 access-token refresh                              | Not implemented          | Runs longer than ~55 minutes will fail with `AuthenticationFailed`                                      |
| Pagination beyond the library's `fetchAll: true` option  | Not implemented          | Entities with >1000 records may be partially fetched                                                    |
| Entity pluralization heuristic                           | Wrong for `TimeActivity` | `TimeActivity` silently fetches zero records (method name mismatch)                                     |
| System-account / default-term dedup in target            | Not implemented          | Target companies auto-create system accounts; creating duplicates returns `Duplicate Name Exists Error` |
| Line-item reference rewriting (`Line[].*Ref`)            | Not implemented          | Invoices, bills, journal entries write with source-scoped line references                               |
| `useProduction` constructor argument                     | Hardcoded                | Behavior matches OAuth 2.0 expectations but the naming is misleading; verify before production use      |

Roadmap and sequencing are tracked in the project's internal task file. The short version: ID remapping, token refresh, and proper pagination are the next three landings on the path to 1.0.

### What works today

Reliable for production data:

- **Reference/list entities with few or no cross-references:** `Account` (modulo the system-account dedup issue — works on a truly blank target), `Class`, `Department`, `Term`, `PaymentMethod`.
- **Dry-run mode for any entity.** Fetch counts are accurate for small-to-medium companies (subject to the pagination caveat for large ones).
- **Single-entity seeding** of a new sandbox or test company.

Not yet reliable; use only for experimentation on disposable targets:

- `Customer`, `Vendor`, `Item` (parent/account refs will be wrong).
- `Invoice`, `SalesReceipt`, `CreditMemo`, `RefundReceipt`, `Payment`, `Bill`, `BillPayment`, `Purchase`, `PurchaseOrder`, `JournalEntry` (cross-entity and line-item refs will be wrong).
- `TimeActivity` (broken method name — always reports 0 records).
- `Employee` (will create, but payroll linkage is out of scope).

If you need a faithful copy of a real QBO company today and you are on QuickBooks Online Advanced, Intuit's built-in **Company Copy** feature is the right choice. Use `qbo-migrate` when Company Copy isn't available (different subscription tier, different primary admin) or when you need a scriptable, dry-run-first workflow.

---

## Credentials

The CLI accepts credentials from three sources with the following priority:

1. CLI flags (e.g. `--source-access-token`)
2. Credentials JSON file (`--credentials-file <path>`)
3. Environment variables

Source credentials are always required. Target credentials are required unless `--dry-run` is set.

For flag names and environment variable names, see the [Credentials Sources](../README.md#credentials-sources) table in the README.

### Credentials file format

```json
{
  "source": {
    "clientId": "...",
    "clientSecret": "...",
    "accessToken": "...",
    "refreshToken": "...",
    "realmId": "1234567890",
    "useSandbox": true
  },
  "target": {
    "clientId": "...",
    "clientSecret": "...",
    "accessToken": "...",
    "refreshToken": "...",
    "realmId": "0987654321",
    "useSandbox": true
  }
}
```

Restrict permissions on any file containing tokens:

```bash
chmod 600 qbo-creds.json
```

### Field notes

| Field                      | Required | Notes                                                                                                            |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `clientId`, `clientSecret` | Yes      | OAuth2 app credentials from the Intuit developer portal.                                                         |
| `accessToken`              | Yes      | Short-lived (~1 hour). See "Access token lifetime" below.                                                        |
| `refreshToken`             | No       | Accepted for forward compatibility. Not currently used — automatic token refresh is planned but not implemented. |
| `realmId`                  | Yes      | The QBO company ID. Displayed in the developer sandbox dashboard, or returned with the OAuth callback.           |
| `useSandbox`               | No       | Routes API calls to `sandbox-quickbooks.api.intuit.com` instead of the production host.                          |

### Access token lifetime

QuickBooks Online access tokens expire roughly 60 minutes after issue. Until automatic refresh lands, you must:

- For short runs (small companies, single-entity migrations), just obtain a fresh access token from the Intuit OAuth Playground or your own OAuth flow immediately before running.
- For longer runs, be prepared for a mid-run `AuthenticationFailed` error. The current retry loop will classify this as transient and exhaust retries against it. Expect the affected entity and all subsequent entities in the same run to report write failures until the tool exits.

This is tracked as a Phase 1 blocker.

---

## Workflows

### Dry run first, always

A dry run fetches from source, counts per entity, and writes a report without touching the target company. This is the recommended first step against any new source:

```bash
qbo-migrate qbo:migrate \
  --credentials-file ./qbo-creds.json \
  --dry-run \
  --report ./dry-run.json
```

Inspect `dry-run.json`, confirm entity counts match your expectations, then re-run without `--dry-run` once you've decided which entities to migrate. Use `--include` to limit to the entities that are currently reliable (see the "What works today" section above).

### Narrowing the entity set

```bash
# Only reference data (currently reliable)
qbo-migrate qbo:migrate \
  --credentials-file ./qbo-creds.json \
  --include Account,Class,Department,Term \
  --report ./reference-data.json

# Everything except transactional entities
qbo-migrate qbo:migrate \
  --credentials-file ./qbo-creds.json \
  --exclude Invoice,Bill,Payment,BillPayment,JournalEntry \
  --report ./non-transactional.json
```

`--include` wins if both are provided.

### Tuning throughput

Default settings (`--batch-size 30 --concurrency 5 --write-delay 300`) are conservative. For large, low-complexity entities you can raise throughput; for transactional entities with heavy validation, lower it.

```bash
qbo-migrate qbo:migrate \
  --credentials-file ./qbo-creds.json \
  --batch-size 50 \
  --concurrency 8 \
  --write-delay 200
```

If you see 429 responses in the report, reverse course: lower `--concurrency` first, then raise `--write-delay`. Adaptive rate limiting (honoring `Retry-After`) is planned but not implemented; you must tune manually today.

### Fail-fast for diagnosis

When debugging which entity is failing and why, stop at the first failure:

```bash
qbo-migrate qbo:migrate \
  --credentials-file ./qbo-creds.json \
  --fail-fast \
  --debug \
  --report ./debug-run.json
```

`--debug` masks tokens but keeps request/response context in the log output, which is useful paired with `--fail-fast` for one-at-a-time diagnosis.

---

## Entity processing order

Entities are processed in a dependency-friendly order declared in `src/quickbooks/constants.ts`:

```
Account, Department, Class, Vendor, Customer, Item, Employee, Term,
Invoice, SalesReceipt, Payment, Purchase, PurchaseOrder, Bill,
BillPayment, JournalEntry, RefundReceipt, CreditMemo, TimeActivity
```

Order matters for two reasons:

1. Referenced entities (accounts, customers, items) are created before the transactions that reference them — so that when ID remapping lands, dependents can look up freshly-recorded target IDs.
2. Ordering stabilizes behavior across runs: a dry-run of `Customer` before any real write always reflects the same logical step.

`--include` / `--exclude` preserve this order; they filter without reordering.

---

## Report schema

On every run (dry-run or real), a JSON report is written to `--report <path>` (default: `.qbo-migration-report.json`).

```jsonc
{
  "startedAt": "2026-04-15T12:00:00.000Z",
  "finishedAt": "2026-04-15T12:00:05.123Z",
  "durationMs": 5123,
  "dryRun": false,
  "fetch": [
    {
      "entity": "Customer",
      "count": 150,
      "items": [], // always empty in the written report; see note
      "skipped": 0, // optional
      "error": "...", // optional, present only on fetch failure
    },
  ],
  "write": [
    {
      "entity": "Customer",
      "attempted": 150,
      "created": 148,
      "failed": 2,
      "errors": [
        // optional, present only when failed > 0
        {
          "index": 47,
          "message": "Duplicate Name Exists Error",
          "payload": { "DisplayName": "Acme Corp" /* sanitized */ },
        },
      ],
    },
  ],
  "failures": 2,
  "success": false,
}
```

### Field notes

- **`fetch[].items` is intentionally empty** in the written report. The items are held in memory during the run to feed the write phase, then cleared before serialization to keep reports small and reduce PII exposure. Opt-in payload retention (via a `--verbose-report` flag) is planned.
- **`fetch[].error`** is set when the underlying library threw, or when the expected `find*` method is missing from the client. A `count` of `0` with no `error` means the source company genuinely has no records for that entity (or, in the `TimeActivity` case, the method-name bug is hiding them).
- **`write[].errors[].payload`** is the sanitized source record — string values longer than 1000 characters are truncated to a 200-character preview, and read-only fields (`MetaData`, `SyncToken`, `domain`, `sparse`) are stripped. This payload is safe to share in bug reports but may still contain business data; review before posting publicly.
- **`failures`** is the sum of `write[].failed` across all entities. Fetch errors are _not_ counted here — check `fetch[*].error` separately.
- **`success`** is `true` if and only if `failures === 0`. A run with `dryRun: true` that completed all fetches is considered successful even if some entities had fetch errors; check `fetch[*].error` explicitly for dry-run validation.

### Exit codes

For the authoritative list, see [Exit Codes](../README.md#exit-codes) in the README. In short: `0` success, `1` unexpected error, `2` validation / missing credentials, `4` completed with write failures.

---

## Security

### Token handling

- Never commit `.env` files, credentials JSON, or token values to source control. The repo's `.gitignore` covers `.env` and `.env.local` by default; any credentials file should live outside the repo or be explicitly gitignored.
- Prefer environment variables or a secret manager (GitHub Actions secrets, 1Password, AWS Secrets Manager, etc.) over on-disk files for CI and scheduled runs.
- Access tokens and client secrets are masked in log output (the first few characters are preserved for correlation; the remainder is elided). Do not disable masking.
- If a run prints a token in full anywhere, treat it as a bug and file an issue.

### Post-migration hygiene

- Rotate the source and target access tokens after any ad-hoc migration run. Long-lived tokens in shell history or CI logs are the most common leak vector.
- If you used `--debug`, review the captured logs for anything unexpected before archiving or sharing them.

### What the tool sends where

`qbo-migrate` talks only to Intuit's QuickBooks Online API (production or sandbox, depending on `--sandbox` / `useSandbox`). It does not phone home, collect telemetry, or transmit data anywhere else. You can audit this in `src/` — the only outbound calls are through `node-quickbooks`, which hits `*.api.intuit.com`.

---

## Troubleshooting

### `TimeActivity` reports 0 records

The current pluralization heuristic produces `findTimeActivitys`, but `node-quickbooks` exposes the method as `findTimeActivities`. The mismatch is logged as a warning (`method find<X> not found; skipping entity`) and the entity is reported with `count: 0`. Until the fix lands, exclude `TimeActivity` from your include list.

### Many writes fail with `Invalid Reference Id` or `Object Not Found`

You're hitting the ID remapping gap. The reference (`CustomerRef`, `ItemRef`, etc.) in the written record points at the source company's internal ID, which is meaningless in the target. Workarounds until Phase 1 ID remapping ships:

- Migrate only entities without cross-references (`Account`, `Class`, `Department`, `Term`).
- Use Intuit's Company Copy feature instead if both companies are on QBO Advanced.

### `Duplicate Name Exists Error` on `Account`

QBO auto-creates system accounts in every new company (Accounts Receivable, Undeposited Funds, Retained Earnings, Sales of Product Income, Opening Balance Equity, and others). `qbo-migrate` does not yet match-or-create against these; it attempts `createAccount` and QBO rejects. Workarounds:

- Inspect the target's system accounts before migration and exclude exact-name matches from your source by using `--exclude` and a separately-prepared import.
- Wait for Phase 1 dedup (`--dedup-strategy match-or-create`).

### `AuthenticationFailed` mid-run

Your access token expired. The tool currently treats this as a transient error and exhausts retries against it. Actions:

- Obtain a fresh access token (Intuit OAuth Playground, or your own OAuth callback flow).
- Re-run with the fresh token. If the previous run partially succeeded, the target company now has a subset of records — idempotency and resume are planned but not implemented, so currently you'd need either a fresh blank target or manual reconciliation.

### 429 responses / rate-limit errors

The default settings are conservative, but QBO's per-realm limits vary by tier. To reduce API pressure:

- Lower `--concurrency` (try `3`, then `2`).
- Raise `--write-delay` (try `500`, then `1000`).
- Narrow the entity set with `--include` and run entities in smaller groups.

### `Invalid realm` or authentication errors at startup

- Confirm the `realmId` matches the environment: sandbox realm IDs do not work against production and vice versa.
- Confirm `--sandbox` (or `useSandbox: true` in the credentials file) matches where the token was issued from.
- Confirm the `clientId` / `clientSecret` came from the same Intuit app that issued the `accessToken`.

### Report says `success: true` but I think records are missing

Check:

1. `fetch[*].count` against what you expect in the source.
2. `fetch[*].error` for any non-empty values (silent fetch failures).
3. Whether any entity had an unexpected `count: 0`. If it's `TimeActivity`, that's the known bug above.
4. Whether you hit a pagination ceiling (>1000 records for any entity suggests the `fetchAll: true` library behavior may have truncated).

---

## Further reading

- [README](../README.md) — install, quick start, flag summary.
- [Intuit QuickBooks Online API reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account) — canonical entity schemas and validation rules.
- [`node-quickbooks`](https://github.com/mcohen01/node-quickbooks) — the underlying client library this tool wraps.

For feature requests, limitations you've hit, or contributions, open an issue or PR on the repository.
