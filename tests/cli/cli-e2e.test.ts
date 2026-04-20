import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { join } from 'path';

const CLI_ENTRY = join(__dirname, '../../src/cli/index.ts');
const TSX = 'tsx';

/**
 * Run the CLI via tsx (no build required).
 * Passes args and returns stdout/stderr/exitCode.
 */
async function runCli(args: string[] = []) {
  try {
    const result = await execa(TSX, [CLI_ENTRY, ...args], {
      reject: false,
      timeout: 15_000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.exitCode ?? 1,
    };
  }
}

describe('CLI E2E', () => {
  it('shows help with --help', async () => {
    const { stdout, exitCode } = await runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('qbo-migrate');
    expect(stdout).toContain('qbo:migrate');
  });

  it('shows version with --version', async () => {
    const { stdout, exitCode } = await runCli(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('qbo:migrate --help lists all options', async () => {
    const { stdout, exitCode } = await runCli(['qbo:migrate', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--source-client-id');
    expect(stdout).toContain('--target-realm');
    expect(stdout).toContain('--credentials-file');
    expect(stdout).toContain('--dry-run');
    expect(stdout).toContain('--batch-size');
    expect(stdout).toContain('--include');
    expect(stdout).toContain('--exclude');
    expect(stdout).toContain('--fail-fast');
  });

  it('qbo:migrate fails with missing credentials', async () => {
    const { stderr, exitCode } = await runCli(['qbo:migrate']);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/missing required credentials/i);
  });

  it('qbo:migrate --dry-run fails without source credentials', async () => {
    const { stderr, exitCode } = await runCli(['qbo:migrate', '--dry-run']);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/source\.clientId|missing/i);
  });

  it('qbo:migrate --credentials-file with nonexistent file fails', async () => {
    const { stderr, exitCode } = await runCli([
      'qbo:migrate',
      '--credentials-file',
      '/tmp/nonexistent-creds-12345.json',
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/not found/i);
  });
});
