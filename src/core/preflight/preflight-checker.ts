import { compareVersions } from '../blender/version-compare';
import { isFormatVideo, resolveFrameRange, validateRangeForFormat } from '../ranges/frame-range';
import type { InspectOutput, InspectScene } from '../schemas/inspect';
import type { OverrideMap } from '../schemas/override';
import type { PreflightIssue, PreflightJobReport, PreflightReport } from '../schemas/preflight';
import type { FrameRangeConfig } from '../schemas/queue-state';

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PreflightJobInput {
  id: string;
  fileName: string;
  filePath: string;
  selectedScene?: string;
  selectedCamera?: string;
  scenes?: InspectScene[];
  availableCameras?: string[];
  outputPathPattern?: string;
  outputPreview?: string;
  rangeConfig?: FrameRangeConfig;
  overrides?: OverrideMap;
  savedWithVersion?: string;
  inspectData?: InspectOutput;
  deviceReport?: {
    requestedGpu?: boolean;
    engine?: string;
  };
}

export interface PreflightOptions {
  selectedBlender?: {
    version: string;
    executable: string;
  };
  minFreeDiskSpaceMb?: number;
  platform?: NodeJS.Platform;
  checkDiskAccess?: boolean;
  checkDiskSpace?: boolean;
}

export class PreflightChecker {
  /**
   * Runs pre-flight checks for a single job.
   */
  checkJob(job: PreflightJobInput, options: PreflightOptions = {}): PreflightJobReport {
    const errors: PreflightIssue[] = [];
    const warnings: PreflightIssue[] = [];

    const minSpaceMb = options.minFreeDiskSpaceMb ?? 1024;
    const platform = options.platform ?? process.platform;
    const selectedBlender = options.selectedBlender;

    const currentScene = job.scenes?.find((s) => s.name === job.selectedScene) || job.scenes?.[0];

    // 1. Missing external files (textures, sounds, libraries)
    const missingFiles = job.inspectData?.missingFiles || [];
    if (missingFiles.length > 0) {
      warnings.push({
        id: `pf-${job.id}-missing-assets`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'MISSING_ASSETS',
        severity: 'warning',
        message: `Found ${missingFiles.length} missing external asset(s) (e.g. ${missingFiles[0].path}).`,
        details: missingFiles.map((m) => `[${m.type}] ${m.path} (${m.datablock || ''})`).join('\n'),
      });
    }

    // 2. Output path writeability & free disk space
    const preview = job.outputPreview || job.outputPathPattern || '';
    if (preview) {
      const outputDir = preview.startsWith('//')
        ? preview.replace(/^\/\//, `${path.dirname(job.filePath)}/`).replace(/[/\\][^/\\]+$/, '')
        : path.dirname(preview);

      if (options.checkDiskAccess !== false) {
        try {
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          fs.accessSync(outputDir, fs.constants.W_OK);
        } catch (err) {
          errors.push({
            id: `pf-${job.id}-dir-unwritable`,
            jobId: job.id,
            jobName: job.fileName,
            code: 'OUTPUT_DIR_NOT_WRITABLE',
            severity: 'error',
            message: `Output directory "${outputDir}" is not writable or access is denied.`,
            details: (err as Error).message,
            quickFix: {
              label: 'Create Output Directory',
              action: 'create_output_dir',
              data: { dir: outputDir },
            },
          });
        }
      }

      // Disk space check
      if (options.checkDiskSpace !== false && fs.existsSync(outputDir)) {
        try {
          const stat = fs.statfsSync(outputDir);
          const freeMb = Math.round((stat.bavail * stat.bsize) / (1024 * 1024));
          if (freeMb < minSpaceMb) {
            warnings.push({
              id: `pf-${job.id}-low-disk-space`,
              jobId: job.id,
              jobName: job.fileName,
              code: 'LOW_DISK_SPACE',
              severity: 'warning',
              message: `Available free disk space (${freeMb} MB) is below safe threshold (${minSpaceMb} MB).`,
              details: `Path: ${outputDir}`,
            });
          }
        } catch {
          // Statfs not available or filesystem error, skip silently
        }
      }
    }

    // 3. File saved with newer Blender version than selected executable
    const savedVer = job.savedWithVersion || job.inspectData?.savedWithVersion;
    if (savedVer && selectedBlender?.version) {
      if (compareVersions(savedVer, selectedBlender.version) > 0) {
        errors.push({
          id: `pf-${job.id}-newer-version`,
          jobId: job.id,
          jobName: job.fileName,
          code: 'NEWER_BLENDER_VERSION',
          severity: 'error',
          message: `File was saved with a newer version of Blender (v${savedVer}) than the selected executable (v${selectedBlender.version}). Forward compatibility is not supported and may fail.`,
        });
      }
    }

    // 4. Camera & Selected Blender checks
    if (!job.selectedCamera || (job.availableCameras && job.availableCameras.length === 0)) {
      errors.push({
        id: `pf-${job.id}-no-camera`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'NO_ACTIVE_CAMERA',
        severity: 'error',
        message: `No active camera selected for rendering in scene "${job.selectedScene || 'Scene'}".`,
      });
    }

    if (selectedBlender?.executable && !fs.existsSync(selectedBlender.executable)) {
      errors.push({
        id: `pf-${job.id}-blender-missing`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'BLENDER_NOT_FOUND',
        severity: 'error',
        message: `The selected Blender executable "${selectedBlender.executable}" does not exist or was not found on disk.`,
      });
    }

    // 5. Frame range & Video format continuous rule
    const sceneDefaults = {
      start: currentScene?.frameStart ?? 1,
      end: currentScene?.frameEnd ?? 250,
      step: currentScene?.frameStep ?? 1,
    };
    const rangeConfig = job.rangeConfig || { mode: 'scene_default' };
    const resolved = resolveFrameRange(rangeConfig, sceneDefaults);

    if (resolved.error) {
      errors.push({
        id: `pf-${job.id}-invalid-range`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'INVALID_FRAME_RANGE',
        severity: 'error',
        message: resolved.error,
      });
    }

    // Format check (image vs video)
    const rawFormat =
      job.overrides?.['scene.render.image_settings.file_format'] ||
      currentScene?.imageSettings?.file_format?.value;
    const formatStr = typeof rawFormat === 'string' ? rawFormat : undefined;
    const isVideo = isFormatVideo(formatStr);
    const rangeValidation = validateRangeForFormat(resolved, formatStr);

    if (!rangeValidation.valid) {
      errors.push({
        id: `pf-${job.id}-video-range-rule`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'VIDEO_RANGE_RULE_VIOLATION',
        severity: 'error',
        message: rangeValidation.reason || 'Video containers require continuous frame ranges.',
        quickFix: {
          label: 'Switch to Continuous Range',
          action: 'switch_range_to_continuous',
        },
      });
    }

    // 6. GPU device check
    const requestedGpu =
      job.overrides?.['scene.cycles.device'] === 'GPU' || job.deviceReport?.requestedGpu === true;

    if (requestedGpu && !isVideo) {
      const cyclesDevices = job.inspectData?.cyclesDevices || [];
      const hasGpu = cyclesDevices.some(
        (d) => d.type && d.type.toUpperCase() !== 'CPU' && d.name !== 'CPU',
      );
      if (!hasGpu && cyclesDevices.length > 0) {
        warnings.push({
          id: `pf-${job.id}-no-compatible-gpu`,
          jobId: job.id,
          jobName: job.fileName,
          code: 'NO_COMPATIBLE_GPU',
          severity: 'warning',
          message:
            'GPU rendering was requested, but no compatible Cycles GPU devices were detected. Render will fall back to CPU.',
          quickFix: {
            label: 'Switch to CPU',
            action: 'switch_to_cpu',
          },
        });
      }
    }

    // 7. Windows long-path risk (> 250 characters)
    if (platform === 'win32' && preview.length > 250) {
      warnings.push({
        id: `pf-${job.id}-windows-long-path`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'WINDOWS_LONG_PATH',
        severity: 'warning',
        message: `Output path exceeds 250 characters (${preview.length} chars). On Windows, paths exceeding 260 characters may fail to write.`,
      });
    }

    return {
      jobId: job.id,
      jobName: job.fileName,
      errors,
      warnings,
    };
  }

  /**
   * Runs pre-flight checks across all jobs and aggregates into a single report.
   */
  checkAllJobs(jobs: PreflightJobInput[], options: PreflightOptions = {}): PreflightReport {
    const allErrors: PreflightIssue[] = [];
    const allWarnings: PreflightIssue[] = [];
    const jobReports: PreflightJobReport[] = [];

    for (const job of jobs) {
      const jobReport = this.checkJob(job, options);
      allErrors.push(...jobReport.errors);
      allWarnings.push(...jobReport.warnings);
      jobReports.push(jobReport);
    }

    return {
      timestamp: Date.now(),
      hasErrors: allErrors.length > 0,
      hasWarnings: allWarnings.length > 0,
      errors: allErrors,
      warnings: allWarnings,
      jobReports,
    };
  }
}
