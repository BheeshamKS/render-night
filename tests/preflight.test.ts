import { PreflightChecker } from '../src/core/preflight/preflight-checker';
import type { InspectScene } from '../src/core/schemas/inspect';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('PreflightChecker', () => {
  let tmpDir: string;
  let testExecutable: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-preflight-test-'));
    testExecutable = path.join(tmpDir, 'mock-blender');
    fs.writeFileSync(testExecutable, '#!/bin/sh\nexit 0', { mode: 0o755 });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const createDummyScene = (overrides?: Partial<InspectScene>): InspectScene => ({
    name: 'Scene',
    activeCamera: 'Camera',
    cameras: ['Camera'],
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
    imageSettings: {
      file_format: { value: 'PNG', type: 'ENUM', name: 'Format' },
    },
    ffmpeg: {},
    cycles: {},
    eevee: {},
    viewSettings: {},
    displaySettings: {},
    ...overrides,
  });

  it('passes cleanly for a well-configured job', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const report = checker.checkJob(
      {
        id: 'job-valid',
        fileName: 'valid.blend',
        filePath: path.join(tmpDir, 'valid.blend'),
        selectedScene: 'Scene',
        selectedCamera: 'Camera',
        scenes: [createDummyScene()],
        availableCameras: ['Camera'],
        outputPathPattern: path.join(outputDir, 'shot_####.png'),
        outputPreview: path.join(outputDir, 'shot_0001.png'),
        rangeConfig: { mode: 'scene_default' },
        overrides: {},
        savedWithVersion: '4.2.0',
      },
      {
        selectedBlender: { version: '4.2.0', executable: testExecutable },
      },
    );

    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it('detects missing texture, sound, or library assets as a warning', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const report = checker.checkJob(
      {
        id: 'job-missing-files',
        fileName: 'assets.blend',
        filePath: path.join(tmpDir, 'assets.blend'),
        selectedScene: 'Scene',
        selectedCamera: 'Camera',
        scenes: [createDummyScene()],
        availableCameras: ['Camera'],
        outputPathPattern: path.join(outputDir, 'shot_####.png'),
        outputPreview: path.join(outputDir, 'shot_0001.png'),
        rangeConfig: { mode: 'scene_default' },
        overrides: {},
        inspectData: {
          schemaVersion: 1,
          blenderVersion: '4.2.0',
          savedWithVersion: '4.2.0',
          blendPath: '/path/test.blend',
          activeScene: 'Scene',
          scenes: [],
          missingFiles: [
            { path: '/missing/texture.png', type: 'image', datablock: 'DiffuseMap' },
            { path: '/missing/sound.wav', type: 'sound', datablock: 'Voice' },
          ],
          cyclesDevices: [],
          engineItems: [],
          formatItems: [],
          codecItems: [],
          viewTransformItems: [],
          lookItems: [],
          deviceItems: [],
        },
      },
      {
        selectedBlender: { version: '4.2.0', executable: testExecutable },
      },
    );

    expect(report.errors).toHaveLength(0);
    expect(report.warnings.some((w) => w.code === 'MISSING_ASSETS')).toBe(true);
    expect(report.warnings[0].message).toContain('2 missing external asset');
  });

  it('detects file saved by a newer Blender than the selected executable as an error', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const report = checker.checkJob(
      {
        id: 'job-newer-file',
        fileName: 'newer.blend',
        filePath: path.join(tmpDir, 'newer.blend'),
        selectedScene: 'Scene',
        selectedCamera: 'Camera',
        scenes: [createDummyScene()],
        availableCameras: ['Camera'],
        outputPathPattern: path.join(outputDir, 'shot_####.png'),
        outputPreview: path.join(outputDir, 'shot_0001.png'),
        rangeConfig: { mode: 'scene_default' },
        overrides: {},
        savedWithVersion: '4.2.0',
      },
      {
        selectedBlender: { version: '3.6.0', executable: testExecutable },
      },
    );

    expect(report.errors.some((e) => e.code === 'NEWER_BLENDER_VERSION')).toBe(true);
    const err = report.errors.find((e) => e.code === 'NEWER_BLENDER_VERSION');
    expect(err?.message).toContain('v4.2.0');
    expect(err?.message).toContain('v3.6.0');
  });

  it('detects missing camera and non-existent Blender executable as errors', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const report = checker.checkJob(
      {
        id: 'job-no-cam',
        fileName: 'nocam.blend',
        filePath: path.join(tmpDir, 'nocam.blend'),
        selectedScene: 'Scene',
        selectedCamera: '',
        scenes: [createDummyScene({ cameras: [] })],
        availableCameras: [],
        outputPathPattern: path.join(outputDir, 'shot_####.png'),
        outputPreview: path.join(outputDir, 'shot_0001.png'),
        rangeConfig: { mode: 'scene_default' },
        overrides: {},
      },
      {
        selectedBlender: { version: '4.2.0', executable: '/non/existent/blender' },
      },
    );

    expect(report.errors.some((e) => e.code === 'NO_ACTIVE_CAMERA')).toBe(true);
    expect(report.errors.some((e) => e.code === 'BLENDER_NOT_FOUND')).toBe(true);
  });

  it('detects video format combined with custom discontinuous range as error with quick fix', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const videoScene = createDummyScene({
      imageSettings: {
        file_format: { value: 'FFMPEG', type: 'ENUM', name: 'Format' },
      },
    });

    const report = checker.checkJob(
      {
        id: 'job-video-multi-range',
        fileName: 'video.blend',
        filePath: path.join(tmpDir, 'video.blend'),
        selectedScene: 'Scene',
        selectedCamera: 'Camera',
        scenes: [videoScene],
        availableCameras: ['Camera'],
        outputPathPattern: path.join(outputDir, 'video.mp4'),
        outputPreview: path.join(outputDir, 'video.mp4'),
        rangeConfig: { mode: 'custom', customExpression: '1-10, 20-30' },
        overrides: {},
      },
      {
        selectedBlender: { version: '4.2.0', executable: testExecutable },
      },
    );

    expect(report.errors.some((e) => e.code === 'VIDEO_RANGE_RULE_VIOLATION')).toBe(true);
    const issue = report.errors.find((e) => e.code === 'VIDEO_RANGE_RULE_VIOLATION');
    expect(issue?.quickFix?.action).toBe('switch_range_to_continuous');
  });

  it('detects GPU request without compatible devices as warning', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const report = checker.checkJob(
      {
        id: 'job-no-gpu',
        fileName: 'nogpu.blend',
        filePath: path.join(tmpDir, 'nogpu.blend'),
        selectedScene: 'Scene',
        selectedCamera: 'Camera',
        scenes: [createDummyScene()],
        availableCameras: ['Camera'],
        outputPathPattern: path.join(outputDir, 'shot_####.png'),
        outputPreview: path.join(outputDir, 'shot_0001.png'),
        rangeConfig: { mode: 'scene_default' },
        overrides: { 'scene.cycles.device': 'GPU' },
        inspectData: {
          schemaVersion: 1,
          blenderVersion: '4.2.0',
          savedWithVersion: '4.2.0',
          blendPath: '/path/test.blend',
          activeScene: 'Scene',
          scenes: [],
          missingFiles: [],
          cyclesDevices: [{ name: 'CPU', type: 'CPU', use: true }],
          engineItems: [],
          formatItems: [],
          codecItems: [],
          viewTransformItems: [],
          lookItems: [],
          deviceItems: [],
        },
      },
      {
        selectedBlender: { version: '4.2.0', executable: testExecutable },
      },
    );

    expect(report.warnings.some((w) => w.code === 'NO_COMPATIBLE_GPU')).toBe(true);
  });

  it('detects Windows long path risk as warning', () => {
    const checker = new PreflightChecker();
    const longDir = path.join(tmpDir, 'a'.repeat(240));
    fs.mkdirSync(longDir, { recursive: true });
    const longPreview = path.join(longDir, 'very_long_file_name_output_render_0001.png');

    const report = checker.checkJob(
      {
        id: 'job-long-path',
        fileName: 'long.blend',
        filePath: path.join(tmpDir, 'long.blend'),
        selectedScene: 'Scene',
        selectedCamera: 'Camera',
        scenes: [createDummyScene()],
        availableCameras: ['Camera'],
        outputPathPattern: `${longDir}/shot_####.png`,
        outputPreview: longPreview,
        rangeConfig: { mode: 'scene_default' },
        overrides: {},
      },
      {
        selectedBlender: { version: '4.2.0', executable: testExecutable },
        platform: 'win32',
      },
    );

    expect(report.warnings.some((w) => w.code === 'WINDOWS_LONG_PATH')).toBe(true);
  });

  it('aggregates multiple jobs into a complete report', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const jobGood = {
      id: 'job-good',
      fileName: 'good.blend',
      filePath: path.join(tmpDir, 'good.blend'),
      selectedScene: 'Scene',
      selectedCamera: 'Camera',
      scenes: [createDummyScene()],
      availableCameras: ['Camera'],
      outputPathPattern: path.join(outputDir, 'good_####.png'),
      outputPreview: path.join(outputDir, 'good_0001.png'),
      rangeConfig: { mode: 'scene_default' as const },
      overrides: {},
    };

    const jobBad = {
      id: 'job-bad',
      fileName: 'bad.blend',
      filePath: path.join(tmpDir, 'bad.blend'),
      selectedScene: 'Scene',
      selectedCamera: '',
      scenes: [createDummyScene({ cameras: [] })],
      availableCameras: [],
      outputPathPattern: path.join(outputDir, 'bad_####.png'),
      outputPreview: path.join(outputDir, 'bad_0001.png'),
      rangeConfig: { mode: 'scene_default' as const },
      overrides: {},
    };

    const fullReport = checker.checkAllJobs([jobGood, jobBad], {
      selectedBlender: { version: '4.2.0', executable: testExecutable },
    });

    expect(fullReport.hasErrors).toBe(true);
    expect(fullReport.errors).toHaveLength(1);
    expect(fullReport.jobReports).toHaveLength(2);
    expect(fullReport.jobReports[0].errors).toHaveLength(0);
    expect(fullReport.jobReports[1].errors).toHaveLength(1);
  });
});
