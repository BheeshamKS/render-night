import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface BlenderInstallation {
  id: string;
  executable: string[];
  displayPath: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  isPortable: boolean;
  source: 'system' | 'steam' | 'flatpak' | 'snap' | 'custom';
}

export class BlenderDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlenderDiscoveryError';
  }
}

/**
 * In-memory cache of probed Blender installations keyed by canonical command string.
 */
const probeCache = new Map<string, BlenderInstallation>();

export function clearBlenderCache(): void {
  probeCache.clear();
}

/**
 * Parse standard output from `blender --version`.
 */
export function parseBlenderVersionOutput(stdout: string): {
  version: string;
  major: number;
  minor: number;
  patch: number;
} {
  const match = stdout.match(/Blender\s*(\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!match) {
    throw new BlenderDiscoveryError(
      `Could not parse Blender version from: ${stdout.slice(0, 200)}`,
    );
  }
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = match[3] ? Number.parseInt(match[3], 10) : 0;
  return {
    version: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
  };
}

/**
 * Sort a list of Blender installations in descending semver order (highest version first).
 */
export function sortBlendersDesc(installs: BlenderInstallation[]): BlenderInstallation[] {
  return [...installs].sort((a, b) => {
    if (b.major !== a.major) return b.major - a.major;
    if (b.minor !== a.minor) return b.minor - a.minor;
    return b.patch - a.patch;
  });
}

function isPortable(path: string): boolean {
  return /portable|portable-blender/i.test(path);
}

/**
 * Probe a candidate executable (either string path or argv array).
 */
export function probeBlender(
  candidate: string | string[],
  source: BlenderInstallation['source'] = 'system',
): Promise<BlenderInstallation> {
  const argv = Array.isArray(candidate) ? candidate : [candidate];
  const cacheKey = argv.join(' ');

  const cached = probeCache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const [cmd, ...args] = argv;

  // If single command/path and not flatpak/snap command, verify file exists
  if (cmd.startsWith('/') || cmd.includes('\\')) {
    if (!existsSync(cmd)) {
      return Promise.reject(new BlenderDiscoveryError(`Blender executable not found at: ${cmd}`));
    }
  }

  // If candidate is a JavaScript tool/script (e.g. tools/mock-blender/index.js), run it with Node.js
  const isJs = cmd.endsWith('.js') || cmd.endsWith('.mjs') || cmd.endsWith('.cjs');
  const execCmd = isJs ? process.execPath : cmd;
  const execArgs = isJs ? [cmd, ...args, '--version'] : [...args, '--version'];

  return new Promise((resolve, reject) => {
    execFile(
      execCmd,
      execArgs,
      { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new BlenderDiscoveryError(
              `Failed to execute ${cacheKey}: ${err.message}${stderr ? ` (${stderr.trim()})` : ''}`,
            ),
          );
          return;
        }

        try {
          const { version, major, minor, patch } = parseBlenderVersionOutput(stdout);
          const installation: BlenderInstallation = {
            id: cacheKey,
            executable: argv,
            displayPath: cacheKey,
            version,
            major,
            minor,
            patch,
            isPortable: isPortable(cacheKey),
            source,
          };
          probeCache.set(cacheKey, installation);
          resolve(installation);
        } catch (parseErr) {
          reject(parseErr);
        }
      },
    );
  });
}

/**
 * Generate candidate executables for a given platform.
 */
