import { inspectBlend, InspectorError } from '../src/core/blender/inspector';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Blender Inspector Bridge', () => {
  const mockBlenderPath = path.resolve(__dirname, '../tools/mock-blender/index.js');
  const tempDir = path.join(os.tmpdir(), 'rn-inspector-tests');
  const validBlend = path.join(tempDir, 'valid.blend');
  const corruptBlend = path.join(tempDir, 'corrupt.blend');

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    // Write 12-byte valid header: BLENDER_v402
    fs.writeFileSync(validBlend, Buffer.from('BLENDER_v402_dummy_content'));
    // Write invalid/corrupt blend
    fs.writeFileSync(corruptBlend, Buffer.from('BLENDER_v402_corrupted_data'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('inspects a valid blend file using mock blender executable', async () => {
    const result = await inspectBlend(validBlend, [process.execPath, mockBlenderPath]);

    expect(result).toBeDefined();
    expect(result.blenderVersion).toBe('4.2.0');
    expect(result.savedWithVersion).toBe('4.2.0');
    expect(result.scenes.length).toBeGreaterThan(0);
    expect(result.scenes[0].name).toBe('Scene');
  });

  it('rejects with InspectorError and stderr tail when Blender fails', async () => {
    await expect(inspectBlend(corruptBlend, [process.execPath, mockBlenderPath])).rejects.toThrow(
      InspectorError,
    );

    try {
      await inspectBlend(corruptBlend, [process.execPath, mockBlenderPath]);
    } catch (err) {
      expect(err).toBeInstanceOf(InspectorError);
      expect((err as InspectorError).message).toContain('corrupted blend file');
    }
  });

  it('throws error when blend file does not exist', async () => {
    await expect(
      inspectBlend('/nonexistent/path/does_not_exist.blend', [process.execPath, mockBlenderPath]),
    ).rejects.toThrow();
  });
});
