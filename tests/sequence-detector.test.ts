import { detectSequence, findSequencesInDirectory } from '../src/core/sequence/sequence-detector';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sequence Detector', () => {
  it('detects numbered frames, calculates range, and identifies missing frames', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-seq-test-'));
    // Create frames 1, 2, 4, 5 (missing frame 3)
    [1, 2, 4, 5].forEach((f) => {
      fs.writeFileSync(path.join(tmp, `shot_${String(f).padStart(4, '0')}.png`), 'data');
    });

    const info = await detectSequence(tmp);
    expect(info).not.toBeNull();
    expect(info?.startFrame).toBe(1);
    expect(info?.endFrame).toBe(5);
    expect(info?.totalFrames).toBe(4);
    expect(info?.missingFrames).toEqual([3]);
    expect(info?.extension).toBe('png');
    expect(info?.isNativeFormat).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('detects sequence from a specific file path within the sequence', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-seq-test-'));
    [1, 2, 3].forEach((f) => {
      fs.writeFileSync(path.join(tmp, `render_${String(f).padStart(4, '0')}.exr`), 'data');
    });

    const singleFilePath = path.join(tmp, 'render_0002.exr');
    const info = await detectSequence(singleFilePath);
    expect(info).not.toBeNull();
    expect(info?.startFrame).toBe(1);
    expect(info?.endFrame).toBe(3);
    expect(info?.totalFrames).toBe(3);
    expect(info?.missingFrames).toHaveLength(0);
    expect(info?.extension).toBe('exr');
    expect(info?.isNativeFormat).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('finds multiple distinct sequences in a directory', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-seq-test-'));
    ['cam1_0001.png', 'cam1_0002.png', 'cam2_0001.jpg', 'cam2_0002.jpg'].forEach((name) => {
      fs.writeFileSync(path.join(tmp, name), 'data');
    });

    const sequences = await findSequencesInDirectory(tmp);
    expect(sequences).toHaveLength(2);
    expect(sequences.map((s) => s.baseName).sort()).toEqual(['cam1_', 'cam2_']);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null if no image sequence exists in directory', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-seq-test-'));
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'hello');
    fs.writeFileSync(path.join(tmp, 'project.blend'), 'blend');

    const info = await detectSequence(tmp);
    expect(info).toBeNull();

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
