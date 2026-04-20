import { commandExists } from './exec.js';

/**
 * Utility for detecting CLI tool availability.
 *
 * Provides a centralized way to check if command-line tools are installed
 * and available in the system PATH. Used by providers to verify their
 * required dependencies before attempting operations.
 */
export class CliToolDetector {
  /**
   * Check if a specific CLI tool is installed and available.
   *
   * @param toolName - The name of the CLI tool to check
   * @returns Promise resolving to true if the tool is available, false otherwise
   */
  static async isToolInstalled(toolName: string): Promise<boolean> {
    return commandExists(toolName);
  }

  // Only a generic `isToolInstalled` is exposed; no tool-specific helpers are needed for QBO migration.

  /**
   * Check if multiple CLI tools are installed.
   *
   * @param toolNames - Array of tool names to check
   * @returns Promise resolving to object mapping tool names to availability status
   */
  static async checkMultipleTools(toolNames: string[]): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    await Promise.all(
      toolNames.map(async toolName => {
        results[toolName] = await this.isToolInstalled(toolName);
      })
    );

    return results;
  }

  /**
   * Check if all specified CLI tools are installed.
   *
   * @param toolNames - Array of tool names that must all be available
   * @returns Promise resolving to true if all tools are available, false otherwise
   */
  static async areAllToolsInstalled(toolNames: string[]): Promise<boolean> {
    const results = await this.checkMultipleTools(toolNames);
    return Object.values(results).every(isInstalled => isInstalled);
  }
}
