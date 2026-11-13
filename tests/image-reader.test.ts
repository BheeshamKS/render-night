import { IMAGE_MIME_TYPES, readImageAsDataUrl } from '../src/core/sequence/image-reader';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('readImageAsDataUrl', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rn-img-reader-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads a valid PNG file and returns base64 data URL', async () => {
    const pngPath = path.join(tmpDir, 'test.png');
    const dummyPngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await fs.promises.writeFile(pngPath, dummyPngBytes);

    const result = await readImageAsDataUrl(pngPath);
    expect(result).toBeDefined();
    expect(result).toBe(`data:image/png;base64,${dummyPngBytes.toString('base64')}`);
  });

  it('reads a valid JPG file and returns correct jpeg mime', async () => {
    const jpgPath = path.join(tmpDir, 'frame.jpg');
    const dummyJpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    await fs.promises.writeFile(jpgPath, dummyJpgBytes);

    const result = await readImageAsDataUrl(jpgPath);
    expect(result).toBe(`data:image/jpeg;base64,${dummyJpgBytes.toString('base64')}`);
  });

  it('reads WebP, BMP, and TIFF files with correct MIME types', async () => {
    expect(IMAGE_MIME_TYPES.webp).toBe('image/webp');
    expect(IMAGE_MIME_TYPES.bmp).toBe('image/bmp');
    expect(IMAGE_MIME_TYPES.tif).toBe('image/tiff');

    const webpPath = path.join(tmpDir, 'test.webp');
    await fs.promises.writeFile(webpPath, Buffer.from('RIFF....WEBP'));
    const result = await readImageAsDataUrl(webpPath);
    expect(result?.startsWith('data:image/webp;base64,')).toBe(true);
  });

  it('returns null for non-existent file path', async () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist.png');
    const result = await readImageAsDataUrl(nonExistent);
    expect(result).toBeNull();
  });

  it('returns null for empty or invalid file path', async () => {
    expect(await readImageAsDataUrl('')).toBeNull();
    // @ts-expect-error test invalid argument
    expect(await readImageAsDataUrl(null)).toBeNull();
  });
});
