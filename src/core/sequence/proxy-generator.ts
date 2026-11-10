import { getFfmpegPath } from '../ffmpeg/discovery';
import { NATIVE_IMAGE_EXTENSIONS } from '../schemas/sequence';

import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ProxyResult {
  proxyPath: string | null;
  isCached: boolean;
  error?: string;
}

export function getProxyCacheKey(sourcePath: string, mtimeMs: number): string {
  const hash = crypto.createHash('sha256').update(`${sourcePath}:${mtimeMs}`).digest('hex');
  return `proxy_${hash.slice(0, 16)}.png`;
}

/**
 * Generates or retrieves a cached PNG thumbnail proxy for non-native image formats (EXR, TIFF, DPX).
 * If the image is already a native format (PNG, JPEG, WEBP, BMP, TGA), returns the sourcePath directly.
 */
export async function generateFrameProxy(
  sourcePath: string,
  cacheDir: string,
  ffmpegBin?: string,
): Promise<ProxyResult> {
  const ext = path.extname(sourcePath).replace(/^\./, '').toLowerCase();

  // If it's already a native format that browsers can render, return directly
  if ((NATIVE_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      proxyPath: sourcePath,
      isCached: true,
    };
  }

  let mtimeMs = 0;
  try {
    const stat = await fs.promises.stat(sourcePath);
    mtimeMs = stat.mtimeMs;
  } catch (err: unknown) {
    return {
      proxyPath: null,
      isCached: false,
      error: `File not accessible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  await fs.promises.mkdir(cacheDir, { recursive: true });
  const proxyFilename = getProxyCacheKey(sourcePath, mtimeMs);
  const proxyPath = path.join(cacheDir, proxyFilename);

  // Check if cached proxy already exists and has size > 0
  try {
    const proxyStat = await fs.promises.stat(proxyPath);
    if (proxyStat.size > 0) {
      return {
        proxyPath,
        isCached: true,
      };
    }
  } catch {
    // Not cached yet
  }

  // Resolve ffmpeg binary
  let bin = ffmpegBin;
  if (!bin) {
    const discovered = await getFfmpegPath();
    if (discovered) {
      bin = discovered.path;
    }
  }

  if (!bin) {
    return {
      proxyPath: null,
      isCached: false,
      error: `FFmpeg is required to preview .${ext} files, but FFmpeg could not be found.`,
    };
  }

  try {
    // Generate proxy with FFmpeg
    // Scale max 1920 width, keeping aspect ratio and even dimensions
    await execFileAsync(bin, [
      '-y',
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      "scale='min(1920,iw)':-2",
      proxyPath,
    ]);

    if (fs.existsSync(proxyPath)) {
      return {
        proxyPath,
        isCached: false,
      };
    }
    return {
      proxyPath: null,
      isCached: false,
      error: `Failed to create preview proxy for .${ext} file.`,
    };
  } catch (err: unknown) {
    return {
      proxyPath: null,
      isCached: false,
      error: `Could not decode .${ext} preview: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Batches proxy generation over a list of image file paths with concurrency control.
 */
export async function batchGenerateProxies(
  filePaths: string[],
  cacheDir: string,
  ffmpegBin?: string,
  concurrency = 4,
): Promise<Map<string, string>> {
  const resultMap = new Map<string, string>();
  let bin = ffmpegBin;
  if (!bin) {
    const discovered = await getFfmpegPath();
    if (discovered) {
      bin = discovered.path;
    }
  }

  for (let i = 0; i < filePaths.length; i += concurrency) {
    const slice = filePaths.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (filePath) => {
        const res = await generateFrameProxy(filePath, cacheDir, bin);
        if (res.proxyPath) {
          resultMap.set(filePath, res.proxyPath);
        }
      }),
    );
  }

  return resultMap;
}
