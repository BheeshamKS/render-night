import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cliBundle = path.resolve(__dirname, '../dist-cli/night-render.cjs');
const mockBlender = path.resolve(__dirname, '../tools/mock-blender/index.js');

describe('End-to-End Headless CLI Acceptance', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-cli-e2e-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('runs a queue.json with two jobs end-to-end against mock-blender and exits with code 0', async () => {
    const blend1 = path.join(tmpDir, 'shot1.blend');
    const blend2 = path.join(tmpDir, 'shot2.blend');
    fs.writeFileSync(blend1, 'BLENDER_DUMMY_1');
    fs.writeFileSync(blend2, 'BLENDER_DUMMY_2');

    const outDir1 = path.join(tmpDir, 'out1');
    const outDir2 = path.join(tmpDir, 'out2');
    fs.mkdirSync(outDir1, { recursive: true });
    fs.mkdirSync(outDir2, { recursive: true });

    const queueFile = path.join(tmpDir, 'queue.json');
    const queueData = {
      blender: mockBlender,
      jobs: [
        {
          id: 'job-1',
          blendPath: blend1,
          camera: 'Camera',
          range: '1-3',
          outputPattern: path.join(outDir1, 'frame_####.png'),
        },
        {
          id: 'job-2',
          blendPath: blend2,
          camera: 'Camera',
          range: '10-12',
          outputPattern: path.join(outDir2, 'shot2_####.png'),
        },
      ],
    };
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2));

    const { stdout } = await execFileAsync('node', [cliBundle, '--queue', queueFile]);

    // Verify stdout summary
    expect(stdout).toMatch(/Total Jobs:\s+2/);
    expect(stdout).toMatch(/Completed Jobs:\s+2/);
    expect(stdout).toMatch(/Completed Frames:\s+6/);
    expect(stdout).toMatch(/Failed Frames:\s+0/);

    // Verify all rendered frame files exist
    expect(fs.existsSync(path.join(outDir1, 'frame_0001.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir1, 'frame_0002.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir1, 'frame_0003.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir2, 'shot2_0010.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir2, 'shot2_0011.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir2, 'shot2_0012.png'))).toBe(true);
  });

  it('resumes after interruption: skips existing frames and renders missing frames only', async () => {
    const blend = path.join(tmpDir, 'resume_test.blend');
    fs.writeFileSync(blend, 'BLENDER_DUMMY');

    const outDir = path.join(tmpDir, 'out_resume');
    fs.mkdirSync(outDir, { recursive: true });

    // Pre-populate frames 1 and 2 (as if rendered before an abrupt kill/crash)
    fs.writeFileSync(path.join(outDir, 'shot_0001.png'), 'EXISTING_FRAME_1');
    fs.writeFileSync(path.join(outDir, 'shot_0002.png'), 'EXISTING_FRAME_2');

    const queueFile = path.join(tmpDir, 'resume_queue.json');
    const queueData = {
      blender: mockBlender,
      jobs: [
        {
          blendPath: blend,
          camera: 'Camera',
          range: '1-4',
          outputPattern: path.join(outDir, 'shot_####.png'),
        },
      ],
    };
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2));

    // Run CLI with --resume flag
    const { stdout } = await execFileAsync('node', [cliBundle, '--queue', queueFile, '--resume']);

    expect(stdout).toMatch(/Completed Frames:\s+2/); // Only frames 3 and 4 rendered
    expect(fs.existsSync(path.join(outDir, 'shot_0003.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'shot_0004.png'))).toBe(true);
    // Verify existing frames were preserved
    expect(fs.readFileSync(path.join(outDir, 'shot_0001.png'), 'utf8')).toBe('EXISTING_FRAME_1');
    expect(fs.readFileSync(path.join(outDir, 'shot_0002.png'), 'utf8')).toBe('EXISTING_FRAME_2');
  });

  it('exits with code 2 on invalid input (missing file, bad schema, bad flags)', async () => {
    // 1. Missing queue file
    try {
      await execFileAsync('node', [cliBundle, '--queue', path.join(tmpDir, 'missing.json')]);
      expect.fail('Expected exit code 2');
    } catch (err: unknown) {
      expect((err as { code?: number }).code).toBe(2);
    }

    // 2. Malformed JSON
    const badJson = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badJson, 'not-valid-json');
    try {
      await execFileAsync('node', [cliBundle, '--queue', badJson]);
      expect.fail('Expected exit code 2');
    } catch (err: unknown) {
      expect((err as { code?: number }).code).toBe(2);
    }

    // 3. Schema validation error (empty jobs list)
    const emptyJobs = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(emptyJobs, JSON.stringify({ jobs: [] }));
    try {
      await execFileAsync('node', [cliBundle, '--queue', emptyJobs]);
      expect.fail('Expected exit code 2');
    } catch (err: unknown) {
      expect((err as { code?: number }).code).toBe(2);
    }

    // 4. Unknown flag
    try {
      await execFileAsync('node', [cliBundle, '--invalid-argument-flag']);
      expect.fail('Expected exit code 2');
    } catch (err: unknown) {
      expect((err as { code?: number }).code).toBe(2);
    }
  });

  it('exits with code 1 when preflight validation fails', async () => {
    const blend = path.join(tmpDir, 'preflight_fail.blend');
    fs.writeFileSync(blend, 'BLENDER_DUMMY');

    const queueFile = path.join(tmpDir, 'preflight_fail_queue.json');
    const queueData = {
      blender: mockBlender,
      jobs: [
        {
          blendPath: blend,
          camera: 'Camera',
          // Discontinuous multi-range with video container violates rule
          range: '1-10, 15, 20-30',
          overrides: {
            'scene.render.image_settings.file_format': 'FFMPEG',
          },
        },
      ],
    };
    fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2));

    try {
      await execFileAsync('node', [cliBundle, '--queue', queueFile]);
      expect.fail('Expected exit code 1 for preflight error');
    } catch (err: unknown) {
      expect((err as { code?: number }).code).toBe(1);
      expect((err as { stderr?: string }).stderr).toMatch(/VIDEO_RANGE_RULE_VIOLATION/);
    }
  });
});
