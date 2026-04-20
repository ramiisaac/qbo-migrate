export const SENSITIVE_NAME_PATTERNS: RegExp[] = [
  /KEY/i,
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /PWD/i,
  /PASS/i,
  /CREDENTIAL/i,
  /AUTH/i,
  /PRIVATE/i,
];

export function maskValue(value: string, maxLength = 60): string {
  // Strip matching outer quotes
  let v = value;
  if (v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1);
  }

  // Mask tokens and secrets
  v = v.replace(
    /(token=|key=|secret=|password=|pwd=|pass=)([A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/gi,
    '$1$2…'
  );

  // Truncate if too long
  if (v.length > maxLength) {
    return `${v.substring(0, maxLength)}…`;
  }

  return v;
}

export function shouldMaskVar(name: string): boolean {
  return SENSITIVE_NAME_PATTERNS.some(pattern => pattern.test(name));
}

export function getPlaceholder(_name: string): string {
  return 'CHANGE_ME';
}
