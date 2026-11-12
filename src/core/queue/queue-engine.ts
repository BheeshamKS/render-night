import { formatActualDevice, type HistoryStore } from '../history';
import type { SessionLockManager } from '../persistence/session-lock';
import type { SleepBlockerManager } from '../power/sleep-blocker';
import { filterMissingFrames } from '../ranges/missing-frames';
import { sampleGpuUtilization } from '../render/gpu-monitor';
import { killProcessTree } from '../render/process-killer';
import { parseStdoutLine } from '../render/stdout-parser';
import type { HistoryEntry } from '../schemas/history';
import type { CrashConfig, CrashPolicy, RunnerPayload } from '../schemas/override';
import type { FailedFrame } from '../schemas/queue-state';
import type { DeviceReport, OverridesReport } from '../schemas/runner-event';

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type QueueState = 'idle' | 'running' | 'paused' | 'stopping';

export interface QueueEngineJob {
  id: string;
  blendPath: string;
  executable: string | string[];
  scene?: string;
  camera?: string;
  viewLayers?: string[];
  overrides?: Record<string, unknown>;
  frames: number[];
  outputPattern: string;
  outputDir: string;
  devicePreferences?: {
    deviceType?: string;
    enableGpu?: boolean;
    selectedDevices?: string[];
  };
  threads?: number;
  priority?: 'low' | 'below-normal' | 'normal';
  isolatedMode?: boolean;
  autoExec?: boolean;
  isVideo?: boolean;
  crashPolicy?: CrashPolicy;
  crashConfig?: CrashConfig;
  renderMissingOnly?: boolean;
  preRenderHook?: string;
}

export interface QueueEngineOptions {
  logsDir: string;
  runtimeDir: string;
  runnerScriptPath?: string;
  sleepBlocker?: SleepBlockerManager;
  sessionLock?: SessionLockManager;
  historyStore?: HistoryStore;
}

const ERROR_KEYWORD_REGEX = /(?:Error|Traceback|CUDA error|out of memory|Segmentation fault)/i;

export function parseRemainingSeconds(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const parts = timeStr.split(':').map((p) => Number.parseFloat(p));
  if (parts.some((p) => Number.isNaN(p))) return undefined;
  if (parts.length === 1) return Math.round(parts[0]);
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return undefined;
}

export class QueueEngine extends EventEmitter {
  private options: QueueEngineOptions;
  private state: QueueState = 'idle';
  private activeJobId?: string;
  private currentChild?: ChildProcess;
  private currentControlFile?: string;
  private releaseSleepBlock?: () => void;
  private stopRequested = false;
  private pauseRequested = false;
  private resumeResolve?: () => void;

  constructor(options: QueueEngineOptions) {
    super();
    this.options = options;
  }

  public getState(): QueueState {
    return this.state;
  }

  public getActiveJobId(): string | undefined {
    return this.activeJobId;
  }

  public async start(jobs: QueueEngineJob[]): Promise<void> {
    if (this.state === 'running' || this.state === 'paused') {
      throw new Error(`Queue is already ${this.state}`);
    }

    this.stopRequested = false;
    this.pauseRequested = false;
    this.setState('running');

    // Acquire sleep hold
    if (this.options.sleepBlocker && !this.releaseSleepBlock) {
      this.releaseSleepBlock = this.options.sleepBlocker.acquire();
    }

    if (this.options.sessionLock) {
      await this.options.sessionLock.acquireLock({ activeJobId: jobs[0]?.id });
    }

    try {
      for (const job of jobs) {
        if (this.stopRequested) break;

        // If paused between jobs, wait until resumed
        while ((this.state as QueueState) === 'paused') {
          if (this.stopRequested) break;
          await new Promise<void>((resolve) => {
            this.resumeResolve = resolve;
          });
        }

        if (this.stopRequested) break;

        await this.runJob(job);
      }
    } finally {
      this.cleanup();
      if (this.options.sessionLock) {
        await this.options.sessionLock.releaseLock();
      }
    }
  }

