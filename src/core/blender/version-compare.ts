/**
 * Parses a version string like "4.2.0", "v3.6", "4.0.1-alpha" into numeric components [major, minor, patch].
 */
export function parseVersion(versionStr?: string): number[] {
  if (!versionStr) return [0, 0, 0];
  const cleaned = versionStr.replace(/^v/i, '').split(/[-+]/)[0];
  const parts = cleaned.split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts.slice(0, 3);
}

/**
 * Compares two version strings.
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareVersions(v1?: string, v2?: string): number {
  const [maj1, min1, pat1] = parseVersion(v1);
  const [maj2, min2, pat2] = parseVersion(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}
