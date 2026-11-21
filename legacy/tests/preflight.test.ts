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

    // Write placeholder blend files so checkDiskAccess sees real files unless intentionally missing
    fs.writeFileSync(path.join(tmpDir, 'valid.blend'), 'dummy');
    fs.writeFileSync(path.join(tmpDir, 'assets.blend'), 'dummy');
    fs.writeFileSync(path.join(tmpDir, 'newer.blend'), 'dummy');
    fs.writeFileSync(path.join(tmpDir, 'nocam.blend'), 'dummy');
    fs.writeFileSync(path.join(tmpDir, 'video.blend'), 'dummy');
    fs.writeFileSync(path.join(tmpDir, 'nogpu.blend'), 'dummy');
    fs.writeFileSync(path.join(tmpDir, 'long.blend'), 'dummy');
    fs.writeFileSync(path.join(tmpDir, 'good.blend'), 'dummy');
    fs.writeFileSync(path.join(tmpDir, 'relevance.blend'), 'dummy');
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
    expect(report.isBlocked).toBe(false);
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
    expect(report.isBlocked).toBe(false);
    expect(report.warnings.some((w) => w.code === 'MISSING_ASSETS')).toBe(true);
    expect(report.warnings[0].message).toContain('2 missing external asset');
  });

  it('classifies asset relevance: used missing triggers warning, unused missing becomes info count', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    const report = checker.checkJob(
      {
        id: 'job-relevance',
        fileName: 'relevance.blend',
        filePath: path.join(tmpDir, 'relevance.blend'),
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
            {
              path: '/used/wood.png',
              type: 'image',
              datablock: 'WoodMat',
              relevance: 'used',
            },
            {
              path: '/unused/scratch.png',
              type: 'image',
              datablock: 'UnusedMat',
              relevance: 'unused',
            },
            {
              path: '/unused/old_lib.blend',
              type: 'library',
              datablock: 'OldLib',
              relevance: 'unused',
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
      },
      {
        selectedBlender: { version: '4.2.0', executable: testExecutable },
      },
    );

    // Only 1 used asset produces a warning
    expect(report.warnings.some((w) => w.code === 'MISSING_ASSETS')).toBe(true);
    const missingWarn = report.warnings.find((w) => w.code === 'MISSING_ASSETS');
    expect(missingWarn?.message).toContain('1 missing external asset');
    // 2 unused missing files are tracked in unusedMissingCount, not as warnings
    expect(report.unusedMissingCount).toBe(2);
    expect(report.isBlocked).toBe(false);
  });

  it('detects file saved by a newer Blender than the selected executable as a warning', () => {
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

    expect(report.warnings.some((w) => w.code === 'NEWER_BLENDER_VERSION')).toBe(true);
    const warn = report.warnings.find((w) => w.code === 'NEWER_BLENDER_VERSION');
    expect(warn?.message).toContain('v4.2.0');
    expect(warn?.message).toContain('v3.6.0');
    expect(warn?.isBlocking).toBe(false);
    expect(report.isBlocked).toBe(false);
  });

  it('detects non-existent Blender executable as blocking error and missing camera as warning', () => {
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

    expect(report.warnings.some((w) => w.code === 'NO_ACTIVE_CAMERA')).toBe(true);
    expect(report.errors.some((e) => e.code === 'BLENDER_NOT_FOUND')).toBe(true);
    expect(report.isBlocked).toBe(true);
  });

  it('detects video format combined with custom discontinuous range as warning with quick fix', () => {
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

    expect(report.warnings.some((w) => w.code === 'VIDEO_RANGE_RULE_VIOLATION')).toBe(true);
    const issue = report.warnings.find((w) => w.code === 'VIDEO_RANGE_RULE_VIOLATION');
    expect(issue?.quickFix?.action).toBe('switch_range_to_continuous');
    expect(report.isBlocked).toBe(false);
  });

  it('supports warning suppression: ignore single warning, ignore code, ignore all', () => {
    const checker = new PreflightChecker();
    const outputDir = path.join(tmpDir, 'renders');
    fs.mkdirSync(outputDir, { recursive: true });

    // Base job with 2 warnings (Newer version + No camera)
    const baseJob = {
      id: 'job-suppress',
      fileName: 'newer.blend',
      filePath: path.join(tmpDir, 'newer.blend'),
      selectedScene: 'Scene',
      selectedCamera: '',
      scenes: [createDummyScene({ cameras: [] })],
      availableCameras: [],
      outputPathPattern: path.join(outputDir, 'shot_####.png'),
      outputPreview: path.join(outputDir, 'shot_0001.png'),
      rangeConfig: { mode: 'scene_default' as const },
      overrides: {},
      savedWithVersion: '5.0.0',
    };

    const opt = { selectedBlender: { version: '4.2.0', executable: testExecutable } };

    // 1. Without suppression: 2 warnings
    const r1 = checker.checkJob(baseJob, opt);
    expect(r1.warnings).toHaveLength(2);

    // 2. Suppress single warning by ID
    const noCamIssue = r1.warnings.find((w) => w.code === 'NO_ACTIVE_CAMERA');
    expect(noCamIssue).toBeDefined();
    const r2 = checker.checkJob({ ...baseJob, ignoredWarningIds: [noCamIssue!.id] }, opt);
    expect(r2.warnings).toHaveLength(1);
    expect(r2.warnings[0].code).toBe('NEWER_BLENDER_VERSION');

    // 3. Suppress all warnings of code NEWER_BLENDER_VERSION
    const r3 = checker.checkJob(
      { ...baseJob, ignoredWarningCodes: ['NEWER_BLENDER_VERSION'] },
      opt,
    );
    expect(r3.warnings).toHaveLength(1);
    expect(r3.warnings[0].code).toBe('NO_ACTIVE_CAMERA');

    // 4. Suppress all warnings
    const r4 = checker.checkJob({ ...baseJob, ignoreAllWarnings: true }, opt);
    expect(r4.warnings).toHaveLength(0);
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
    expect(report.isBlocked).toBe(false);
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
    expect(report.isBlocked).toBe(false);
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

    // jobBad points to non-existent bad.blend on disk -> triggers BLEND_NOT_FOUND (error)
    const jobBad = {
      id: 'job-bad',
      fileName: 'bad.blend',
      filePath: path.join(tmpDir, 'non_existent_bad.blend'),
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
    expect(fullReport.isBlocked).toBe(true);
    expect(fullReport.errors).toHaveLength(1);
    expect(fullReport.errors[0].code).toBe('BLEND_NOT_FOUND');
    expect(fullReport.jobReports).toHaveLength(2);
    expect(fullReport.jobReports[0].errors).toHaveLength(0);
    expect(fullReport.jobReports[1].errors).toHaveLength(1);
  });
});
