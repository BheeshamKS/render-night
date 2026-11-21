import { discoverAllBlenders, validateCustomBlender } from '../core/blender/discovery';
import { compareVersions } from '../core/blender/version-compare';

import * as fs from 'node:fs';

export interface ResolvedBlender {
  executable: string[];
  version: string;
  displayPath: string;
}

export async function resolveBlenderForCli(spec?: string): Promise<ResolvedBlender> {
  const allBlenders = await discoverAllBlenders();

  // If no spec or "latest", pick the highest version discovered
  if (!spec || spec.toLowerCase() === 'latest') {
    if (allBlenders.length === 0) {
      throw new Error(
        'No Blender installations found on system. Please specify a Blender path with --blender <path>.',
      );
    }
    const sorted = [...allBlenders].sort((a, b) => compareVersions(b.version, a.version));
    const newest = sorted[0];
    return {
      executable: newest.executable,
      version: newest.version,
      displayPath: newest.displayPath,
    };
  }

  // 1. Check if spec is an existing path on disk
  if (fs.existsSync(spec)) {
    const validated = await validateCustomBlender(spec);
    return {
      executable: validated.executable,
      version: validated.version,
      displayPath: validated.displayPath,
    };
  }

  // 2. Check if spec matches a version prefix among discovered blenders (e.g. "4.2", "3.6")
  const match = allBlenders.find((b) => b.version.startsWith(spec));
  if (match) {
    return {
      executable: match.executable,
      version: match.version,
      displayPath: match.displayPath,
    };
  }

  const available = allBlenders.map((b) => `${b.version} (${b.displayPath})`).join(', ');
  throw new Error(
    `Blender "${spec}" not found. Available versions on system: ${available || 'none'}.`,
  );
}
