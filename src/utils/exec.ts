import { execa, ExecaError } from 'execa';
import pRetry from 'p-retry';
import { logger } from './log.js';
import { maskValue } from './masking.js';
// Removed dependency on legacy core errors; define minimal internal errors
class ExecBaseError extends Error {
  constructor(
    message: string,
    public cause?: unknown
  ) {
    super(message);
  }
}
class CommandError extends ExecBaseError {}
class ValidationError extends ExecBaseError {}
import { rateLimiters } from './rate-limiter.js';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  retries?: number;
  stdin?: string;
  stdio?: 'inherit' | 'pipe';
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Allowed commands to prevent command injection (reduced set for QBO tooling)
const ALLOWED_COMMANDS = new Set(['git', 'which', 'node', 'npm', 'pnpm', 'yarn']);

/**
 * Prepare arguments for execution with sensitive data masking
 */
function prepareArgsForLogging(args: string[]): string[] {
  const isSensitiveArg = (s: string) => /token|secret|password/i.test(s);
  return args.map(arg => (isSensitiveArg(arg) ? maskValue(arg, 20) : arg));
}

/**
 * Get appropriate rate limiter for the command
 */
function getRateLimiter(_command: string) {
  return rateLimiters.general;
}

/**
 * Log execution details with sensitive data masking
 */
function logExecution(command: string, args: string[], stdin?: string): void {
  const maskedArgs = prepareArgsForLogging(args);
  logger.debug(`Executing: ${command} ${maskedArgs.join(' ')}`);

  if (stdin && logger.isVerbose()) {
    const isSensitiveData = /token|secret|password/i.test(stdin);
    const maskedStdin = isSensitiveData ? maskValue(stdin, 50) : '[stdin provided]';
    logger.debug(`With stdin: ${maskedStdin}`);
  }
}

/**
 * Execute command with proper configuration
 */
async function executeCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    stdin?: string;
    stdio?: 'inherit' | 'pipe';
  }
): Promise<ExecResult> {
  const result = await execa(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : undefined,
    input: options.stdin,
    stdio: options.stdio === 'inherit' ? 'inherit' : undefined,
    // Security: Prevent shell interpretation
    shell: false,
    // Security: Set safe execution options
    cleanup: true,
    killSignal: 'SIGTERM',
  });

  return {
    stdout: options.stdio === 'inherit' ? '' : result.stdout || '',
    stderr: options.stdio === 'inherit' ? '' : result.stderr || '',
    exitCode: result.exitCode ?? 0,
  };
}

/**
 * Handle execution errors with proper error types
 */
function handleExecutionError(error: unknown, command: string): never {
  // Type guard for execa errors
  const isExecaError = (err: unknown): err is ExecaError => {
    return err != null && typeof err === 'object' && 'exitCode' in err && 'command' in err;
  };

  if (isExecaError(error)) {
    // Don't retry on certain errors
    if (error.exitCode === 127) {
      // Command not found
      throw new CommandError(`Command not found: ${command}`, error);
    }

    // Log error without exposing sensitive data
    logger.debug(`Command execution failed: ${command} (exit code: ${error.exitCode})`);

    // Re-throw for retry
    throw new CommandError(`Command failed: ${command}`, error);
  } else {
    // Handle non-execa errors
    const genericError = error instanceof Error ? error : new Error(String(error));
    logger.debug(`Command execution failed: ${command} (generic error)`);
    throw new CommandError(`Command failed: ${command}`, genericError);
  }
}

// Validate command to prevent injection attacks
function validateCommand(command: string): void {
  if (!command || typeof command !== 'string') {
    throw new ValidationError('Invalid command: must be a non-empty string');
  }

  // Check for shell injection patterns
  if (
    command.includes('&') ||
    command.includes('|') ||
    command.includes(';') ||
    command.includes('`') ||
    command.includes('$') ||
    command.includes('(') ||
    command.includes('<') ||
    command.includes('>')
  ) {
    throw new ValidationError(`Invalid command: contains shell metacharacters: ${command}`);
  }

  // Ensure command is in allowlist
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new ValidationError(
      `Command not allowed: ${command}. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`
    );
  }
}

// Validate arguments to prevent injection
function validateArgs(args: string[]): void {
  if (!Array.isArray(args)) {
    throw new ValidationError('Invalid args: must be an array');
  }

  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new ValidationError('Invalid argument: all arguments must be strings');
    }

    // Check for dangerous patterns in arguments
    if (arg.includes('\n') || arg.includes('\r')) {
      throw new ValidationError(`Invalid argument: contains newline characters: ${maskValue(arg)}`);
    }
  }
}

export async function exec(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  // Validate inputs to prevent command injection
  validateCommand(command);
  validateArgs(args);

  const { cwd, env, retries = 3, stdin, stdio = 'pipe' } = options;

  const runCommand = async () => {
    // Apply rate limiting based on command
    const rateLimiter = getRateLimiter(command);
    await rateLimiter.waitForToken();

    // Log execution details
    logExecution(command, args, stdin);

    try {
      return await executeCommand(command, args, { cwd, env, stdin, stdio });
    } catch (error) {
      handleExecutionError(error, command);
    }
  };

  if (retries > 0) {
    return pRetry(runCommand, {
      retries,
      onFailedAttempt: error => {
        logger.debug(`Command failed, attempt ${error.attemptNumber} of ${retries + 1}`);
      },
    });
  }

  return runCommand();
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    // Use the secure exec function which includes validation
    await exec('which', [command]);
    return true;
  } catch {
    return false;
  }
}
