import { parse } from 'dotenv';

export interface ParsedEnv {
  [key: string]: string;
}

export function parseEnvFile(content: string): ParsedEnv {
  return parse(content);
}

export function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();

  // Skip comments and empty lines
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const index = trimmed.indexOf('=');
  if (index === -1) {
    return null;
  }

  const key = trimmed.substring(0, index).trim();
  let value = trimmed.substring(index + 1);

  // Handle quoted values
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  // Validate key format
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  return { key, value };
}

export function escapeEnvValue(value: string): string {
  const needsQuoting = value.includes(' ') || value.includes('#');
  const escaped = value.replace(/"/g, '\\"');
  return needsQuoting ? `"${escaped}"` : value;
}

export function formatEnvFile(vars: Map<string, string>, header?: string): string {
  const lines: string[] = [];

  if (header) {
    // Split header by newlines and prefix each with #
    const headerLines = header.split('\n');
    for (const line of headerLines) {
      lines.push(`# ${line}`);
    }
    lines.push(`# Generated at ${new Date().toISOString()}`);
    lines.push('');
  }

  // Sort variables for consistency
  const sortedKeys = Array.from(vars.keys()).sort();

  for (const key of sortedKeys) {
    const value = vars.get(key) || '';
    const escapedValue = escapeEnvValue(value);
    lines.push(`${key}=${escapedValue}`);
  }

  return lines.join('\n') + '\n';
}

export function mergeEnvContent(
  original: string,
  updates: Map<string, string>,
  preserveComments = true
): string {
  const lines: string[] = [];
  const processed = new Set<string>();

  // Process original content line by line
  const originalLines = original.split('\n');

  for (const line of originalLines) {
    const trimmed = line.trim();

    // Preserve comments and empty lines if requested
    if (preserveComments && (!trimmed || trimmed.startsWith('#'))) {
      lines.push(line);
      continue;
    }

    // Parse variable line
    const parsed = parseEnvLine(line);
    if (parsed) {
      const { key } = parsed;

      if (updates.has(key)) {
        // Use updated value
        const value = updates.get(key) || '';
        const escapedValue = escapeEnvValue(value);
        lines.push(`${key}=${escapedValue}`);
        processed.add(key);
      } else {
        // Keep original line as-is
        lines.push(line);
      }
    }
  }

  // Add any new variables not in original
  const sortedNewKeys = Array.from(updates.keys())
    .filter(k => !processed.has(k))
    .sort();

  if (sortedNewKeys.length > 0) {
    lines.push('');
    lines.push('# New variables added by qbo-migrate');
    for (const key of sortedNewKeys) {
      const value = updates.get(key) || '';
      const escapedValue = escapeEnvValue(value);
      lines.push(`${key}=${escapedValue}`);
    }
  }

  return lines.join('\n') + '\n';
}
