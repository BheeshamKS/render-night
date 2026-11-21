#!/usr/bin/env node
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function formatSrtTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor((totalSeconds % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function generateSrt(count, fps) {
  let srt = '';
  for (let i = 1; i <= count; i++) {
    const startSec = (i - 1) / fps;
    const endSec = i / fps;
    srt += `${i}\n${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n<font size="32"><b>FRAME ${String(i).padStart(4, '0')}</b></font>\n\n`;
  }
  return srt;
}

export function generateSequence({
  outputDir,
  width = 1920,
  height = 1080,
  frames = 250,
  fps = 24,
  ext = 'png',
  encoder = 'png',
  pixelFormat = 'rgb24',
}) {
  fs.mkdirSync(outputDir, { recursive: true });

  const tempSrt = path.join(os.tmpdir(), `test_sub_${Date.now()}_${Math.random().toString(36).slice(2)}.srt`);
  fs.writeFileSync(tempSrt, generateSrt(frames, fps), 'utf8');

  const durationSec = (frames / fps).toFixed(4);
  const outPattern = path.join(outputDir, `frame_%04d.${ext}`);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `testsrc2=duration=${durationSec}:size=${width}x${height}:rate=${fps}`,
    '-vf', `subtitles=${tempSrt}`,
    '-frames:v', String(frames),
    '-c:v', encoder,
  ];

  if (pixelFormat) {
    args.push('-pix_fmt', pixelFormat);
  }

  args.push(outPattern);

  console.log(`Generating ${frames} frames of ${width}x${height} ${ext.toUpperCase()} in ${outputDir}...`);
  try {
    execFileSync(ffmpegPath, args, { stdio: 'inherit' });
    console.log(`Done: ${outputDir}`);
  } finally {
    try {
      fs.unlinkSync(tempSrt);
    } catch {}
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const targetType = args.find((a) => a.startsWith('--type='))?.split('=')[1] || 'all';
  const baseDir = path.resolve('test-sequences');

  const configs = {
    '1080p_png': {
      outputDir: path.join(baseDir, '1080p_png'),
      width: 1920,
      height: 1080,
      frames: 250,
      fps: 24,
      ext: 'png',
      encoder: 'png',
      pixelFormat: 'rgb24',
    },
    '4k_png': {
      outputDir: path.join(baseDir, '4k_png'),
      width: 3840,
      height: 2160,
      frames: 250,
      fps: 24,
      ext: 'png',
      encoder: 'png',
      pixelFormat: 'rgb24',
    },
    '1080p_jpeg': {
      outputDir: path.join(baseDir, '1080p_jpeg'),
      width: 1920,
      height: 1080,
      frames: 250,
      fps: 30,
      ext: 'jpg',
      encoder: 'mjpeg',
      pixelFormat: 'yuvj420p',
    },
    'exr': {
      outputDir: path.join(baseDir, 'exr'),
      width: 1920,
      height: 1080,
      frames: 100,
      fps: 24,
      ext: 'exr',
      encoder: 'exr',
      pixelFormat: 'gbrpf32le',
    },
  };

  if (targetType === 'all') {
    for (const [key, cfg] of Object.entries(configs)) {
      console.log(`\n=== Generating ${key} ===`);
      generateSequence(cfg);
    }
  } else if (configs[targetType]) {
    generateSequence(configs[targetType]);
  } else {
    console.error(`Unknown type: ${targetType}. Choose from: all, ${Object.keys(configs).join(', ')}`);
    process.exit(1);
  }
}
