# qbo-migrate

Opinionated QuickBooks Online (QBO) data migration CLI.

Migrate core accounting entities from a source QBO company to a target company.

> **Status: pre-1.0.** The CLI, retries, batching, rate limiting, and reporting are stable. Core migration logic is still in progress — in particular, `*Ref` ID remapping, OAuth2 token refresh, and full pagination are not yet implemented. Today the tool is reliable for dry-runs and for migrating reference data (`Account`, `Class`, `Department`, `Term`). Transactional entities (`Invoice`, `Bill`, `Payment`, etc.) will write with source-scoped references and should be used only against disposable targets. See [`docs/qbo-migration.md`](docs/qbo-migration.md#current-status-and-reliability) for the full list of known blockers and per-entity reliability notes. If you need a faithful copy of a QBO Advanced company today, consider Intuit's built-in Company Copy feature.

Features:

- Configurable batching and concurrency
- Automatic retries with exponential backoff for transient failures and 429s
- Rate limiting to stay within QBO API quotas
- Dry-run mode -- enumerate what would be created without writing
- Structured JSON report (fetch and write stats per entity, with errors)
- Dependency-friendly entity ordering (foundation for upcoming ID remapping)
- Sensitive value masking in logs
- Single command: `qbo:migrate`

## Install

```bash
npm install -g qbo-migrate
```

Or run on demand:

```bash
npx qbo-migrate qbo:migrate --help
```

## Quick Start

1. Create a credentials JSON file (or use env vars / CLI flags):

```jsonc
// qbo-creds.json
{
  "source": {
    "clientId": "SRC_CLIENT_ID",
    "clientSecret": "SRC_CLIENT_SECRET",
    "accessToken": "SRC_ACCESS_TOKEN",
    "refreshToken": "SRC_REFRESH_TOKEN",
    "realmId": "123456789012345",
  },
  "target": {
    "clientId": "TGT_CLIENT_ID",
    "clientSecret": "TGT_CLIENT_SECRET",
    "accessToken": "TGT_ACCESS_TOKEN",
    "refreshToken": "TGT_REFRESH_TOKEN",
    "realmId": "987654321098765",
  },
}
```

2. Dry-run (fetch only, no writes) — inspect what exists in the source:

```bash
qbo-migrate qbo:migrate \
  --credentials-file ./qbo-creds.json \
  --dry-run \
  --report ./dry-run.json
```

3. Migrate the entities that are currently reliable:

```bash
qbo-migrate qbo:migrate \
  --credentials-file ./qbo-creds.json \
  --include Account,Class,Department,Term \
  --report ./report.json
```

For transactional entities (`Invoice`, `Bill`, `Payment`, etc.), read the [current status and reliability](docs/qbo-migration.md#current-status-and-reliability) section before writing to a non-disposable target.

## Command

```bash
qbo-migrate qbo:migrate [options]
```

Key options (full list: `qbo-migrate qbo:migrate --help`):

| Option                      | Description                                                |
| --------------------------- | ---------------------------------------------------------- |
| `--credentials-file <path>` | Path to JSON credentials file                              |
| `--source-client-id <id>`   | Source OAuth2 client ID (also via `QBO_SRC_CLIENT_ID`)     |
| `--target-realm <id>`       | Target company/realm ID (also via `QBO_TGT_REALM`)         |
| `--include <list>`          | Comma-separated entity allowlist (e.g. `Customer,Invoice`) |
| `--exclude <list>`          | Comma-separated entity blocklist                           |
| `--batch-size <n>`          | Records per write batch (default 30)                       |
| `--concurrency <n>`         | Parallel create operations (default 5)                     |
| `--write-delay <ms>`        | Delay between batches in ms (default 300)                  |
| `--dry-run`                 | Fetch only, no writes                                      |
| `--fail-fast`               | Stop after first entity write failure                      |
| `--sandbox`                 | Use QBO sandbox for both source and target                 |
| `--report <path>`           | Write JSON report (default `.qbo-migration-report.json`)   |
| `--debug`                   | Enable verbose debug logging                               |

### Exit Codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 0    | Success (or dry-run success)         |
| 1    | Unexpected failure                   |
| 2    | Validation / missing credentials     |
| 4    | Partial failure (some writes failed) |

## Credentials Sources

Priority: CLI flags → credentials file → environment variables.

Environment variable names:

| Source                  | Target                  |
| ----------------------- | ----------------------- |
| `QBO_SRC_CLIENT_ID`     | `QBO_TGT_CLIENT_ID`     |
| `QBO_SRC_CLIENT_SECRET` | `QBO_TGT_CLIENT_SECRET` |
| `QBO_SRC_ACCESS_TOKEN`  | `QBO_TGT_ACCESS_TOKEN`  |
| `QBO_SRC_REFRESH_TOKEN` | `QBO_TGT_REFRESH_TOKEN` |
| `QBO_SRC_REALM`         | `QBO_TGT_REALM`         |

Required per company: `clientId`, `clientSecret`, `accessToken`, `realmId`. Target credentials are optional when using `--dry-run`. `refreshToken` is accepted for forward compatibility but is not currently used — automatic token refresh is a Phase 1 blocker (see [`docs/qbo-migration.md`](docs/qbo-migration.md#access-token-lifetime)). Until it ships, obtain a fresh access token before each run.

## Report

The JSON report written to `--report` path:

```jsonc
{
  "startedAt": "2026-04-15T12:00:00.000Z",
  "finishedAt": "2026-04-15T12:00:05.123Z",
  "durationMs": 5123,
  "dryRun": false,
  "fetch": [{ "entity": "Customer", "count": 150, "items": [] }],
  "write": [
    {
      "entity": "Customer",
      "attempted": 150,
      "created": 148,
      "failed": 2,
      "errors": [
        { "index": 47, "message": "Duplicate Name Exists Error", "payload": { "DisplayName": "Acme" } },
      ],
    },
  ],
  "failures": 2,
  "success": false,
}
```

`fetch[].items` is intentionally empty in the written report; items are held in memory only during the run. See the [report schema](docs/qbo-migration.md#report-schema) for full field semantics.

## Limitations

Current (pre-1.0) blockers — tracked for fix before 1.0:

- **ID remapping not implemented.** `*Ref` fields in created records still point at source-company IDs. Any entity that references another entity (invoices → customers, bills → vendors, etc.) will fail or link incorrectly in the target.
- **Line-item reference rewriting not implemented.** `Line[].*Ref` is untouched, affecting `Invoice`, `Bill`, `CreditMemo`, `JournalEntry`, `Purchase`, and related entities.
- **OAuth2 token refresh not implemented.** Access tokens expire after ~60 minutes; longer runs will fail mid-way.
- **Pagination relies on the library's `fetchAll: true` option.** Entities with >1000 records may be partially fetched.
- **`TimeActivity` method name is wrong** (pluralization heuristic bug); the entity silently reports 0 records.
- **No system-account dedup.** QBO auto-creates system accounts in every new company; `createAccount` for those returns `Duplicate Name Exists Error`.

Out of scope (permanent):

- No incremental or delta mode; the tool always treats the target as empty.
- Attachments, reconciliation state, payroll, recurring transactions, budgets, and audit history are not supported.
- Rate limiting uses a fixed token bucket; adaptive adjustment (honoring `Retry-After`) is not planned for 1.0.

See [`docs/qbo-migration.md`](docs/qbo-migration.md#known-blockers-before-a-faithful-end-to-end-migration) for the full table with severity notes and workarounds.

## Development

```bash
pnpm install
pnpm test          # vitest (unit + E2E)
pnpm run type-check
pnpm run lint
pnpm run build
```

Entrypoint: `src/cli/index.ts` • Provider: `src/providers/qbo.ts` • Service: `src/quickbooks/migration-service.ts`

## License

MIT © Rami Isaac

---

See [`docs/qbo-migration.md`](docs/qbo-migration.md) for advanced usage and troubleshooting.
