import { isBlendVersionNewer } from '../blender/version-compare';
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
  inspectError?: string;
  deviceReport?: {
    requestedGpu?: boolean;
    engine?: string;
  };
  ignoredWarningCodes?: string[];
  ignoredWarningIds?: string[];
  ignoreAllWarnings?: boolean;
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

/**
 * Checks if an executable exists either as a direct file path or as a command in PATH.
 */
export function isExecutableAvailable(executable?: string): boolean {
  if (!executable) return false;
  // If executable string contains multiple tokens (e.g. "flatpak run org.blender.Blender"), take the command name/path
  const cmd = executable.trim().split(/\s+/)[0];
  if (!cmd) return false;

  // If it's a direct path (contains / or \)
  if (cmd.includes('/') || cmd.includes('\\')) {
    return fs.existsSync(cmd);
  }

  // Otherwise, it's a command name in PATH (e.g. "flatpak", "blender")
  const pathEnv = process.env.PATH || '';
  const delimiter = path.delimiter;
  const dirs = pathEnv.split(delimiter);
  const extensions =
    process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];

  for (const dir of dirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, cmd + ext);
      try {
        if (fs.existsSync(fullPath)) {
          return true;
        }
      } catch {
        // continue
      }
    }
  }

  return false;
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

    // =========================================================================
    // BLOCKING CHECKS (Only 3 conditions can block a job: Principle 1)
    // =========================================================================

    // Block Condition 1: The Blender executable is missing or can't run
    if (selectedBlender?.executable && !isExecutableAvailable(selectedBlender.executable)) {
      errors.push({
        id: `pf-${job.id}-blender-missing`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'BLENDER_NOT_FOUND',
        severity: 'error',
        isBlocking: true,
        message: `The selected Blender executable "${selectedBlender.executable}" does not exist or was not found on disk.`,
      });
    }

    // Block Condition 2: The .blend path doesn't exist or can't be read
    if (job.filePath) {
      if (!fs.existsSync(job.filePath)) {
        errors.push({
          id: `pf-${job.id}-blend-not-found`,
          jobId: job.id,
          jobName: job.fileName,
          code: 'BLEND_NOT_FOUND',
          severity: 'error',
          isBlocking: true,
          message: `The .blend file "${job.filePath}" does not exist on disk.`,
        });
      } else if (options.checkDiskAccess !== false) {
        try {
          fs.accessSync(job.filePath, fs.constants.R_OK);
        } catch (accessErr) {
          errors.push({
            id: `pf-${job.id}-blend-not-readable`,
            jobId: job.id,
            jobName: job.fileName,
            code: 'BLEND_NOT_READABLE',
            severity: 'error',
            isBlocking: true,
            message: `The .blend file "${job.filePath}" cannot be read (access denied).`,
            details: (accessErr as Error).message,
          });
        }
      }
    }

    // Block Condition 3: Zero frames to render
    const sceneDefaults = {
      start: currentScene?.frameStart ?? 1,
      end: currentScene?.frameEnd ?? 250,
      step: currentScene?.frameStep ?? 1,
    };
    const rangeConfig = job.rangeConfig || { mode: 'scene_default' };
    const resolved = resolveFrameRange(rangeConfig, sceneDefaults);

    if (resolved.error || resolved.frames.length === 0) {
      errors.push({
        id: `pf-${job.id}-invalid-range`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'ZERO_FRAMES_TO_RENDER',
        severity: 'error',
        isBlocking: true,
        message: resolved.error || 'The resolved frame range contains zero frames to render.',
      });
    }

    // =========================================================================
    // WARNING CHECKS (Everything else is a warning, never a block)
    // =========================================================================

    // 1. Missing external files (textures, sounds, libraries) - Classified by relevance
    const missingFiles = job.inspectData?.missingFiles || [];
    const usedOrUnknown = missingFiles.filter(
      (m) => m.relevance === 'used' || m.relevance === 'unknown' || !m.relevance,
    );
    const unusedCount = missingFiles.filter((m) => m.relevance === 'unused').length;

    if (usedOrUnknown.length > 0) {
      warnings.push({
        id: `pf-${job.id}-missing-assets`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'MISSING_ASSETS',
        severity: 'warning',
        isBlocking: false,
        relevance: usedOrUnknown.some((m) => m.relevance === 'used') ? 'used' : 'unknown',
        message: `Found ${usedOrUnknown.length} missing external asset(s) in use (e.g. ${usedOrUnknown[0].path}).`,
        details: usedOrUnknown
          .map((m) => `[${m.type}] ${m.path} (${m.datablock || ''})`)
          .join('\n'),
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
          warnings.push({
            id: `pf-${job.id}-dir-unwritable`,
            jobId: job.id,
            jobName: job.fileName,
            code: 'OUTPUT_DIR_NOT_WRITABLE',
            severity: 'warning',
            isBlocking: false,
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
              isBlocking: false,
              message: `Available free disk space (${freeMb} MB) is below safe threshold (${minSpaceMb} MB).`,
              details: `Path: ${outputDir}`,
            });
          }
        } catch {
          // Statfs not available or filesystem error, skip silently
        }
      }
    }

    // 3. File inspection failure check (Enters Basic Mode, warning)
    if (job.inspectError) {
      warnings.push({
        id: `pf-${job.id}-inspection-failed`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'INSPECTION_FAILED',
        severity: 'warning',
        isBlocking: false,
        message: `File inspection failed for "${job.fileName}": ${job.inspectError}. Job will render in Basic Mode with file internal settings.`,
      });
    }

    // 4. File saved with newer Blender version than selected executable
    const savedVer = job.savedWithVersion || job.inspectData?.savedWithVersion;
    if (savedVer && selectedBlender?.version) {
      if (isBlendVersionNewer(savedVer, selectedBlender.version)) {
        warnings.push({
          id: `pf-${job.id}-newer-version`,
          jobId: job.id,
          jobName: job.fileName,
          code: 'NEWER_BLENDER_VERSION',
          severity: 'warning',
          isBlocking: false,
          message: `File was saved with a newer version of Blender (v${savedVer}) than the selected executable (v${selectedBlender.version}). Forward compatibility is not supported and may fail.`,
        });
      }
    }

    // 5. Camera check
    if (!job.inspectError) {
      if (!job.selectedCamera || (job.availableCameras && job.availableCameras.length === 0)) {
        warnings.push({
          id: `pf-${job.id}-no-camera`,
          jobId: job.id,
          jobName: job.fileName,
          code: 'NO_ACTIVE_CAMERA',
          severity: 'warning',
          isBlocking: false,
          message: `No active camera selected for rendering in scene "${job.selectedScene || 'Scene'}".`,
          quickFix:
            job.availableCameras && job.availableCameras.length > 0
              ? {
                  label: `Select Camera (${job.availableCameras[0]})`,
                  action: 'select_camera',
                  data: { camera: job.availableCameras[0] },
                }
              : undefined,
        });
      }
    }

    // 6. Video format continuous rule check (warning)
    const rawFormat =
      job.overrides?.['scene.render.image_settings.file_format'] ||
      currentScene?.imageSettings?.file_format?.value ||
      (job.outputPathPattern && /\.(mp4|mkv|mov|avi|webm)$/i.test(job.outputPathPattern)
        ? 'FFMPEG'
        : undefined);
    const formatStr = typeof rawFormat === 'string' ? rawFormat : undefined;
    const isVideo = isFormatVideo(formatStr);
    const rangeValidation = validateRangeForFormat(resolved, formatStr);

    if (!rangeValidation.valid) {
      warnings.push({
        id: `pf-${job.id}-video-range-rule`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'VIDEO_RANGE_RULE_VIOLATION',
        severity: 'warning',
        isBlocking: false,
        message: rangeValidation.reason || 'Video containers require continuous frame ranges.',
        quickFix: {
          label: 'Switch to Continuous Range',
          action: 'switch_range_to_continuous',
        },
      });
    }

    // 7. GPU device check
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
          isBlocking: false,
          message:
            'GPU rendering was requested, but no compatible Cycles GPU devices were detected. Render will fall back to CPU.',
          quickFix: {
            label: 'Switch to CPU',
            action: 'switch_to_cpu',
          },
        });
      }
    }

    // 8. Windows long-path risk (> 250 characters)
    if (platform === 'win32' && preview.length > 250) {
      warnings.push({
        id: `pf-${job.id}-windows-long-path`,
        jobId: job.id,
        jobName: job.fileName,
        code: 'WINDOWS_LONG_PATH',
        severity: 'warning',
        isBlocking: false,
        message: `Output path exceeds 250 characters (${preview.length} chars). On Windows, paths exceeding 260 characters may fail to write.`,
      });
    }

    // =========================================================================
    // WARNING SUPPRESSION (Ignore single, ignore code, ignore all)
    // =========================================================================
    let activeWarnings = warnings;
    if (job.ignoreAllWarnings) {
      activeWarnings = [];
    } else {
      if (job.ignoredWarningCodes && job.ignoredWarningCodes.length > 0) {
        const codeSet = new Set(job.ignoredWarningCodes);
        activeWarnings = activeWarnings.filter((w) => !codeSet.has(w.code));
      }
      if (job.ignoredWarningIds && job.ignoredWarningIds.length > 0) {
        const idSet = new Set(job.ignoredWarningIds);
        activeWarnings = activeWarnings.filter((w) => !idSet.has(w.id));
      }
    }

    const isBlocked = errors.some((e) => e.isBlocking);
    const blockReasons = errors.filter((e) => e.isBlocking).map((e) => e.message);

    return {
      jobId: job.id,
      jobName: job.fileName,
      isBlocked,
      blockReasons,
      errors,
      warnings: activeWarnings,
      unusedMissingCount: unusedCount,
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

    const isBlocked = jobReports.some((j) => j.isBlocked);
    const blockReasons = allErrors.filter((e) => e.isBlocking).map((e) => e.message);

    return {
      timestamp: Date.now(),
      hasErrors: allErrors.length > 0,
      hasWarnings: allWarnings.length > 0,
      isBlocked,
      blockReasons,
      errors: allErrors,
      warnings: allWarnings,
      jobReports,
    };
  }

  checkAll(jobs: PreflightJobInput[], options: PreflightOptions = {}): PreflightReport {
    return this.checkAllJobs(jobs, options);
  }
}