export function candidateExecutablesForPlatform(
  platform: NodeJS.Platform = process.platform,
): string[][] {
  const candidates: string[][] = [];
  const home = process.env.HOME || process.env.USERPROFILE || '';

  switch (platform) {
    case 'win32': {
      const pfRoots = [
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        'C:\\Program Files',
        'C:\\Program Files (x86)',
      ].filter(Boolean) as string[];

      for (const root of pfRoots) {
        // Direct default
        candidates.push([join(root, 'Blender Foundation', 'Blender', 'blender.exe')]);

        // Scan Blender Foundation directory for versioned folders
        const bfDir = join(root, 'Blender Foundation');
        if (existsSync(bfDir)) {
          try {
            const entries = readdirSync(bfDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                candidates.push([join(bfDir, entry.name, 'blender.exe')]);
              }
            }
          } catch {
            // ignore permission errors
          }
        }

        // Steam on Windows
        candidates.push([join(root, 'Steam', 'steamapps', 'common', 'Blender', 'blender.exe')]);
      }

      // Microsoft Store
      if (process.env.LOCALAPPDATA) {
        candidates.push([
          join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'blender.exe'),
        ]);
      }

      candidates.push(['blender.exe']);
      break;
    }

    case 'darwin': {
      candidates.push(['/Applications/Blender.app/Contents/MacOS/Blender']);
      if (home) {
        candidates.push([
          join(home, 'Applications', 'Blender.app', 'Contents', 'MacOS', 'Blender'),
        ]);
        candidates.push([
          join(
            home,
            'Library',
            'Application Support',
            'Steam',
            'steamapps',
            'common',
            'Blender',
            'Blender.app',
            'Contents',
            'MacOS',
            'Blender',
          ),
        ]);
      }

      // Scan /Applications for versioned Blender apps (e.g. Blender 4.2.app)
      if (existsSync('/Applications')) {
        try {
          const apps = readdirSync('/Applications');
          for (const app of apps) {
            if (app.startsWith('Blender') && app.endsWith('.app') && app !== 'Blender.app') {
              candidates.push([join('/Applications', app, 'Contents', 'MacOS', 'Blender')]);
            }
          }
        } catch {
          // ignore
        }
      }

      candidates.push(['blender']);
      break;
    }

    case 'linux':
    default: {
      // Flatpak: flatpak run org.blender.Blender
      candidates.push(['flatpak', 'run', 'org.blender.Blender']);

      // Common system paths
      candidates.push(['/usr/bin/blender']);
      candidates.push(['/usr/local/bin/blender']);
      candidates.push(['/snap/bin/blender']);
      candidates.push(['/var/lib/snapd/snap/bin/blender']);

      // /opt installations
      if (existsSync('/opt')) {
        try {
          const optEntries = readdirSync('/opt');
          for (const entry of optEntries) {
            if (entry.startsWith('blender')) {
              candidates.push([join('/opt', entry, 'blender')]);
            }
          }
        } catch {
          // ignore
        }
      }

      // Home folder installations
      if (home) {
        candidates.push([join(home, 'blender', 'blender')]);
        candidates.push([join(home, '.local', 'bin', 'blender')]);

        // Steam Linux
        candidates.push([
          join(home, '.steam', 'steam', 'steamapps', 'common', 'Blender', 'blender'),
        ]);
        candidates.push([
          join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Blender', 'blender'),
        ]);

        try {
          const homeEntries = readdirSync(home);
          for (const entry of homeEntries) {
            if (entry.startsWith('blender-') || entry.startsWith('blender_')) {
              candidates.push([join(home, entry, 'blender')]);
            }
          }
        } catch {
          // ignore
        }
      }

      // PATH lookup fallback
      candidates.push(['blender']);
      break;
    }
  }

  return candidates;
}

/**
 * Discover all usable Blender installations on the current machine, sorted semver descending.
 */
export async function discoverAllBlenders(
  customPaths: (string | string[])[] = [],
): Promise<BlenderInstallation[]> {
  const candidates = candidateExecutablesForPlatform();
  const allCandidates = [...customPaths.map((p) => (Array.isArray(p) ? p : [p])), ...candidates];

  const seenIds = new Set<string>();
  const results: BlenderInstallation[] = [];

  for (const candidate of allCandidates) {
    const key = candidate.join(' ');
    if (seenIds.has(key)) continue;

    try {
      const source: BlenderInstallation['source'] = customPaths.some(
        (cp) => (Array.isArray(cp) ? cp.join(' ') : cp) === key,
      )
        ? 'custom'
        : candidate[0] === 'flatpak'
          ? 'flatpak'
          : candidate[0].includes('snap')
            ? 'snap'
            : candidate[0].toLowerCase().includes('steam')
              ? 'steam'
              : 'system';

      const installation = await probeBlender(candidate, source);
      if (!seenIds.has(installation.id)) {
        seenIds.add(installation.id);
        seenIds.add(installation.displayPath);
        results.push(installation);
      }
    } catch {
      // Candidate not present or failed probe
    }
  }

  return sortBlendersDesc(results);
}

/**
 * Validate a custom Blender path or command provided by the user.
 */
export async function validateCustomBlender(
  customPathOrCommand: string | string[],
): Promise<BlenderInstallation> {
  const argv = Array.isArray(customPathOrCommand)
    ? customPathOrCommand
    : customPathOrCommand.trim().split(/\s+/);

  return probeBlender(argv, 'custom');
}

/**
 * Check whether a discovered Blender installation is compatible with Render Night.
 * Compatibility requirement: 3.6 LTS, 4.2 LTS, 4.x/5.x.
 */
export function isCompatibleBlender(install: BlenderInstallation): boolean {
  const { major, minor } = install;
  if (major === 3 && minor >= 6) return true;
  if (major === 4) return true;
  if (major === 5) return true;
  return false;
}