  public async pause(): Promise<void> {
    if (this.state !== 'running') return;
    this.pauseRequested = true;
    this.setState('paused');

    if (this.currentControlFile && fs.existsSync(this.currentControlFile)) {
      try {
        fs.writeFileSync(this.currentControlFile, JSON.stringify({ command: 'pause' }), 'utf8');
      } catch {
        // Ignore
      }
    }
  }

  public async resume(): Promise<void> {
    if (this.state !== 'paused') return;
    this.pauseRequested = false;
    this.setState('running');

    if (this.currentControlFile && fs.existsSync(this.currentControlFile)) {
      try {
        fs.writeFileSync(this.currentControlFile, JSON.stringify({ command: 'continue' }), 'utf8');
      } catch {
        // Ignore
      }
    }

    if (this.resumeResolve) {
      const resolve = this.resumeResolve;
      this.resumeResolve = undefined;
      resolve();
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'idle') return;
    this.stopRequested = true;
    this.setState('stopping');

    if (this.currentControlFile && fs.existsSync(this.currentControlFile)) {
      try {
        fs.writeFileSync(this.currentControlFile, JSON.stringify({ command: 'stop' }), 'utf8');
      } catch {
        // Ignore
      }
    }

    if (this.currentChild && this.currentChild.pid) {
      const pid = this.currentChild.pid;
      await Promise.race([
        new Promise((resolve) => this.currentChild?.once('close', resolve)),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);

      await killProcessTree(pid);
    }

    if (this.resumeResolve) {
      const resolve = this.resumeResolve;
      this.resumeResolve = undefined;
      resolve();
    }

    this.cleanup();
  }

  private setState(state: QueueState): void {
    this.state = state;
    this.emit('queue:state', state, this.activeJobId);
  }

  private cleanup(): void {
    this.activeJobId = undefined;
    this.currentChild = undefined;
    this.currentControlFile = undefined;
    this.setState('idle');

    if (this.releaseSleepBlock) {
      this.releaseSleepBlock();
      this.releaseSleepBlock = undefined;
    }
  }

  private async runJob(job: QueueEngineJob): Promise<void> {
    this.activeJobId = job.id;
    this.emit('queue:state', this.state, job.id);

    // 1. Missing frames check
    let remainingFrames = [...job.frames];
    if (job.renderMissingOnly) {
      const { missingFrames, existingFrames } = filterMissingFrames(
        job.frames,
        job.outputPattern,
        job.outputDir,
      );
      if (existingFrames.length > 0) {
        this.emit('log', {
          jobId: job.id,
          stream: 'stdout',
          line: `[MissingFrames] Skipping ${existingFrames.length} existing frame(s). ${missingFrames.length} frame(s) remain to render.`,
          isErrorKeyword: false,
          timestamp: Date.now(),
        });
      }
      if (missingFrames.length === 0) {
        const historyEntry: HistoryEntry = {
          id: randomUUID(),
          jobId: job.id,
          filePath: job.blendPath,
          fileName: path.basename(job.blendPath),
          project: path.basename(path.dirname(job.blendPath)),
          scene: job.scene ?? 'Scene',
          camera: job.camera ?? 'Camera',
          frameCount: existingFrames.length,
          totalTimeSeconds: 0,
          averageFrameTimeSeconds: 0,
          engine: 'CYCLES',
          device: formatActualDevice(undefined, job.devicePreferences),
          result: 'completed',
          failedFrames: [],
          outputPath: job.outputDir,
          timestamp: Date.now(),
        };
        this.emit('job:history', historyEntry);
        if (this.options.historyStore) {
          await this.options.historyStore.appendEntry(historyEntry).catch(() => {});
        }
        this.emit('job:done', {
          jobId: job.id,
          completedFrames: existingFrames.length,
          failedFrames: 0,
          durationSeconds: 0,
          historyEntry,
        });
        return;
      }
      remainingFrames = [...missingFrames];
    }

    // 2. Setup job runtime directory and control/log paths
    const jobRuntimeDir = path.join(this.options.runtimeDir, 'run', job.id);
    fs.mkdirSync(jobRuntimeDir, { recursive: true });

    const controlFile = path.join(jobRuntimeDir, 'control.json');
    this.currentControlFile = controlFile;
    fs.writeFileSync(controlFile, JSON.stringify({ command: 'continue' }), 'utf8');

    const jobLogsDir = path.join(this.options.logsDir, job.id);
    fs.mkdirSync(jobLogsDir, { recursive: true });
    const logFilePath = path.join(jobLogsDir, `${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    const runnerScript =
      this.options.runnerScriptPath ||
      path.resolve(__dirname, '../../../resources/python/render_runner.py');

    // 3. Crash recovery configuration & state
    const crashPolicy: CrashPolicy = job.crashPolicy || {
      maxRetries: 2,
      fallbackToCpu: true,
      skipOnFailure: true,
      maxConsecutiveCrashes: 3,
    };

    const frameRetryCounts = new Map<number, number>();
    const frameCpuFallbackTried = new Set<number>();
    const failedFramesList: FailedFrame[] = [];
    const completedFramesSet = new Set<number>();
    let consecutiveCrashes = 0;
    const recentFrameDurations: number[] = [];
    const ROLLING_WINDOW_SIZE = 10;
    const jobStartTime = Date.now();

    let currentJobScene: string | undefined = job.scene;
    let currentJobCamera: string | undefined = job.camera;
    let currentJobEngine: string | undefined = undefined;
    let currentJobDeviceReport: DeviceReport | undefined = undefined;

    // 4. Execution loop (resumes by relaunching Blender with remaining frames if crash occurs)
    while (remainingFrames.length > 0 && !this.stopRequested) {
      const activeFrame = remainingFrames[0];
      const runOnCpu = frameCpuFallbackTried.has(activeFrame);

      // If this frame is running on CPU fallback, run it as a standalone frame first
      const framesForThisProcess = runOnCpu ? [activeFrame] : [...remainingFrames];

      const payloadPath = path.join(jobRuntimeDir, `payload-${Date.now()}.json`);
      const effectiveDevicePrefs = runOnCpu
        ? { enableGpu: false }
        : job.devicePreferences
          ? {
              enableGpu: job.devicePreferences.enableGpu ?? true,
              deviceType: job.devicePreferences.deviceType,
              selectedDevices: job.devicePreferences.selectedDevices,
            }
          : undefined;

      const runnerPayload: RunnerPayload = {
        blendPath: job.blendPath,
        scene: job.scene,
        camera: job.camera,
        viewLayers: job.viewLayers,
        overrides: job.overrides || {},
        frames: framesForThisProcess,
        outputPattern: job.outputPattern,
        outputDir: job.outputDir,
        controlFile,
        devicePreferences: effectiveDevicePrefs,
        threads: job.threads,
        crashPolicy,
        crashConfig: job.crashConfig,
        renderMissingOnly: false,
        preRenderHook: job.preRenderHook,
      };
      fs.writeFileSync(payloadPath, JSON.stringify(runnerPayload, null, 2), 'utf8');

      const execArgs: string[] = ['-b', job.blendPath];
      if (job.isolatedMode) {
        execArgs.push('--factory-startup');
      }
      if (job.autoExec) {
        execArgs.push('--enable-autoexec');
      }
      if (job.threads && job.threads > 0) {
        execArgs.push('-t', String(job.threads));
      }
      execArgs.push('-P', runnerScript, '--', payloadPath);

      let bin: string;
      let spawnArgs: string[];
      if (Array.isArray(job.executable)) {
        bin = job.executable[0];
        spawnArgs = [...job.executable.slice(1), ...execArgs];
      } else {
        bin = job.executable;
        spawnArgs = execArgs;
      }

      if (bin.endsWith('.js') || bin.endsWith('.mjs') || bin.endsWith('.cjs')) {
        spawnArgs = [bin, ...spawnArgs];
        bin = process.execPath;
      }

      const stderrLines: string[] = [];
      let lastCompletedFrame: number | null = null;
      let processExitCode: number | null = null;

      await new Promise<void>((resolve) => {
        const child = spawn(bin, spawnArgs, {
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.currentChild = child;
        if (child.pid && this.options.sessionLock) {
          this.options.sessionLock.updateWorkerPids([child.pid], job.id).catch(() => {});
        }

        if (child.pid && job.priority) {
          try {
            let priorityVal = os.constants.priority.PRIORITY_NORMAL;
            if (job.priority === 'low') priorityVal = os.constants.priority.PRIORITY_LOW;
            else if (job.priority === 'below-normal')
              priorityVal = os.constants.priority.PRIORITY_BELOW_NORMAL;
            os.setPriority(child.pid, priorityVal);
          } catch {
            // Ignore
          }
        }

        let stdoutBuf = '';
        child.stdout.on('data', (chunk: Buffer) => {
          stdoutBuf += chunk.toString();
          const lines = stdoutBuf.split('\n');
          stdoutBuf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            logStream.write(`[${new Date().toISOString()}] [stdout] ${trimmed}\n`);

            const isErrorKeyword = ERROR_KEYWORD_REGEX.test(trimmed);
            this.emit('log', {
              jobId: job.id,
              stream: 'stdout',
              line: trimmed,
              isErrorKeyword,
              timestamp: Date.now(),
            });

            try {
              const parsed = parseStdoutLine(trimmed);
              if (parsed.kind === 'event' && parsed.event) {
                const ev = parsed.event;
                if (ev.type === 'job_start') {
                  currentJobScene = ev.scene || currentJobScene;
                  currentJobCamera = ev.camera || currentJobCamera;
                  currentJobEngine = ev.engine || currentJobEngine;
                  this.emit('job:start', {
                    jobId: job.id,
                    totalFrames: ev.totalFrames,
                    frames: ev.frames,
                    scene: ev.scene,
                    camera: ev.camera,
                    engine: ev.engine,
                  });
                } else if (ev.type === 'device_report') {
                  currentJobDeviceReport = ev as DeviceReport;
                  this.emit('device:report', { jobId: job.id, report: ev as DeviceReport });
                } else if (ev.type === 'overrides_report') {
                  this.emit('overrides:report', { jobId: job.id, report: ev as OverridesReport });
                } else if (ev.type === 'pre_render_hook_start') {
                  this.emit('hook:start', { jobId: job.id });
                } else if (ev.type === 'pre_render_hook_success') {
                  this.emit('hook:success', { jobId: job.id, hook: ev.hook });
                } else if (ev.type === 'pre_render_hook_error') {
                  this.emit('hook:error', { jobId: job.id, hook: ev.hook, error: ev.error });
                } else if (ev.type === 'frame_start') {
                  this.emit('frame:start', {
                    jobId: job.id,
                    frame: ev.frame,
                    frameIndex: ev.frameIndex ?? 0,
                    totalFrames: ev.totalFrames ?? job.frames.length,
                  });
                } else if (ev.type === 'frame_done') {
                  completedFramesSet.add(ev.frame);
                  remainingFrames = remainingFrames.filter((f) => f !== ev.frame);
                  lastCompletedFrame = ev.frame;
                  consecutiveCrashes = 0;

                  // Rolling average ETA calculation
                  if (ev.timeSeconds && ev.timeSeconds > 0) {
                    recentFrameDurations.push(ev.timeSeconds);
                    if (recentFrameDurations.length > ROLLING_WINDOW_SIZE) {
                      recentFrameDurations.shift();
                    }
                  }

                  let etaSeconds: number | undefined;
                  if (!job.isVideo && recentFrameDurations.length > 0) {
                    const avg =
                      recentFrameDurations.reduce((a, b) => a + b, 0) / recentFrameDurations.length;
                    etaSeconds = Math.round(avg * remainingFrames.length);
                  }

                  this.emit('frame:done', {
                    jobId: job.id,
                    frame: ev.frame,
                    saved: ev.saved,
                    timeSeconds: ev.timeSeconds,
                    peakMemory: ev.peakMemory,
                    etaSeconds,
                  });
                }
              } else if (parsed.kind === 'progress' && parsed.progress) {
                let etaSeconds: number | undefined;
                if (job.isVideo && parsed.progress.remaining) {
                  etaSeconds = parseRemainingSeconds(parsed.progress.remaining);
                }

                this.emit('job:progress', {
                  jobId: job.id,
                  frame: parsed.progress.frame,
                  sampleCurrent: parsed.progress.samples?.current,
                  sampleTotal: parsed.progress.samples?.total,
                  memory: parsed.progress.memory,
                  peakMemory: parsed.progress.peakMemory,
                  time: parsed.progress.time,
                  remaining: parsed.progress.remaining,
                  etaSeconds,
                });
              }
            } catch {
              // Ignore parse errors on arbitrary lines
            }
          }
        });

        let stderrBuf = '';
        child.stderr.on('data', (chunk: Buffer) => {
          stderrBuf += chunk.toString();
          const lines = stderrBuf.split('\n');
          stderrBuf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            stderrLines.push(trimmed);
            if (stderrLines.length > 50) stderrLines.shift();

            logStream.write(`[${new Date().toISOString()}] [stderr] ${trimmed}\n`);

            const isErrorKeyword = ERROR_KEYWORD_REGEX.test(trimmed);
            this.emit('log', {
              jobId: job.id,
              stream: 'stderr',
              line: trimmed,
              isErrorKeyword,
              timestamp: Date.now(),
            });
          }
        });

        child.on('error', (err) => {
          logStream.write(`[${new Date().toISOString()}] [error] ${err.message}\n`);
          this.emit('log', {
            jobId: job.id,
            stream: 'stderr',
            line: `[Process Error] ${err.message}`,
            isErrorKeyword: true,
            timestamp: Date.now(),
          });
        });

        child.on('close', (code) => {
          processExitCode = code;
          if (this.options.sessionLock) {
            this.options.sessionLock.updateWorkerPids([], job.id).catch(() => {});
          }
          resolve();
        });
      });

      // 5. Evaluate process exit status & crash recovery
      if (this.stopRequested) break;

      if (remainingFrames.length === 0) {
        break; // All frames done!
      }

      // If child exited with non-zero or exited prematurely before finishing remaining frames
      if (processExitCode !== 0 || lastCompletedFrame === null) {
        const crashedFrame = remainingFrames[0];
        const attempts = frameRetryCounts.get(crashedFrame) || 0;
        const stderrTail = stderrLines.slice(-10).join('\n');

        this.emit('log', {
          jobId: job.id,
          stream: 'stderr',
          line: `[Crash] Blender crashed at frame ${crashedFrame} (exit code ${processExitCode}).`,
          isErrorKeyword: true,
          timestamp: Date.now(),
        });

        // Step A: Retry the frame up to maxRetries times
        if (attempts < crashPolicy.maxRetries) {
          frameRetryCounts.set(crashedFrame, attempts + 1);
          this.emit('log', {
            jobId: job.id,
            stream: 'stdout',
            line: `[Recovery] Retrying frame ${crashedFrame} (attempt ${attempts + 1}/${crashPolicy.maxRetries})...`,
            isErrorKeyword: false,
            timestamp: Date.now(),
          });
          continue;
        }

        // Step B: Optional fallback to CPU for that frame
        if (crashPolicy.fallbackToCpu && !frameCpuFallbackTried.has(crashedFrame)) {
          frameCpuFallbackTried.add(crashedFrame);
          this.emit('log', {
            jobId: job.id,
            stream: 'stdout',
            line: `[Recovery] Frame ${crashedFrame} failed GPU retries. Falling back to CPU for frame ${crashedFrame}...`,
            isErrorKeyword: false,
            timestamp: Date.now(),
          });
          continue;
        }

        // Step C: Skip frame and record as failed
        this.emit('log', {
          jobId: job.id,
          stream: 'stderr',
          line: `[Recovery] Frame ${crashedFrame} failed permanently. Skipping frame and continuing queue.`,
          isErrorKeyword: true,
          timestamp: Date.now(),
        });

        const failedItem: FailedFrame = {
          frame: crashedFrame,
          error: `Blender process crashed (exit code ${processExitCode})`,
          stderrTail,
          timestamp: Date.now(),
          attemptCount: attempts + 1,
        };
        failedFramesList.push(failedItem);
        this.emit('frame:failed', {
          jobId: job.id,
          frame: crashedFrame,
          error: failedItem.error,
          stderrTail,
        });

        remainingFrames = remainingFrames.filter((f) => f !== crashedFrame);
        consecutiveCrashes++;

        if (consecutiveCrashes >= crashPolicy.maxConsecutiveCrashes) {
          this.emit('log', {
            jobId: job.id,
            stream: 'stderr',
            line: `[Recovery] Exceeded maximum consecutive crashes (${crashPolicy.maxConsecutiveCrashes}). Failing job ${job.id}.`,
            isErrorKeyword: true,
            timestamp: Date.now(),
          });
          const durationSeconds = (Date.now() - jobStartTime) / 1000;
          const avgFrameTime =
            recentFrameDurations.length > 0
              ? recentFrameDurations.reduce((a, b) => a + b, 0) / recentFrameDurations.length
              : completedFramesSet.size > 0
                ? durationSeconds / completedFramesSet.size
                : 0;

          const historyEntry: HistoryEntry = {
            id: randomUUID(),
            jobId: job.id,
            filePath: job.blendPath,
            fileName: path.basename(job.blendPath),
            project: path.basename(path.dirname(job.blendPath)),
            scene: currentJobScene ?? job.scene ?? 'Scene',
            camera: currentJobCamera ?? job.camera ?? 'Camera',
            frameCount: completedFramesSet.size,
            totalTimeSeconds: Math.round(durationSeconds * 100) / 100,
            averageFrameTimeSeconds: Math.round(avgFrameTime * 100) / 100,
            engine: currentJobEngine ?? 'CYCLES',
            device: formatActualDevice(currentJobDeviceReport, job.devicePreferences),
            result: 'failed',
            failedFrames: failedFramesList.map((f) => f.frame),
            outputPath: job.outputDir,
            timestamp: Date.now(),
          };
          this.emit('job:history', historyEntry);
          if (this.options.historyStore) {
            await this.options.historyStore.appendEntry(historyEntry).catch(() => {});
          }

          this.emit('job:failed', {
            jobId: job.id,
            error: `Exceeded maximum consecutive crashes (${crashPolicy.maxConsecutiveCrashes})`,
            failedFrames: failedFramesList,
            stderrTail,
            historyEntry,
          });
          logStream.end();
          return; // Fails this job, but queue continues to next job!
        }
      }
    }

    logStream.end();

    const durationSeconds = (Date.now() - jobStartTime) / 1000;
    const avgFrameTime =
      recentFrameDurations.length > 0
        ? recentFrameDurations.reduce((a, b) => a + b, 0) / recentFrameDurations.length
        : completedFramesSet.size > 0
          ? durationSeconds / completedFramesSet.size
          : 0;

    const historyResult = this.stopRequested
      ? 'canceled'
      : failedFramesList.length > 0 && completedFramesSet.size === 0
        ? 'failed'
        : 'completed';

    const historyEntry: HistoryEntry = {
      id: randomUUID(),
      jobId: job.id,
      filePath: job.blendPath,
      fileName: path.basename(job.blendPath),
      project: path.basename(path.dirname(job.blendPath)),
      scene: currentJobScene ?? job.scene ?? 'Scene',
      camera: currentJobCamera ?? job.camera ?? 'Camera',
      frameCount: completedFramesSet.size,
      totalTimeSeconds: Math.round(durationSeconds * 100) / 100,
      averageFrameTimeSeconds: Math.round(avgFrameTime * 100) / 100,
      engine: currentJobEngine ?? 'CYCLES',
      device: formatActualDevice(currentJobDeviceReport, job.devicePreferences),
      result: historyResult,
      failedFrames: failedFramesList.map((f) => f.frame),
      outputPath: job.outputDir,
      timestamp: Date.now(),
    };
    this.emit('job:history', historyEntry);
    if (this.options.historyStore) {
      await this.options.historyStore.appendEntry(historyEntry).catch(() => {});
    }

    this.emit('job:done', {
      jobId: job.id,
      completedFrames: completedFramesSet.size,
      failedFrames: failedFramesList.length,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      failedFramesList,
      historyEntry,
    });
  }

  public async sampleGpu(): Promise<ReturnType<typeof sampleGpuUtilization>> {
    return sampleGpuUtilization();
  }
}
