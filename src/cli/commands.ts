import { Command } from 'commander';
import { logger } from '../utils/log.js';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_WRITE_DELAY_MS,
} from '../quickbooks/constants.js';
import type { QboAuthConfig, QboMigrationOptions } from '../quickbooks/migration-types.js';

// QuickBooks migration command only
export function addQboMigrateCommand(program: Command): void {
  program
    .command('qbo:migrate')
    .description(
      'Migrate ALL data from a source QuickBooks Online company to a target (clean) company'
    )
    .option('--source-client-id <id>', 'Source QBO OAuth2 client ID')
    .option('--source-client-secret <secret>', 'Source QBO OAuth2 client secret')
    .option('--source-access-token <token>', 'Source QBO access token')
    .option('--source-refresh-token <token>', 'Source QBO refresh token')
    .option('--source-realm <id>', 'Source QBO realm/company id')
    .option('--target-client-id <id>', 'Target QBO OAuth2 client ID')
    .option('--target-client-secret <secret>', 'Target QBO OAuth2 client secret')
    .option('--target-access-token <token>', 'Target QBO access token')
    .option('--target-refresh-token <token>', 'Target QBO refresh token')
    .option('--target-realm <id>', 'Target QBO realm/company id (clean account)')
    .option('--credentials-file <path>', 'Path to JSON credentials file containing source/target')
    .option('--sandbox', 'Use QBO sandbox for BOTH source and target')
    .option('--include <list>', 'Comma separated allowlist of entity types (e.g. Customer,Invoice)')
    .option('--exclude <list>', 'Comma separated blocklist of entity types')
    .option(
      '--batch-size <n>',
      `Create batch size (default ${DEFAULT_BATCH_SIZE})`,
      String(DEFAULT_BATCH_SIZE)
    )
    .option(
      '--concurrency <n>',
      `Create concurrency (default ${DEFAULT_CONCURRENCY})`,
      String(DEFAULT_CONCURRENCY)
    )
    .option(
      '--write-delay <ms>',
      `Delay between write batches (default ${DEFAULT_WRITE_DELAY_MS})`,
      String(DEFAULT_WRITE_DELAY_MS)
    )
    .option('--fail-fast', 'Abort after first entity write failure')
    .option('--dry-run', 'Fetch only, no writes')
    .option('--report <path>', 'Path to write JSON report', '.qbo-migration-report.json')
    .option('--debug', 'Enable debug logging for migration')
    .addHelpText(
      'after',
      '\nExit codes:\n  0  Success\n  1  General / unexpected failure\n  2  Input / credential validation error\n  4  Migration completed with write failures\n'
    )
    .action(async rawOpts => {
      const { QboMigrationService } = await import('../quickbooks/migration-service.js');
      const { writeFile, readFile, fileExists } = await import('../utils/fs.js');
      const { maskValue } = await import('../utils/masking.js');

      type PartialAuth = Partial<QboAuthConfig>;
      interface CredFile {
        source?: PartialAuth;
        target?: PartialAuth;
      }

      async function loadCredentialsFile(p?: string): Promise<CredFile | undefined> {
        if (!p) return undefined;
        if (!(await fileExists(p))) {
          logger.error(`Credentials file not found: ${p}`);
          process.exit(2);
        }
        try {
          const content = await readFile(p);
          if (!content) return undefined;
          return JSON.parse(content) as CredFile;
        } catch (e) {
          logger.error(`Failed to parse credentials file: ${String(e)}`);
          process.exit(2);
        }
      }

      function resolveValue(
        flagVal: unknown,
        envName: string,
        fallback?: string
      ): string | undefined {
        return (flagVal as string) || process.env[envName] || fallback;
      }

      const credFile = await loadCredentialsFile(rawOpts.credentialsFile as string | undefined);

      const sandbox =
        Boolean(rawOpts.sandbox) || credFile?.source?.useSandbox || credFile?.target?.useSandbox;
      const debug = Boolean(rawOpts.debug);

      const source: PartialAuth = {
        clientId: resolveValue(
          rawOpts.sourceClientId,
          'QBO_SRC_CLIENT_ID',
          credFile?.source?.clientId
        ),
        clientSecret: resolveValue(
          rawOpts.sourceClientSecret,
          'QBO_SRC_CLIENT_SECRET',
          credFile?.source?.clientSecret
        ),
        accessToken: resolveValue(
          rawOpts.sourceAccessToken,
          'QBO_SRC_ACCESS_TOKEN',
          credFile?.source?.accessToken
        ),
        refreshToken: resolveValue(
          rawOpts.sourceRefreshToken,
          'QBO_SRC_REFRESH_TOKEN',
          credFile?.source?.refreshToken
        ),
        realmId: resolveValue(rawOpts.sourceRealm, 'QBO_SRC_REALM', credFile?.source?.realmId),
        useSandbox: sandbox,
        debug,
      };
      const target: PartialAuth = {
        clientId: resolveValue(
          rawOpts.targetClientId,
          'QBO_TGT_CLIENT_ID',
          credFile?.target?.clientId
        ),
        clientSecret: resolveValue(
          rawOpts.targetClientSecret,
          'QBO_TGT_CLIENT_SECRET',
          credFile?.target?.clientSecret
        ),
        accessToken: resolveValue(
          rawOpts.targetAccessToken,
          'QBO_TGT_ACCESS_TOKEN',
          credFile?.target?.accessToken
        ),
        refreshToken: resolveValue(
          rawOpts.targetRefreshToken,
          'QBO_TGT_REFRESH_TOKEN',
          credFile?.target?.refreshToken
        ),
        realmId: resolveValue(rawOpts.targetRealm, 'QBO_TGT_REALM', credFile?.target?.realmId),
        useSandbox: sandbox,
        debug,
      };

      const missing: string[] = [];
      function req(
        obj: PartialAuth,
        field: keyof PartialAuth,
        label: string,
        allowMissing = false
      ) {
        const v = obj[field];
        if (!v && !allowMissing) missing.push(label);
      }

      // Source always required
      req(source, 'clientId', 'source.clientId');
      req(source, 'clientSecret', 'source.clientSecret');
      req(source, 'accessToken', 'source.accessToken');
      req(source, 'realmId', 'source.realmId');
      // Target required unless dry-run
      const dryRun = Boolean(rawOpts.dryRun);
      req(target, 'clientId', 'target.clientId', dryRun);
      req(target, 'clientSecret', 'target.clientSecret', dryRun);
      req(target, 'accessToken', 'target.accessToken', dryRun);
      req(target, 'realmId', 'target.realmId', dryRun);

      if (missing.length) {
        logger.error('Missing required credentials:');
        for (const m of missing) logger.error(`  - ${m}`);
        logger.error('Provide via flags, credentials file, or environment variables.');
        process.exit(2);
      }

      const include = rawOpts.include
        ? String(rawOpts.include)
            .split(',')
            .map((s: string) => s.trim())
        : undefined;
      const exclude = rawOpts.exclude
        ? String(rawOpts.exclude)
            .split(',')
            .map((s: string) => s.trim())
        : undefined;

      const options: QboMigrationOptions = {
        source: source as QboAuthConfig,
        target: target as QboAuthConfig,
        dryRun,
        batchSize: Number(rawOpts.batchSize) || DEFAULT_BATCH_SIZE,
        concurrency: Number(rawOpts.concurrency) || DEFAULT_CONCURRENCY,
        writeDelayMs: Number(rawOpts.writeDelay) || DEFAULT_WRITE_DELAY_MS,
        failFast: Boolean(rawOpts.failFast),
        includeEntities: include,
        excludeEntities: exclude,
      };

      logger.info('Starting QBO migration...');
      logger.info(`Source realm: ${source.realmId} (sandbox=${sandbox})`);
      if (!dryRun) logger.info(`Target realm: ${target.realmId}`);
      if (debug) {
        logger.debug(
          'Source config (masked): ' +
            JSON.stringify({
              clientId: maskValue(source.clientId || '', 4),
              clientSecret: maskValue(source.clientSecret || '', 4),
              accessToken: maskValue(source.accessToken || '', 4),
              refreshToken: maskValue(source.refreshToken || '', 4),
              realmId: source.realmId,
            })
        );
      }

      try {
        const migration = new QboMigrationService(options);
        const report = await migration.migrate();
        const reportPath = (rawOpts.report as string) || '.qbo-migration-report.json';
        await writeFile(reportPath, JSON.stringify(report, null, 2));
        logger.info(`Report written to ${reportPath}`);

        // Summary table
        const totalFetched = report.fetch.reduce((a, c) => a + c.count, 0);
        const totalCreated = report.write.reduce((a, c) => a + c.created, 0);
        const fetchErrors = report.fetch.filter(f => f.error).length;
        const duration = report.durationMs
          ? report.durationMs < 1000
            ? `${report.durationMs}ms`
            : `${(report.durationMs / 1000).toFixed(1)}s`
          : '?';

        logger.printHeader('Migration Summary');
        for (const f of report.fetch) {
          const w = report.write.find(w => w.entity === f.entity);
          const fetchLabel = f.error ? `[!] error` : String(f.count);
          const writeLabel = dryRun
            ? 'dry-run'
            : w
              ? w.failed
                ? `${w.created} ok, ${w.failed} failed`
                : `${w.created} ok`
              : '—';
          logger.printLine(
            `  ${f.entity.padEnd(18)} fetched: ${fetchLabel.padEnd(8)} write: ${writeLabel}`
          );
        }
        logger.printLine('');
        const summary = `${report.success ? 'OK' : 'FAIL'}  fetched=${totalFetched} created=${totalCreated} failed=${report.failures}${fetchErrors ? ` fetch-errors=${fetchErrors}` : ''}  elapsed=${duration}`;
        logger.info(summary);
        if (!report.success) process.exit(report.failures > 0 ? 4 : 1);
        process.exit(0);
      } catch (e) {
        logger.error(`Migration failed: ${String(e)}`);
        process.exit(1);
      }
    });
}
