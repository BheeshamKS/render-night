import * as fs from 'node:fs';
import * as path from 'node:path';

export const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  tga: 'image/x-tga',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

/**
 * Reads a local image file from disk and returns a standards-compliant base64 data URL.
 * Returns null if the file cannot be accessed or read.
 */
export async function readImageAsDataUrl(filePath: string): Promise<string | null> {
  if (!filePath || typeof filePath !== 'string') return null;
  try {
    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    const mime = IMAGE_MIME_TYPES[ext] || 'image/png';
    const buf = await fs.promises.readFile(filePath);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
