import { HistoryStore } from '../core/history';
import { executeOsPostAction } from '../core/post-actions/post-action-executor';
import { PreflightChecker, type PreflightJobInput } from '../core/preflight';
import { QueueEngine, type QueueEngineJob } from '../core/queue/queue-engine';
import { executeJobPostStepStitch } from '../core/queue/stitch-post-step';
import { parseCustomRange, resolveFrameRange } from '../core/ranges/frame-range';
import { filterMissingFrames } from '../core/ranges/missing-frames';
import { type CliJobInput, validateCliQueue } from '../core/schemas/cli';
import type { OverrideMap } from '../core/schemas/override';
import type { FrameRangeConfig, PostAction } from '../core/schemas/queue-state';
import { resolveBlenderForCli } from './blender-resolver';
import {
  type CliSummary,
  formatSummaryTable,
  renderProgressLine,
  ringTerminalBell,
} from './terminal';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface CliRunOptions {
  queueFile: string;
  blender?: string;
  postAction?: PostAction;
  resume?: boolean;
  preset?: string;
  dryRun?: boolean;
  runnerScriptPath?: string;
  skipCountdownForTesting?: boolean;
  baseDir?: string;
}

export interface CliRunResult {
  exitCode: number;
  summary: CliSummary;
}

function resolveJobRange(job: CliJobInput): { frames: number[]; rangeConfig: FrameRangeConfig } {
  if (typeof job.range === 'string') {
    const frames = parseCustomRange(job.range);
    return {
      frames,
      rangeConfig: { mode: 'custom', customExpression: job.range },
    };
  }

  if (job.range && typeof job.range === 'object') {
    const simple = {
      start: job.range.start,
      end: job.range.end,
      step: job.range.step ?? 1,
    };
    const resolved = resolveFrameRange({ mode: 'simple', simple }, simple);
    return {
      frames: resolved.frames,
      rangeConfig: { mode: 'simple', simple },
    };
  }

  // Default fallback if no range specified
  return {
    frames: [1],
    rangeConfig: { mode: 'simple', simple: { start: 1, end: 1, step: 1 } },
  };
}

