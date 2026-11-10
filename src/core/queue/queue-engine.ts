import type { SleepBlockerManager } from '../power/sleep-blocker';
import { sampleGpuUtilization } from '../render/gpu-monitor';
import { killProcessTree } from '../render/process-killer';
import { parseStdoutLine } from '../render/stdout-parser';
import type { RunnerPayload } from '../schemas/override';
import type { DeviceReport, OverridesReport } from '../schemas/runner-event';

import { spawn, type ChildProcess } from 'node:child_process';
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
}

export interface QueueEngineOptions {
  logsDir: string;
  runtimeDir: string;
  runnerScriptPath?: string;
  sleepBlocker?: SleepBlockerManager;
}

const ERROR_KEYWORD_REGEX = /(?:Error|Traceback|CUDA error|out of memory|Segmentation fault)/i;

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
      // Wait up to 500ms for graceful stop, then force kill tree
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

    // Prepare job runtime directory and control/payload files
    const jobRuntimeDir = path.join(this.options.runtimeDir, 'run', job.id);
    fs.mkdirSync(jobRuntimeDir, { recursive: true });

    const controlFile = path.join(jobRuntimeDir, 'control.json');
    this.currentControlFile = controlFile;
    fs.writeFileSync(controlFile, JSON.stringify({ command: 'continue' }), 'utf8');

    const payloadPath = path.join(jobRuntimeDir, 'payload.json');
    const runnerPayload: RunnerPayload = {
      blendPath: job.blendPath,
      scene: job.scene,
      camera: job.camera,
      viewLayers: job.viewLayers,
      overrides: job.overrides || {},
      frames: job.frames,
      outputPattern: job.outputPattern,
      outputDir: job.outputDir,
      controlFile,
      devicePreferences: job.devicePreferences
        ? {
            enableGpu: job.devicePreferences.enableGpu ?? true,
            deviceType: job.devicePreferences.deviceType,
            selectedDevices: job.devicePreferences.selectedDevices,
          }
        : undefined,
      threads: job.threads,
    };
    fs.writeFileSync(payloadPath, JSON.stringify(runnerPayload, null, 2), 'utf8');

    // Setup disk logging
    const jobLogsDir = path.join(this.options.logsDir, job.id);
    fs.mkdirSync(jobLogsDir, { recursive: true });
    const logFilePath = path.join(jobLogsDir, `${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    const runnerScript =
      this.options.runnerScriptPath ||
      path.resolve(__dirname, '../../../resources/python/render_runner.py');

    // Build args
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

    // Command executable resolution
    let bin: string;
    let spawnArgs: string[];
    if (Array.isArray(job.executable)) {
      bin = job.executable[0];
      spawnArgs = [...job.executable.slice(1), ...execArgs];
    } else {
      bin = job.executable;
      spawnArgs = execArgs;
    }

    const stderrLines: string[] = [];

    await new Promise<void>((resolve) => {
      const child = spawn(bin, spawnArgs, {
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.currentChild = child;

      // Set process priority if requested
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

          // Parse line
          try {
            const parsed = parseStdoutLine(trimmed);
            if (parsed.kind === 'event' && parsed.event) {
              const ev = parsed.event;
              if (ev.type === 'job_start') {
                this.emit('job:start', {
                  jobId: job.id,
                  totalFrames: ev.totalFrames,
                  frames: ev.frames,
                  scene: ev.scene,
                  camera: ev.camera,
                  engine: ev.engine,
                });
              } else if (ev.type === 'device_report') {
                this.emit('device:report', { jobId: job.id, report: ev as DeviceReport });
              } else if (ev.type === 'overrides_report') {
                this.emit('overrides:report', { jobId: job.id, report: ev as OverridesReport });
              } else if (ev.type === 'frame_start') {
                this.emit('frame:start', {
                  jobId: job.id,
                  frame: ev.frame,
                  frameIndex: ev.frameIndex ?? 0,
                  totalFrames: ev.totalFrames ?? job.frames.length,
                });
              } else if (ev.type === 'frame_done') {
                this.emit('frame:done', {
                  jobId: job.id,
                  frame: ev.frame,
                  saved: ev.saved,
                  timeSeconds: ev.timeSeconds,
                  peakMemory: ev.peakMemory,
                });
              } else if (ev.type === 'job_done') {
                this.emit('job:done', {
                  jobId: job.id,
                  completedFrames: ev.completedFrames,
                  failedFrames: ev.failedFrames,
                  durationSeconds: ev.durationSeconds,
                });
              }
            } else if (parsed.kind === 'progress' && parsed.progress) {
              this.emit('job:progress', {
                jobId: job.id,
                frame: parsed.progress.frame,
                sampleCurrent: parsed.progress.samples?.current,
                sampleTotal: parsed.progress.samples?.total,
                memory: parsed.progress.memory,
                peakMemory: parsed.progress.peakMemory,
                time: parsed.progress.time,
                remaining: parsed.progress.remaining,
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
        this.emit('job:failed', {
          jobId: job.id,
          error: err.message,
          stderrTail: stderrLines.slice(-10).join('\n'),
        });
      });

      child.on('close', (code) => {
        logStream.end();
        if (code !== 0 && !this.stopRequested) {
          this.emit('job:failed', {
            jobId: job.id,
            error: `Blender process exited with code ${code}`,
            stderrTail: stderrLines.slice(-10).join('\n'),
          });
        }
        resolve();
      });
    });
  }

  public async sampleGpu(): Promise<ReturnType<typeof sampleGpuUtilization>> {
    return sampleGpuUtilization();
  }
}
