#!/usr/bin/env node
import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';
import pkg from '../../package.json';
import { addQboMigrateCommand } from './commands.js';
import { logger, parseLogLevel } from '../utils/log.js';

loadEnv();
loadEnv({ path: '.env.local' });

const version = (pkg as { version?: string }).version;

const program = new Command();
program
  .name('qbo-migrate')
  .description('Migrate data between QuickBooks Online companies (source -> target)');
if (version) program.version(version);

program.option(
  '--log-level <level>',
  'Log level (debug|info|warn|error)',
  process.env.QBO_MIGRATE_LOG_LEVEL
);

program.hook('preAction', (_thisCommand, actionCommand) => {
  const opts = actionCommand.parent?.opts() || {};
  const level = parseLogLevel(opts.logLevel as string | undefined);
  if (level !== undefined) logger.setLevel(level);
});

addQboMigrateCommand(program);

program.parse(process.argv);
