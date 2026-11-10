import { getFfmpegPath } from './discovery';

import { type ChildProcess, spawn } from 'node:child_process';

export type OutputVideoFormat = 'mp4_h264' | 'mp4_h265' | 'webm' | 'prores';

export interface StitchOptions {
  inputPattern: string;
  startFrame?: number;
  totalFrames?: number;
  fps: number;
  outputFormat: OutputVideoFormat;
  resolution?: { width: number; height: number };
  crop?: { width: number; height: number; x: number; y: number };
  quality?: 'high' | 'medium' | 'low' | number;
  audioPath?: string;
  outputPath: string;
  ffmpegExecutable?: string;
}

export interface StitchProgress {
  frame: number;
  fps: number;
  totalFrames?: number;
  progressPercent?: number;
  speed: string;
  time: string;
}

export function buildFfmpegArgs(options: StitchOptions): string[] {
  const args: string[] = ['-y', '-framerate', String(options.fps)];

  if (typeof options.startFrame === 'number') {
    args.push('-start_number', String(options.startFrame));
  }

  args.push('-i', options.inputPattern);

  if (options.audioPath) {
    args.push('-i', options.audioPath);
  }

  // Build filter chain (-vf)
  const filters: string[] = [];
  if (options.crop) {
    filters.push(
      `crop=${options.crop.width}:${options.crop.height}:${options.crop.x}:${options.crop.y}`,
    );
  }
  if (options.resolution) {
    filters.push(`scale=${options.resolution.width}:${options.resolution.height}`);
  } else if (options.outputFormat.startsWith('mp4')) {
    // For H.264/H.265 ensure dimensions are divisible by 2
    filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  }

  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  // Format and codec specific arguments
  switch (options.outputFormat) {
    case 'mp4_h264': {
      args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
      let crf = 23;
      if (typeof options.quality === 'number') crf = options.quality;
      else if (options.quality === 'high') crf = 18;
      else if (options.quality === 'low') crf = 28;
      args.push('-crf', String(crf), '-preset', 'medium');
      break;
    }
    case 'mp4_h265': {
      args.push('-c:v', 'libx265', '-pix_fmt', 'yuv420p');
      let crf = 28;
      if (typeof options.quality === 'number') crf = options.quality;
      else if (options.quality === 'high') crf = 22;
      else if (options.quality === 'low') crf = 34;
      args.push('-crf', String(crf), '-tag:v', 'hvc1');
      break;
    }
    case 'webm': {
      args.push('-c:v', 'libvpx-vp9', '-b:v', '0');
      let crf = 32;
      if (typeof options.quality === 'number') crf = options.quality;
      else if (options.quality === 'high') crf = 24;
      else if (options.quality === 'low') crf = 40;
      args.push('-crf', String(crf));
      break;
    }
    case 'prores': {
      args.push('-c:v', 'prores_ks', '-pix_fmt', 'yuv422p10le');
      let profile = '2'; // standard
      if (options.quality === 'high')
        profile = '3'; // HQ
      else if (options.quality === 'low') profile = '1'; // LT
      args.push('-profile:v', profile);
      break;
    }
  }

  // Audio handling
  if (options.audioPath) {
    if (options.outputFormat === 'prores') {
      args.push('-c:a', 'pcm_s16le');
    } else {
      args.push('-c:a', 'aac', '-b:a', '192k');
    }
    args.push('-shortest');
  } else {
    args.push('-an');
  }

  args.push(options.outputPath);
  return args;
}

export class SequenceStitcher {
  private child: ChildProcess | null = null;
  private isCancelled = false;

  constructor(private readonly options: StitchOptions) {}

  public async start(onProgress?: (progress: StitchProgress) => void): Promise<string> {
    let executable = this.options.ffmpegExecutable;
    if (!executable) {
      const discovered = await getFfmpegPath();
      if (!discovered) {
        throw new Error('FFmpeg executable not found. Please install or select FFmpeg.');
      }
      executable = discovered.path;
    }

    const args = buildFfmpegArgs(this.options);

    return new Promise<string>((resolve, reject) => {
      this.isCancelled = false;
      const child = spawn(executable!, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;

      let stderrOutput = '';

      const handleData = (chunk: Buffer | string) => {
        const text = chunk.toString();
        stderrOutput += text;

        // Parse FFmpeg progress tokens: frame=   42 fps= 24.0 q=28.0 size=    123kB time=00:00:01.75 bitrate= 574.9kbits/s speed=2.1x
        const frameMatch = text.match(/frame=\s*(\d+)/);
        if (frameMatch) {
          const frame = parseInt(frameMatch[1], 10);
          const fpsMatch = text.match(/fps=\s*([0-9.]+)/);
          const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
          const timeMatch = text.match(/time=\s*([0-9:.]+)/);
          const time = timeMatch ? timeMatch[1] : '';
          const speedMatch = text.match(/speed=\s*([^\s]+)/);
          const speed = speedMatch ? speedMatch[1] : '';

          let progressPercent: number | undefined;
          if (this.options.totalFrames && this.options.totalFrames > 0) {
            progressPercent = Math.min(
              100,
              Math.max(0, Math.round((frame / this.options.totalFrames) * 100)),
            );
          }

          if (onProgress) {
            onProgress({
              frame,
              fps,
              totalFrames: this.options.totalFrames,
              progressPercent,
              speed,
              time,
            });
          }
        }
      };

      child.stdout?.on('data', handleData);
      child.stderr?.on('data', handleData);

      child.on('error', (err) => {
        this.child = null;
        reject(err);
      });

      child.on('close', (code) => {
        this.child = null;
        if (this.isCancelled) {
          reject(new Error('Stitching process was cancelled by user'));
          return;
        }

        if (code === 0) {
          resolve(this.options.outputPath);
        } else {
          const lastLines = stderrOutput.split(/\r?\n/).filter(Boolean).slice(-10).join('\n');
          reject(new Error(`FFmpeg exited with code ${code}:\n${lastLines}`));
        }
      });
    });
  }

  public async cancel(): Promise<void> {
    this.isCancelled = true;
    if (this.child) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(this.child.pid), '/T', '/F']);
        } else {
          this.child.kill('SIGTERM');
        }
      } catch {
        // Ignore kill errors
      }
    }
  }
}
