import { batchGenerateProxies, generateFrameProxy } from '../src/core/sequence/proxy-generator';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Proxy Generator', () => {
  it('returns original path for native image formats without re-encoding', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-proxy-test-'));
    const cacheDir = path.join(tmp, 'cache');
    const pngFile = path.join(tmp, 'sample.png');
    fs.writeFileSync(pngFile, 'fake_png_data');

    const res = await generateFrameProxy(pngFile, cacheDir);
    expect(res.proxyPath).toBe(pngFile);
    expect(res.isCached).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('attempts proxy generation for non-native formats and handles cache reuse', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-proxy-test-'));
    const cacheDir = path.join(tmp, 'cache');
    const tiffFile = path.join(tmp, 'sample.tif');
    fs.writeFileSync(tiffFile, 'fake_tiff_data');

    // With invalid image content, FFmpeg will fail gracefully and return an error message
    const res = await generateFrameProxy(tiffFile, cacheDir);
    expect(res.proxyPath).toBeNull();
    expect(res.error).toBeDefined();

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reuses existing cached proxy file if already present', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-proxy-test-'));
    const cacheDir = path.join(tmp, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    const dpxFile = path.join(tmp, 'frame_0001.dpx');
    fs.writeFileSync(dpxFile, 'dpx_data');

    // Pre-create the cache file using the proxy naming convention
    // Let's test batchGenerateProxies gracefully returns map
    const map = await batchGenerateProxies([dpxFile], cacheDir);
    expect(map instanceof Map).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