export async function runCliQueue(options: CliRunOptions): Promise<CliRunResult> {
  const startTime = Date.now();
  const summary: CliSummary = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    totalFrames: 0,
    completedFrames: 0,
    failedFrames: 0,
    durationSeconds: 0,
    dryRun: Boolean(options.dryRun),
  };

  // 1. Check file existence
  if (!fs.existsSync(options.queueFile)) {
    console.error(`Error: Queue file not found: ${options.queueFile}`);
    summary.durationSeconds = (Date.now() - startTime) / 1000;
    return { exitCode: 2, summary };
  }

  // 2. Read and parse JSON
  let rawJson: unknown;
  try {
    const content = fs.readFileSync(options.queueFile, 'utf-8');
    rawJson = JSON.parse(content);
  } catch (err: unknown) {
    console.error(`Error parsing JSON in ${options.queueFile}: ${(err as Error).message}`);
    summary.durationSeconds = (Date.now() - startTime) / 1000;
    return { exitCode: 2, summary };
  }

  // 3. Validate Zod Schema
  let parsedQueue;
  try {
    parsedQueue = validateCliQueue(rawJson);
  } catch (err: unknown) {
    console.error(`Schema validation error for ${options.queueFile}: ${(err as Error).message}`);
    summary.durationSeconds = (Date.now() - startTime) / 1000;
    return { exitCode: 2, summary };
  }

  summary.totalJobs = parsedQueue.jobs.length;

  // 4. Resolve Blender executable
  const blenderSpec = options.blender || parsedQueue.blender || 'latest';
  let resolvedBlender;
  try {
    resolvedBlender = await resolveBlenderForCli(blenderSpec);
  } catch (err: unknown) {
    console.error(`Blender resolution failed: ${(err as Error).message}`);
    summary.durationSeconds = (Date.now() - startTime) / 1000;
    return { exitCode: 2, summary };
  }

  // 5. Build preflight and queue jobs
  const preflightChecker = new PreflightChecker();
  const preflightInputs: PreflightJobInput[] = [];
  const engineJobs: QueueEngineJob[] = [];

  for (let i = 0; i < parsedQueue.jobs.length; i++) {
    const job = parsedQueue.jobs[i];
    const jobId = job.id || `job-${i + 1}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
    const fullBlendPath = path.resolve(job.blendPath);
    const fileName = path.basename(fullBlendPath);

    let rangeInfo;
    try {
      rangeInfo = resolveJobRange(job);
    } catch (err: unknown) {
      console.error(`Job #${i + 1} (${fileName}) error: ${(err as Error).message}`);
      summary.durationSeconds = (Date.now() - startTime) / 1000;
      return { exitCode: 2, summary };
    }

    let framesToRender = rangeInfo.frames;
    const outputDir = path.dirname(fullBlendPath);
    const outputPattern =
      job.outputPattern || path.join(outputDir, `${path.parse(fileName).name}_####.png`);

    // Handle resume or missing frames only
    if (options.resume || job.renderMissingOnly) {
      const { missingFrames } = filterMissingFrames(framesToRender, outputPattern, outputDir);
      framesToRender = missingFrames;
    }

    summary.totalFrames += framesToRender.length;

    preflightInputs.push({
      id: jobId,
      fileName,
      filePath: fullBlendPath,
      selectedScene: job.scene || 'Scene',
      selectedCamera: job.camera || 'Camera',
      rangeConfig: rangeInfo.rangeConfig,
      overrides: (job.overrides as OverrideMap) || {},
      outputPathPattern: outputPattern,
    });

    engineJobs.push({
      id: jobId,
      blendPath: fullBlendPath,
      executable: resolvedBlender.executable,
      scene: job.scene,
      camera: job.camera,
      overrides: job.overrides,
      frames: framesToRender,
      outputPattern,
      outputDir,
      threads: job.threads,
      priority: 'normal',
      crashPolicy: job.crashPolicy,
      renderMissingOnly: job.renderMissingOnly,
      preRenderHook: job.preRenderHook,
    });
  }

  // 6. Run Pre-flight Checks
  let hasPreflightErrors = false;
  for (const preflightJob of preflightInputs) {
    const report = preflightChecker.checkJob(preflightJob, {
      selectedBlender: {
        version: resolvedBlender.version,
        executable: resolvedBlender.executable[0],
      },
    });

    if (report.errors.length > 0) {
      hasPreflightErrors = true;
      console.error(`\nPre-flight error(s) for job "${preflightJob.fileName}":`);
      for (const err of report.errors) {
        console.error(`  - [${err.code}] ${err.message}`);
      }
    }
  }

  if (hasPreflightErrors) {
    summary.durationSeconds = (Date.now() - startTime) / 1000;
    return { exitCode: 1, summary };
  }

  // 7. Dry run mode
  if (options.dryRun) {
    console.log(`[DRY-RUN] Pre-flight checks passed for ${parsedQueue.jobs.length} job(s).`);
    console.log(`[DRY-RUN] Blender: ${resolvedBlender.displayPath} (v${resolvedBlender.version})`);
    summary.completedJobs = summary.totalJobs;
    summary.completedFrames = summary.totalFrames;
    summary.durationSeconds = (Date.now() - startTime) / 1000;
    console.log(formatSummaryTable(summary));
    return { exitCode: 0, summary };
  }

  // 8. Prepare Queue Execution
  const baseDir = options.baseDir || path.join(os.homedir(), '.render-night');
  const logsDir = path.join(baseDir, 'logs');
  const runtimeDir = path.join(baseDir, 'runtime');
  const historyDir = path.join(baseDir, 'history');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(historyDir, { recursive: true });

  const historyStore = new HistoryStore({ historyDir });
  const runnerScriptPath =
    options.runnerScriptPath || path.resolve(__dirname, '../../resources/python/render_runner.py');

  const engine = new QueueEngine({
    logsDir,
    runtimeDir,
    runnerScriptPath,
    historyStore,
  });

  let wasInterrupted = false;
  const onSignal = async () => {
    if (!wasInterrupted) {
      wasInterrupted = true;
      console.log('\nReceived interrupt signal. Stopping queue cleanly...');
      await engine.stop();
    }
  };

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  // Wire event handlers
  engine.on('frame:start', (ev) => {
    renderProgressLine(
      `Rendering Job ${ev.jobId} - Frame ${ev.frame} (${ev.frameIndex + 1}/${ev.totalFrames})`,
    );
  });

  engine.on('frame:done', (ev) => {
    summary.completedFrames++;
    renderProgressLine(`Frame ${ev.frame} done: ${path.basename(ev.saved)}`);
  });

  engine.on('frame:failed', (ev) => {
    summary.failedFrames++;
    console.log(`\nFrame ${ev.frame} failed: ${ev.error}`);
  });

  engine.on('job:done', (ev) => {
    if (ev.failedFrames === 0) {
      summary.completedJobs++;
    } else {
      summary.failedJobs++;
    }
    ringTerminalBell();
    console.log(
      `\nJob ${ev.jobId} completed (${ev.completedFrames} rendered, ${ev.failedFrames} failed).`,
    );

    // Check stitch post-step
    const jobInput = parsedQueue.jobs.find((j, idx) =>
      j.id ? j.id === ev.jobId : ev.jobId.startsWith(`job-${idx + 1}`),
    );
    if (jobInput?.stitchToMp4) {
      console.log('Stitching sequence to MP4...');
      executeJobPostStepStitch({
        jobId: ev.jobId,
        isVideo: false,
        stitchToMp4: true,
        outputDir: path.dirname(jobInput.blendPath),
      }).catch((err) => {
        console.error(`Post-step stitch error: ${(err as Error).message}`);
      });
    }
  });

  engine.on('job:failed', (ev) => {
    summary.failedJobs++;
    ringTerminalBell();
    console.log(`\nJob ${ev.jobId} failed: ${ev.error}`);
  });

  // Start engine
  try {
    await engine.start(engineJobs);
  } catch (err: unknown) {
    console.error(`Queue execution error: ${(err as Error).message}`);
    summary.failedJobs = summary.totalJobs - summary.completedJobs;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }

  summary.durationSeconds = (Date.now() - startTime) / 1000;
  console.log(formatSummaryTable(summary));

  // 9. OS Post-Queue Action (Safety Rule: ONLY on graceful success without interruption)
  const targetPostAction = options.postAction || parsedQueue.postAction || 'none';
  if (
    targetPostAction !== 'none' &&
    !wasInterrupted &&
    summary.failedJobs === 0 &&
    summary.failedFrames === 0
  ) {
    if (options.skipCountdownForTesting) {
      await executeOsPostAction(targetPostAction);
    } else {
      console.log(`Executing post-action "${targetPostAction}" in 60s. Press Ctrl+C to cancel.`);
      // Wait for 60s countdown
      await new Promise((res) => setTimeout(res, 60000));
      await executeOsPostAction(targetPostAction);
    }
  }

  const exitCode = summary.failedJobs > 0 || summary.failedFrames > 0 ? 1 : 0;
  return { exitCode, summary };
}
