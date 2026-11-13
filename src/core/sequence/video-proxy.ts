import type { ImageSequenceInfo } from '../schemas/sequence';

import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface VideoProxyResult {
  proxyPath: string;
  isCached: boolean;
  isToneMapped: boolean;
}

/**
 * Computes a deterministic cache key based on folder path, mtime, frame range, and options.
 */
export function getVideoProxyCacheKey(
  directory: string,
  startFrame: number,
  endFrame: number,
  mtimeMs: number,
): string {
  const hash = crypto
    .createHash('sha256')
    .update(
      `${path.resolve(directory)}::${startFrame}::${endFrame}::${mtimeMs}::scale1280::g1::crf20`,
    )
    .digest('hex');
  return `proxy_seq_${hash.slice(0, 16)}.mp4`;
}

/**
 * Generates an intra-coded H.264 proxy video (-g 1) scaled to max 1280px wide.
 * Non-native or HDR sources (EXR, HDR, TIFF, DPX) are tone-mapped to sRGB.
 */
export async function generateVideoProxy(
  sequence: ImageSequenceInfo,
  cacheDir: string,
  ffmpegBin = 'ffmpeg',
  onProgress?: (progress: number) => void,
): Promise<VideoProxyResult> {
  const ext = (sequence.extension || '').toLowerCase();
  const isHdrOrNonNative =
    !sequence.isNativeFormat || ['exr', 'hdr', 'dpx', 'tif', 'tiff'].includes(ext);

  let mtimeMs = 0;
  try {
    const stat = await fs.promises.stat(sequence.directory);
    mtimeMs = stat.mtimeMs;
  } catch {
    mtimeMs = Date.now();
  }

  await fs.promises.mkdir(cacheDir, { recursive: true });
  const proxyFilename = getVideoProxyCacheKey(
    sequence.directory,
    sequence.startFrame,
    sequence.endFrame,
    mtimeMs,
  );
  const proxyPath = path.join(cacheDir, proxyFilename);

  // Return cached proxy if it already exists and has size > 0
  try {
    const proxyStat = await fs.promises.stat(proxyPath);
    if (proxyStat.size > 1024) {
      return {
        proxyPath,
        isCached: true,
        isToneMapped: isHdrOrNonNative,
      };
    }
  } catch {
    // Not cached yet
  }

  const tempProxyPath = `${proxyPath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;

  const vfFilters: string[] = [];
  if (isHdrOrNonNative && (ext === 'exr' || ext === 'hdr')) {
    vfFilters.push("scale='min(1280,iw)':-2:flags=bicubic", 'format=yuv420p');
  } else {
    vfFilters.push("scale='min(1280,iw)':-2:flags=bicubic", 'format=yuv420p');
  }

  const fps = 24; // Standard preview fps
  const totalFrames = Math.max(1, sequence.endFrame - sequence.startFrame + 1);

  const args = [
    '-y',
    '-framerate',
    String(fps),
    '-start_number',
    String(sequence.startFrame),
    '-i',
    sequence.pattern,
    '-vf',
    vfFilters.join(','),
    '-c:v',
    'libx264',
    '-g',
    '1', // Intra-frame only for zero-latency instant scrubbing
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-frames:v',
    String(totalFrames),
    tempProxyPath,
  ];

  return new Promise<VideoProxyResult>((resolve, reject) => {
    const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrBuffer = '';

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;

      // Parse frame progress
      const frameMatch = text.match(/frame=\s*(\d+)/);
      if (frameMatch && onProgress) {
        const currentFrame = parseInt(frameMatch[1], 10);
        const percent = Math.min(100, Math.round((currentFrame / totalFrames) * 100));
        onProgress(percent);
      }
    });

    child.on('close', async (code) => {
      if (code === 0) {
        try {
          await fs.promises.rename(tempProxyPath, proxyPath);
          resolve({
            proxyPath,
            isCached: false,
            isToneMapped: isHdrOrNonNative,
          });
        } catch (renameErr) {
          reject(renameErr);
        }
      } else {
        try {
          await fs.promises.unlink(tempProxyPath);
        } catch {}
        reject(
          new Error(`FFmpeg proxy generation failed (code ${code}): ${stderrBuffer.slice(-500)}`),
        );
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Clears video proxy cache and returns the number of bytes deleted.
 */
export async function clearVideoProxyCache(cacheDir: string): Promise<number> {
  try {
    const entries = await fs.promises.readdir(cacheDir, { withFileTypes: true });
    let bytesDeleted = 0;
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith('proxy_seq_')) {
        const full = path.join(cacheDir, entry.name);
        try {
          const stat = await fs.promises.stat(full);
          bytesDeleted += stat.size;
          await fs.promises.unlink(full);
        } catch {}
      }
    }
    return bytesDeleted;
  } catch {
    return 0;
  }
}
