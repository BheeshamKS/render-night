import { PreflightChecker, type PreflightJobInput } from '../src/core/preflight';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('Pre-Flight Acceptance: Deliberately Broken Fixture Set', () => {
  it('triggers the exact expected errors and warnings for the broken fixture set', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-preflight-broken-fixtures-'));
    const readonlyDir = path.join(tmpDir, 'readonly_dir');
    fs.mkdirSync(readonlyDir, { recursive: true });

    // Make readonly on POSIX systems
    try {
      fs.chmodSync(readonlyDir, 0o444);
    } catch {
      // ignore
    }

    // 1. Broken Job 1: Missing textures & external assets
    const jobMissingTexture: PreflightJobInput = {
      id: 'job-missing-texture',
      fileName: 'architectural_render.blend',
      filePath: path.join(tmpDir, 'architectural_render.blend'),
      selectedScene: 'Scene',
      selectedCamera: 'Camera_Main',
      scenes: [
        {
          name: 'Scene',
          activeCamera: 'Camera_Main',
          cameras: ['Camera_Main'],
          viewLayers: ['ViewLayer'],
          frameStart: 1,
          frameEnd: 100,
          frameStep: 1,
          fps: 24,
          fpsBase: 1,
          resolutionX: 1920,
          resolutionY: 1080,
          resolutionPercentage: 100,
          render: {},
          imageSettings: {},
          ffmpeg: {},
          cycles: {},
          eevee: {},
          viewSettings: {},
          displaySettings: {},
        },
      ],
      availableCameras: ['Camera_Main'],
      outputPathPattern: path.join(tmpDir, 'output/frame_####.png'),
      outputPreview: path.join(tmpDir, 'output/frame_0001.png'),
      rangeConfig: { mode: 'scene_default' },
      inspectData: {
        schemaVersion: 1,
        blenderVersion: '4.2.0',
        savedWithVersion: '4.2.0',
        blendPath: path.join(tmpDir, 'architectural_render.blend'),
        activeScene: 'Scene',
        scenes: [],
        missingFiles: [
          {
            path: '//textures/marble_diffuse_4k.png',
            type: 'image',
            datablock: 'MarbleMaterial',
          },
          {
            path: '//assets/props.blend',
            type: 'library',
            datablock: 'FurnitureProps',
          },
        ],
        cyclesDevices: [],
        engineItems: [],
        formatItems: [],
        codecItems: [],
        viewTransformItems: [],
        lookItems: [],
        deviceItems: [],
      },
    };

    // 2. Broken Job 2: Saved with NEWER Blender than selected executable
    const jobNewerVersion: PreflightJobInput = {
      id: 'job-newer-version',
      fileName: 'future_feature.blend',
      filePath: path.join(tmpDir, 'future_feature.blend'),
      selectedScene: 'Scene',
      selectedCamera: 'Camera_Main',
      savedWithVersion: '5.1.0',
      scenes: [
        {
          name: 'Scene',
          activeCamera: 'Camera_Main',
          cameras: ['Camera_Main'],
          viewLayers: ['ViewLayer'],
          frameStart: 1,
          frameEnd: 250,
          frameStep: 1,
          fps: 24,
          fpsBase: 1,
          resolutionX: 1920,
          resolutionY: 1080,
          resolutionPercentage: 100,
          render: {},
          imageSettings: {},
          ffmpeg: {},
          cycles: {},
          eevee: {},
          viewSettings: {},
          displaySettings: {},
        },
      ],
      availableCameras: ['Camera_Main'],
      outputPathPattern: path.join(tmpDir, 'output2/frame_####.png'),
      outputPreview: path.join(tmpDir, 'output2/frame_0001.png'),
      rangeConfig: { mode: 'scene_default' },
    };

    // 3. Broken Job 3: Video format combined with discontinuous custom range
    const jobVideoMultiRange: PreflightJobInput = {
      id: 'job-video-multi-range',
      fileName: 'animation_clip.blend',
      filePath: path.join(tmpDir, 'animation_clip.blend'),
      selectedScene: 'Scene',
      selectedCamera: 'Camera_Main',
      scenes: [
        {
          name: 'Scene',
          activeCamera: 'Camera_Main',
          cameras: ['Camera_Main'],
          viewLayers: ['ViewLayer'],
          frameStart: 1,
          frameEnd: 250,
          frameStep: 1,
          fps: 24,
          fpsBase: 1,
          resolutionX: 1920,
          resolutionY: 1080,
          resolutionPercentage: 100,
          render: {},
          imageSettings: {
            file_format: { value: 'FFMPEG' },
          },
          ffmpeg: {},
          cycles: {},
          eevee: {},
          viewSettings: {},
          displaySettings: {},
        },
      ],
      availableCameras: ['Camera_Main'],
      outputPathPattern: path.join(tmpDir, 'output3/animation.mp4'),
      outputPreview: path.join(tmpDir, 'output3/animation.mp4'),
      rangeConfig: {
        mode: 'custom',
        customExpression: '1-10, 25-50, 80',
      },
    };

    // 4. Broken Job 4: Output directory not writable
    const jobReadonlyOutput: PreflightJobInput = {
      id: 'job-readonly-output',
      fileName: 'protected_render.blend',
      filePath: path.join(tmpDir, 'protected_render.blend'),
      selectedScene: 'Scene',
      selectedCamera: 'Camera_Main',
      scenes: [
        {
          name: 'Scene',
          activeCamera: 'Camera_Main',
          cameras: ['Camera_Main'],
          viewLayers: ['ViewLayer'],
          frameStart: 1,
          frameEnd: 50,
          frameStep: 1,
          fps: 24,
          fpsBase: 1,
          resolutionX: 1920,
          resolutionY: 1080,
          resolutionPercentage: 100,
          render: {},
          imageSettings: {},
          ffmpeg: {},
          cycles: {},
          eevee: {},
          viewSettings: {},
          displaySettings: {},
        },
      ],
      availableCameras: ['Camera_Main'],
      outputPathPattern: path.join(readonlyDir, 'subfolder/frame_####.png'),
      outputPreview: path.join(readonlyDir, 'subfolder/frame_0001.png'),
      rangeConfig: { mode: 'scene_default' },
    };

    // Instantiate PreflightChecker
    const checker = new PreflightChecker();
    const testExecutable = path.resolve(__dirname, '../tools/mock-blender/index.js');

    // Check broken fixture set with selected Blender v4.2.0
    const report = checker.checkAllJobs(
      [jobMissingTexture, jobNewerVersion, jobVideoMultiRange, jobReadonlyOutput],
      {
        selectedBlender: {
          version: '4.2.0',
          executable: testExecutable,
        },
      },
    );

    // 1. Queue must be blocked due to errors
    expect(report.hasErrors).toBe(true);
    expect(report.hasWarnings).toBe(true);

    // Verify Job 1 (Missing assets) triggers warning
    const rep1 = report.jobReports.find((r) => r.jobId === 'job-missing-texture');
    expect(rep1).toBeDefined();
    expect(rep1?.errors.length).toBe(0);
    expect(rep1?.warnings.length).toBeGreaterThanOrEqual(1);
    const missingAssetWarn = rep1?.warnings.find((w) => w.code === 'MISSING_ASSETS');
    expect(missingAssetWarn).toBeDefined();
    expect(missingAssetWarn?.severity).toBe('warning');
    expect(missingAssetWarn?.message).toContain('2 missing external asset(s)');

    // Verify Job 2 (Newer Blender file) triggers error
    const rep2 = report.jobReports.find((r) => r.jobId === 'job-newer-version');
    expect(rep2).toBeDefined();
    const newerVersionErr = rep2?.errors.find((e) => e.code === 'NEWER_BLENDER_VERSION');
    expect(newerVersionErr).toBeDefined();
    expect(newerVersionErr?.severity).toBe('error');
    expect(newerVersionErr?.message).toContain('v5.1.0');
    expect(newerVersionErr?.message).toContain('v4.2.0');

    // Verify Job 3 (Video format + multi-range) triggers error with quick fix
    const rep3 = report.jobReports.find((r) => r.jobId === 'job-video-multi-range');
    expect(rep3).toBeDefined();
    const videoRangeErr = rep3?.errors.find((e) => e.code === 'VIDEO_RANGE_RULE_VIOLATION');
    expect(videoRangeErr).toBeDefined();
    expect(videoRangeErr?.severity).toBe('error');
    expect(videoRangeErr?.quickFix?.action).toBe('switch_range_to_continuous');

    // Quick fix test: switch Job 3 range to continuous and verify error clears
    const fixedJob3: PreflightJobInput = {
      ...jobVideoMultiRange,
      rangeConfig: {
        mode: 'simple',
        simple: { start: 1, end: 100, step: 1 },
      },
    };
    const rep3Fixed = checker.checkJob(fixedJob3);
    expect(rep3Fixed.errors.find((e) => e.code === 'VIDEO_RANGE_RULE_VIOLATION')).toBeUndefined();

    // Verify Job 4 (Readonly output) triggers unwritable error on POSIX
    if (process.platform !== 'win32') {
      const rep4 = report.jobReports.find((r) => r.jobId === 'job-readonly-output');
      expect(rep4).toBeDefined();
      const unwritableErr = rep4?.errors.find((e) => e.code === 'OUTPUT_DIR_NOT_WRITABLE');
      expect(unwritableErr).toBeDefined();
      expect(unwritableErr?.severity).toBe('error');
    }

    // Cleanup
    try {
      fs.chmodSync(readonlyDir, 0o777);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('passes completely for a clean, verified job', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-preflight-clean-'));
    const outDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });

    const cleanJob: PreflightJobInput = {
      id: 'job-clean',
      fileName: 'clean_project.blend',
      filePath: path.join(tmpDir, 'clean_project.blend'),
      selectedScene: 'Scene',
      selectedCamera: 'Camera_Main',
      savedWithVersion: '4.2.0',
      scenes: [
        {
          name: 'Scene',
          activeCamera: 'Camera_Main',
          cameras: ['Camera_Main'],
          viewLayers: ['ViewLayer'],
          frameStart: 1,
          frameEnd: 100,
          frameStep: 1,
          fps: 24,
          fpsBase: 1,
          resolutionX: 1920,
          resolutionY: 1080,
          resolutionPercentage: 100,
          render: {},
          imageSettings: {},
          ffmpeg: {},
          cycles: {},
          eevee: {},
          viewSettings: {},
          displaySettings: {},
        },
      ],
      availableCameras: ['Camera_Main'],
      outputPathPattern: path.join(outDir, 'frame_####.png'),
      outputPreview: path.join(outDir, 'frame_0001.png'),
      rangeConfig: { mode: 'scene_default' },
      inspectData: {
        schemaVersion: 1,
        blenderVersion: '4.2.0',
        savedWithVersion: '4.2.0',
        blendPath: path.join(tmpDir, 'clean_project.blend'),
        activeScene: 'Scene',
        scenes: [],
        missingFiles: [],
        cyclesDevices: [],
        engineItems: [],
        formatItems: [],
        codecItems: [],
        viewTransformItems: [],
        lookItems: [],
        deviceItems: [],
      },
    };

    const checker = new PreflightChecker();
    const testExecutable = path.resolve(__dirname, '../tools/mock-blender/index.js');
    const report = checker.checkAllJobs([cleanJob], {
      selectedBlender: {
        version: '4.2.0',
        executable: testExecutable,
      },
      checkDiskSpace: false,
    });

    expect(report.hasErrors).toBe(false);
    expect(report.hasWarnings).toBe(false);
    expect(report.errors.length).toBe(0);
    expect(report.warnings.length).toBe(0);
    expect(report.jobReports[0].errors.length).toBe(0);
    expect(report.jobReports[0].warnings.length).toBe(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
