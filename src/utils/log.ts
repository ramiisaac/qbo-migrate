import chalk from 'chalk';
import ora, { Ora } from 'ora';
// No longer needed as we'll use JSON.stringify for object inspection

/**
 * Logging levels for the application
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  SUCCESS = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5, // Special level that suppresses all output
}

type LogLevelString = keyof typeof LogLevel;
// Type for loggable values
// No longer needed as we're using Record<string, unknown> for metadata

interface LoggerOptions {
  level?: LogLevel | LogLevelString;
  prefix?: string;
  timestamp?: boolean;
  json?: boolean;
}

/**
 * A robust logging utility with support for different log levels, spinners, and formatting
 */
class Logger {
  private spinner: Ora | null = null;
  private minLevel: LogLevel = LogLevel.INFO;
  private prefix: string = '';
  private useTimestamp: boolean = false;
  private useJson: boolean = false;
  private static instance: Logger;
  private requestId: string | null = null;

  /**
   * Get the singleton instance of the Logger
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Configure the logger with custom options
   */
  public configure(options: LoggerOptions = {}): void {
    if (options.level !== undefined) {
      this.setLevel(options.level);
    }
    if (options.prefix !== undefined) {
      this.prefix = options.prefix;
    }
    if (options.timestamp !== undefined) {
      this.useTimestamp = options.timestamp;
    }
    if (options.json !== undefined) {
      this.useJson = options.json;
    }
  }

  /**
   * Set the minimum logging level
   */
  public setLevel(level: LogLevel | LogLevelString): void {
    if (typeof level === 'string') {
      const levelKey = level.toUpperCase() as keyof typeof LogLevel;
      if (levelKey in LogLevel) {
        this.minLevel = LogLevel[levelKey] as LogLevel;
      } else {
        this.warn(`Invalid log level: ${level}. Defaulting to INFO.`);
        this.minLevel = LogLevel.INFO;
      }
    } else {
      this.minLevel = level;
    }
  }

  /**
   * Enable or disable verbose logging
   */
  public setVerbose(verbose: boolean): void {
    this.minLevel = verbose ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * Check if verbose logging is enabled
   */
  public isVerbose(): boolean {
    return this.minLevel <= LogLevel.DEBUG;
  }

  /**
   * Set a request ID for log correlation
   */
  public setRequestId(id: string | null): void {
    this.requestId = id;
  }

  /**
   * Format a log message with timestamp, level, and request ID
   */
  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = this.useTimestamp ? `[${new Date().toISOString()}] ` : '';
    const levelStr = LogLevel[level].toLowerCase().padEnd(7);
    const requestId = this.requestId ? `[${this.requestId}] ` : '';
    const prefix = this.prefix ? `[${this.prefix}] ` : '';

    let formatted = `${timestamp}${levelStr} ${requestId}${prefix}${message}`;

    if (meta && Object.keys(meta).length > 0) {
      if (this.useJson) {
        formatted = JSON.stringify(
          {
            timestamp: this.useTimestamp ? new Date().toISOString() : undefined,
            level: LogLevel[level].toLowerCase(),
            requestId: this.requestId,
            prefix: this.prefix || undefined,
            message,
            ...meta,
          },
          null,
          2
        );
      } else {
        formatted += `\n${JSON.stringify(meta, null, 2)}`;
      }
    }

    return formatted;
  }

  /**
   * Log a message if the level is at or above the minimum level
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (level < this.minLevel) return;

    const formattedMessage = this.formatMessage(level, message, meta);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.INFO:
      case LogLevel.SUCCESS:
      case LogLevel.DEBUG:
      default:
        console.log(formattedMessage);
        break;
    }
  }

  // Public logging methods
  public debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  public success(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.SUCCESS, chalk.green(`[ok] ${message}`), meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, chalk.yellow(`[!] ${message}`), meta);
  }

  public error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    let errorMessage = message;
    const errorMeta = { ...meta };

    if (error instanceof Error) {
      errorMessage = `${message}: ${error.message}`;
      errorMeta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      errorMessage = `${message}: ${String(error)}`;
    }

    this.log(LogLevel.ERROR, chalk.red(`[x] ${errorMessage}`), errorMeta);
  }

  /**
   * Start a spinner with the given message
   */
  public startSpinner(message: string): void {
    if (this.minLevel > LogLevel.INFO || this.spinner) return;

    this.spinner = ora({
      text: message,
      spinner: 'dots',
      color: 'cyan',
    }).start();
  }

  /**
   * Stop the current spinner with optional completion status and message
   */
  public stopSpinner(success: boolean = true, message?: string): void {
    if (!this.spinner) return;

    if (success) {
      this.spinner.succeed(message);
    } else {
      this.spinner.fail(message);
    }

    this.spinner = null;
  }

  /**
   * Update the text of a running spinner without stopping it.
   */
  public updateSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  /**
   * Print a header with consistent formatting
   */
  public printHeader(title: string, subtitle: string = ''): void {
    if (this.minLevel > LogLevel.INFO) return;

    const header = [
      '\n' + chalk.cyan.bold(`=== ${title} ===`),
      subtitle ? chalk.cyan(subtitle) : '',
      ''.padEnd(title.length + 8, '='),
    ]
      .filter(Boolean)
      .join('\n');

    console.log(header);
  }

  /**
   * Print a line with consistent formatting
   */
  public printLine(
    message: string,
    color: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' = 'white'
  ): void {
    if (this.minLevel > LogLevel.INFO) return;
    console.log(chalk[color](message));
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();

// Re-export types
export type { LoggerOptions };

export default logger;

export function parseLogLevel(input: string | undefined): LogLevel | undefined {
  if (!input) return undefined;
  const value = input.toLowerCase();
  switch (value) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'info':
      return LogLevel.INFO;
    case 'success':
      return LogLevel.SUCCESS;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    default:
      return undefined;
  }
}
