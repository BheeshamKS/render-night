import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ResolveOutputPathOptions {
  /** Fall back to the .blend file's parent directory if no resolved output path exists on disk. */
  fallbackToBlendDir?: boolean;
}

const FOREIGN_DRIVE_RE = /^[A-Za-z]:(?:[/\\]|$)/;
const FLATPAK_DRIVE_PREFIX_RE = /^\/app\/blender\/([A-Za-z]:[/\\].*)$/;

/**
 * Strips container prefixes like Flatpak's `/app/blender/D:/...` and normalizes whitespace.
 */
export function normalizeRawOutputPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  const flatpakMatch = trimmed.match(FLATPAK_DRIVE_PREFIX_RE);
  return flatpakMatch ? flatpakMatch[1] : trimmed;
}

/**
 * Returns true if the path begins with a Windows drive letter (e.g. `D:/...` or `C:\...`).
 */
export function isWindowsDrivePath(p: string): boolean {
  return FOREIGN_DRIVE_RE.test(p);
}

/**
 * Resolves Blender `//` relative paths and foreign Windows drive paths (e.g. `D:/...`)
 * to a real path on the local host using `.blend` ancestor matching.
 */
export function resolveOutputPath(
  targetPath: string,
  blendFilePath?: string,
  options?: ResolveOutputPathOptions,
): string {
  const cleaned = normalizeRawOutputPath(targetPath || '');
  const cleanBlend = blendFilePath?.trim();
  const blendDir = cleanBlend ? path.dirname(cleanBlend) : undefined;

  if (!cleaned) {
    return blendDir && fs.existsSync(blendDir) ? blendDir : '';
  }

  let candidate = cleaned;
  if (candidate.startsWith('//') && blendDir) {
    const rel = candidate.slice(2).replace(/\\/g, '/').replace(/^\/+/, '');
    candidate = rel ? path.join(blendDir, rel) : blendDir;
  }

  const trimmedNoTrail = candidate.replace(/[/\\]+$/, '') || candidate;

  // Check direct local filesystem hit first (only if it isn't a foreign Windows drive on POSIX)
  const isForeignWindows = process.platform !== 'win32' && isWindowsDrivePath(candidate);
  if (!isForeignWindows) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(trimmedNoTrail);
    if (parent && parent !== '.' && fs.existsSync(parent)) {
      return candidate;
    }
  }

  // Attempt suffix matching against .blend ancestors (handles D:/... -> /mnt/SSD_Storage/... or relocated folders)
  if (blendDir) {
    const withoutDrive = candidate.replace(/^[A-Za-z]:/, '');
    const segments = withoutDrive.split(/[/\\]+/).filter(Boolean);
    const hasTrailingSlash = /[/\\]$/.test(candidate);

    const ancestors: string[] = [];
    let cur = path.resolve(blendDir);
    for (let i = 0; i < 12; i++) {
      ancestors.push(cur);
      const next = path.dirname(cur);
      if (next === cur) break;
      cur = next;
    }

    // Match longest path suffix first across ancestors of the .blend file
    for (let startIdx = 0; startIdx < segments.length; startIdx++) {
      const suffix = segments.slice(startIdx);
      for (const ancestor of ancestors) {
        const joined = path.join(ancestor, ...suffix);
        if (fs.existsSync(joined)) {
          return hasTrailingSlash ? `${joined}${path.sep}` : joined;
        }
      }
    }

    // Fallback when target directory/file has not been created yet but its ancestor-matched parent exists
    for (let startIdx = 0; startIdx < segments.length; startIdx++) {
      const suffix = segments.slice(startIdx);
      if (suffix.length <= 1) continue;
      for (const ancestor of ancestors) {
        const joined = path.join(ancestor, ...suffix);
        const joinedParent = path.dirname(joined);
        if (joinedParent !== ancestor && fs.existsSync(joinedParent)) {
          return hasTrailingSlash ? `${joined}${path.sep}` : joined;
        }
      }
    }

    if (options?.fallbackToBlendDir && fs.existsSync(blendDir)) {
      return blendDir;
    }
  }

  return candidate;
}
