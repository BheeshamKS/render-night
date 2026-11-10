import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface BlenderInstallation {
  path: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  isPortable: boolean;
}

export class BlenderDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlenderDiscoveryError';
  }
}

function isPortable(path: string): boolean {
  return /portable|portable-blender/i.test(path);
}

/**
 * Probe a candidate path: check it exists and ask it for its version.
 */
export function probeBlender(candidate: string): Promise<BlenderInstallation> {
  return new Promise((resolve, reject) => {
    if (!existsSync(candidate)) {
      reject(new BlenderDiscoveryError(`Blender not found at: ${candidate}`));
      return;
    }
    execFile(
      candidate,
      ['--version'],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(new BlenderDiscoveryError(`Failed to probe ${candidate}: ${err.message}`));
          return;
        }
        const m = stdout.match(/Blender\s*(\d+)\.(\d+)\.(\d+)/);
        if (!m) {
          reject(new BlenderDiscoveryError(`Could not parse Blender version from: ${stdout}`));
          return;
        }
        const major = Number.parseInt(m[1], 10);
        const minor = Number.parseInt(m[2], 10);
        const patch = Number.parseInt(m[3], 10);
        resolve({
          path: candidate,
          version: `${major}.${minor}.${patch}`,
          major,
          minor,
          patch,
          isPortable: isPortable(candidate),
        });
      },
    );
  });
}

/**
 * Build a list of candidate paths for a given OS.
 */
export function defaultCandidates(os: NodeJS.Platform = process.platform): string[] {
  const candidates: string[] = [];
  const home = process.env.HOME || process.env.USERPROFILE || process.env.USERPROFILE || '/';

  switch (os) {
    case 'win32': {
      const programFiles = [
        process.env.PROGRAMFILES,
        process.env['PROGRAMFILES(X86)'] || process.env.PROGRAMFILES,
      ].filter(Boolean) as string[];
      for (const pf of programFiles) {
        candidates.push(join(pf, 'Blender', 'blender.exe'));
        candidates.push(join(pf, 'Blender Foundation', 'Blender', 'blender.exe'));
      }
      candidates.push(join(home, 'blender-portable', 'blender.exe'));
      break;
    }
    case 'darwin': {
      candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
      candidates.push(join(home, 'Applications', 'Blender.app', 'Contents', 'MacOS', 'Blender'));
      break;
    }
    case 'linux':
    default: {
      candidates.push('/usr/local/bin/blender');
      candidates.push('/usr/bin/blender');
      candidates.push(join(home, 'blender', 'blender'));
      candidates.push(join(home, 'blender-portable', 'blender'));
      candidates.push(join(home, 'snap', 'blender', 'current', 'blender'));
      break;
    }
  }

  return candidates;
}

/**
 * Discover the first usable Blender installation from a list of candidates.
 */
export async function discoverBlender(
  candidates: string[] = defaultCandidates(),
): Promise<BlenderInstallation | null> {
  for (const candidate of candidates) {
    try {
      return await probeBlender(candidate);
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Check whether a discovered Blender is compatible with the app.
 * Compatible: 3.6 LTS, 4.2 LTS, latest 4.x/5.x.
 */
export function isCompatibleBlender(install: BlenderInstallation): boolean {
  const { major, minor } = install;
  if (major === 3 && minor >= 6) return true;
  if (major === 4) return true;
  if (major === 5) return true;
  return false;
}
