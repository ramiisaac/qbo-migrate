import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from './log.js';

/**
 * Centralized version detection and validation utilities
 */

export interface NodeVersionInfo {
  full: string;
  major: number;
  minor: number;
  patch: number;
  isSupported: boolean;
  minimumRequired: string;
}

export interface PackageVersionInfo {
  current: string | null;
  declared: string | null;
  mismatch: boolean;
  mismatchReason?: string;
}

/**
 * Version comparison utilities
 */
export class VersionUtils {
  static readonly MINIMUM_NODE_MAJOR = 18;
  static readonly MINIMUM_NODE_VERSION = '18.0.0';

  /**
   * Parse Node.js version string into components
   */
  static parseNodeVersion(versionString: string = process.version): NodeVersionInfo {
    // Remove 'v' prefix if present
    const cleanVersion = versionString.startsWith('v') ? versionString.slice(1) : versionString;
    const parts = cleanVersion.split('.').map(p => parseInt(p, 10));

    const major = parts[0] || 0;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;

    return {
      full: versionString,
      major,
      minor,
      patch,
      isSupported: major >= this.MINIMUM_NODE_MAJOR,
      minimumRequired: this.MINIMUM_NODE_VERSION,
    };
  }

  /**
   * Check if Node.js version meets requirements
   */
  static validateNodeVersion(minMajor: number = this.MINIMUM_NODE_MAJOR): {
    valid: boolean;
    current: string;
    required: string;
    message?: string;
  } {
    const nodeInfo = this.parseNodeVersion();
    const valid = nodeInfo.major >= minMajor;

    return {
      valid,
      current: nodeInfo.full,
      required: `${minMajor}.0.0`,
      message: valid
        ? undefined
        : `Node.js version ${nodeInfo.full} is below minimum required v${minMajor}.0.0`,
    };
  }

  /**
   * Parse package version from package.json content
   */
  static parsePackageVersion(packageJsonContent: string): string | null {
    try {
      const pkg = JSON.parse(packageJsonContent);
      return pkg.version || null;
    } catch (error) {
      logger.debug(
        `Failed to parse package.json: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Get current CLI version from package.json
   */
  static getCurrentVersion(): string | null {
    try {
      // Try to read from package.json in the CLI's directory
      const packagePath = join(__dirname, '../../package.json');
      if (existsSync(packagePath)) {
        const content = readFileSync(packagePath, 'utf-8');
        const pkg = JSON.parse(content);
        return pkg.version || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Compare version ranges and detect mismatches
   */
  static compareVersions(
    running: string,
    declared: string
  ): {
    match: boolean;
    reason?: string;
  } {
    // Simple exact comparison - warn on any non-exact range
    if (declared.startsWith('^') || declared.startsWith('~') || declared.startsWith('>')) {
      return {
        match: false,
        reason: 'Non-exact version range detected',
      };
    }

    // Check exact match
    if (running !== declared) {
      return {
        match: false,
        reason: 'Version mismatch',
      };
    }

    return { match: true };
  }

  /**
   * Get comprehensive package version information
   */
  static getPackageVersionInfo(): PackageVersionInfo {
    const current = this.getCurrentVersion();
    let declared: string | null = null;

    // Try to read declared version from project's package.json
    try {
      const packagePath = join(process.cwd(), 'package.json');

      if (existsSync(packagePath)) {
        const content = readFileSync(packagePath, 'utf-8');
        const pkg = JSON.parse(content);

        // Look for this CLI in dependencies
        const cliName = 'qbo-migrate';
        declared =
          pkg.dependencies?.[cliName] ||
          pkg.devDependencies?.[cliName] ||
          pkg.peerDependencies?.[cliName] ||
          null;
      }
    } catch {
      // Ignore errors
    }

    let mismatch = false;
    let mismatchReason: string | undefined;

    if (current && declared) {
      const comparison = this.compareVersions(current, declared);
      mismatch = !comparison.match;
      mismatchReason = comparison.reason;
    }

    return {
      current,
      declared,
      mismatch,
      mismatchReason,
    };
  }

  /**
   * Validate all version requirements
   */
  static validateAllVersions(): {
    node: ReturnType<typeof VersionUtils.validateNodeVersion>;
    package: PackageVersionInfo;
    overall: boolean;
    issues: string[];
  } {
    const node = this.validateNodeVersion();
    const packageInfo = this.getPackageVersionInfo();
    const issues: string[] = [];

    if (!node.valid) {
      issues.push(node.message!);
    }

    if (packageInfo.mismatch && packageInfo.mismatchReason) {
      issues.push(
        `CLI version mismatch: running ${packageInfo.current}, declared ${packageInfo.declared} (${packageInfo.mismatchReason})`
      );
    }

    return {
      node,
      package: packageInfo,
      overall: issues.length === 0,
      issues,
    };
  }

  /**
   * Format version information for display
   */
  static formatVersionInfo(): string {
    const nodeInfo = this.parseNodeVersion();
    const packageInfo = this.getPackageVersionInfo();

    const lines: string[] = [
      `Node.js: ${nodeInfo.full} (minimum required: ${nodeInfo.minimumRequired})`,
    ];

    if (packageInfo.current) {
      lines.push(`CLI Version: ${packageInfo.current}`);
    }

    if (packageInfo.declared) {
      lines.push(`Project Dependency Declared: ${packageInfo.declared}`);
    }

    return lines.join('\n');
  }

  /**
   * Extract major version number from version string
   */
  static extractMajorVersion(versionString: string): number {
    const cleaned = versionString.startsWith('v') ? versionString.slice(1) : versionString;
    const major = parseInt(cleaned.split('.')[0], 10);
    return isNaN(major) ? 0 : major;
  }

  /**
   * Check if a version string is valid semantic version
   */
  static isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/.test(version);
  }

  /**
   * Extract version from package.json content safely
   */
  static extractVersionFromPackageJson(content: string): string | null {
    try {
      const pkg = JSON.parse(content);
      const version = pkg.version;

      if (typeof version === 'string' && this.isValidSemver(version)) {
        return version;
      }

      return null;
    } catch {
      return null;
    }
  }
}
