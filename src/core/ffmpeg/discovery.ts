import ffmpegStatic from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface FfmpegInfo {
  path: string;
  source: 'custom' | 'system' | 'bundled';
  version?: string;
}

/**
 * Validates that an executable file exists and responds to -version.
 * Returns the detected version string or null if invalid.
 */
export async function checkFfmpegBinary(binPath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(binPath)) {
      return null;
    }
    const { stdout } = await execFileAsync(binPath, ['-version']);
    const match = stdout.match(/ffmpeg version\s+([^\s]+)/i);
    return match ? match[1] : 'unknown';
  } catch {
    return null;
  }
}

/**
 * Searches system PATH for an ffmpeg executable.
 */
export async function findSystemFfmpeg(): Promise<string | null> {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(cmd, ['ffmpeg']);
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (fs.existsSync(line)) {
        return line;
      }
    }
  } catch {
    // which/where failed, fallback to scanning PATH environment variable
    const pathEnv = process.env.PATH || '';
    const delimiter = isWin ? ';' : ':';
    const dirs = pathEnv.split(delimiter);
    const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
    for (const dir of dirs) {
      const fullPath = path.join(dir, exeName);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

/**
 * Discovers the active FFmpeg binary.
 * Priority:
 * 1. User-specified custom path
 * 2. System PATH ffmpeg
 * 3. Bundled fallback binary via ffmpeg-static
 */
export async function getFfmpegPath(customPath?: string): Promise<FfmpegInfo | null> {
  if (customPath) {
    const version = await checkFfmpegBinary(customPath);
    if (version) {
      return { path: customPath, source: 'custom', version };
    }
    return null;
  }

  // 1. Check system PATH
  const systemPath = await findSystemFfmpeg();
  if (systemPath) {
    const version = await checkFfmpegBinary(systemPath);
    if (version) {
      return { path: systemPath, source: 'system', version };
    }
  }

  // 2. Check bundled ffmpeg-static
  if (ffmpegStatic && typeof ffmpegStatic === 'string') {
    const version = await checkFfmpegBinary(ffmpegStatic);
    if (version) {
      return { path: ffmpegStatic, source: 'bundled', version };
    }
  }

  return null;
}
