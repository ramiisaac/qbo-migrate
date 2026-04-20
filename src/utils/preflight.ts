import { logger } from './log.js';
import { VersionUtils } from './version.js';

export interface PreflightOptions {
  /** Fail build on version mismatch instead of warning */
  strict?: boolean;
  /** Minimum required Node.js major version (default 18) */
  minNodeMajor?: number;
}

export interface PreflightValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validate Node.js version meets minimum requirements (exported for testing)
 */
export async function validateNodeVersion(
  minNodeMajor: number
): Promise<{ warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const nodeValidation = VersionUtils.validateNodeVersion(minNodeMajor);
  if (!nodeValidation.valid) {
    const message = nodeValidation.message || 'Unsupported Node.js version';
    errors.push(message);
    logger.error(message);
  } else {
    logger.debug(
      `Node.js version ${nodeValidation.current} meets requirement (>= ${minNodeMajor})`
    );
  }

  return { warnings, errors };
}

/**
 * Compute Node.js version status (exported for testing)
 */
export function computeNodeVersionStatus(minMajor: number) {
  const nodeValidation = VersionUtils.validateNodeVersion(minMajor);
  const nodeInfo = VersionUtils.parseNodeVersion();

  return {
    ok: nodeValidation.valid,
    current: nodeValidation.current,
    currentMajor: nodeInfo.major,
    minMajor,
    message: nodeValidation.message,
  };
}

/**
 * Compute version mismatch information (exported for testing)
 */
export function computeVersionMismatch(runningVersion: string, projectVersion: string) {
  const comparison = VersionUtils.compareVersions(runningVersion, projectVersion);
  return {
    mismatch: !comparison.match,
    reason: comparison.reason,
    runningVersion,
    declaredRange: projectVersion,
  };
}

// No third-party CLI validations are needed for QBO migration; the tool talks directly to the QBO API.

/**
 * Validate CLI version compatibility
 */
async function validateVersionCompatibility(
  strict: boolean
): Promise<{ warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const packageInfo = VersionUtils.getPackageVersionInfo();
  const runningVersion = packageInfo.current;
  const projectVersion = packageInfo.declared;

  if (runningVersion && projectVersion) {
    const comparison = VersionUtils.compareVersions(runningVersion, projectVersion);
    if (!comparison.match) {
      const message = `CLI version mismatch: running ${runningVersion}, project declares ${projectVersion}${comparison.reason ? ` (${comparison.reason})` : ''}`;
      if (strict) {
        errors.push(message);
        logger.error(message);
      } else {
        warnings.push(message);
        logger.warn(message);
      }
    } else {
      logger.debug(`CLI version ${runningVersion} matches project requirement`);
    }
  } else if (projectVersion) {
    logger.debug(
      `Project declares CLI dependency version ${projectVersion}, but cannot determine running version`
    );
  }

  return { warnings, errors };
}

// Removed legacy GitHub validation.

export async function runPreflight(
  options: PreflightOptions = {}
): Promise<PreflightValidationResult> {
  const { strict = false, minNodeMajor = 18 } = options;

  const warnings: string[] = [];
  const errors: string[] = [];

  logger.info('Running pre-flight checks...');

  // Run validation checks (QBO-only)
  const nodeResults = await validateNodeVersion(minNodeMajor);
  const versionResults = await validateVersionCompatibility(strict);

  // Collect all warnings and errors
  warnings.push(...nodeResults.warnings, ...versionResults.warnings);
  errors.push(...nodeResults.errors, ...versionResults.errors);

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  if (hasErrors) {
    logger.error(`Pre-flight checks failed: ${errors.length} error(s)`);
  } else if (hasWarnings) {
    logger.warn(`Pre-flight checks completed with ${warnings.length} warning(s)`);
  } else {
    logger.success('All pre-flight checks passed');
  }

  if (strict && hasErrors) {
    throw new Error(`Pre-flight checks failed: ${errors.join('; ')}`);
  }

  return { ok: !hasErrors, warnings, errors };
}
