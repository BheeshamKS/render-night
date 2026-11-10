#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);

// 1. Version request
if (args.includes('--version')) {
  console.log(`Blender 4.2.0 LTS (sub 0)
    build date: 2024-07-16
    build time: 06:19:15
    build commit date: 2024-07-16
    build commit time: 06:19
    build hash: a51f305417fb
    build platform: Linux`);
  process.exit(0);
}

// 2. Check for python script (-P <script>)
const pIdx = args.indexOf('-P');
const scriptPath = pIdx !== -1 && pIdx < args.length - 1 ? args[pIdx + 1] : '';
const dashDashIdx = args.indexOf('--');
const payloadOrOutFile = dashDashIdx !== -1 && dashDashIdx < args.length - 1 ? args[dashDashIdx + 1] : '';

if (scriptPath.includes('inspect_blend.py') || (!scriptPath.includes('render_runner.py') && payloadOrOutFile.endsWith('.json') && !args.includes('--run'))) {
  const bIdx = args.indexOf('-b');
  const blendFile = bIdx !== -1 ? args[bIdx + 1] : 'test.blend';

  if (blendFile.includes('fail') || blendFile.includes('corrupt')) {
    console.error('Fra:1\nError: Blender cannot read corrupted blend file!');
    process.exit(1);
  }

  // Load fixture inspect JSON
  const fixturePath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../tests/fixtures/inspect-sample.json',
  );
  let fixtureData = {};
  if (fs.existsSync(fixturePath)) {
    fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }
  fixtureData.blendPath = blendFile;

  fs.writeFileSync(payloadOrOutFile, JSON.stringify(fixtureData, null, 2), 'utf8');
  console.log(`Blender quit`);
  process.exit(0);
}

if (scriptPath.includes('render_runner.py')) {
  handleRenderRunner(payloadOrOutFile);
} else {
  console.log('Mock Blender: unrecognized arguments', args);
  process.exit(0);
}

async function handleRenderRunner(payloadPath) {
  if (!fs.existsSync(payloadPath)) {
    console.error(`Payload file not found: ${payloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const frames = payload.frames && payload.frames.length > 0 ? payload.frames : [1];
  const controlFile = payload.controlFile;
  const sceneName = payload.scene || 'Scene';

  // 1. Device report
  const isGpu = payload.devicePreferences?.enableGpu !== false;
  console.log(
    `RN_EVENT ${JSON.stringify({
      type: 'device_report',
      computeDeviceType: isGpu ? payload.devicePreferences?.deviceType || 'OPTIX' : 'NONE',
      engine: 'CYCLES',
      mode: isGpu ? 'GPU' : 'CPU',
      devices: isGpu
        ? [{ name: 'NVIDIA RTX Mock 4090', type: payload.devicePreferences?.deviceType || 'OPTIX', use: true }]
        : [{ name: 'Mock CPU', type: 'CPU', use: true }],
      requestedGpu: isGpu,
      fallbackToCpu: false,
      threads: payload.threads || 16,
    })}`,
  );

  // 2. Overrides report
  const applied = [];
  const skipped = [];
  if (payload.overrides) {
    for (const [key, value] of Object.entries(payload.overrides)) {
      applied.push({ rnaPath: key, value });
    }
  }
  console.log(`RN_EVENT ${JSON.stringify({ type: 'overrides_report', applied, skipped })}`);

  // 2b. Pre-render hook simulation
  if (payload.preRenderHook) {
    console.log(`RN_EVENT ${JSON.stringify({ type: 'pre_render_hook_start' })}`);
    if (
      typeof payload.preRenderHook === 'string' &&
      (payload.preRenderHook.includes('RAISE_ERROR') || payload.preRenderHook.includes('fail'))
    ) {
      console.log(
        `RN_EVENT ${JSON.stringify({
          type: 'pre_render_hook_error',
          hook: payload.preRenderHook,
          error: 'Simulated pre-render hook execution failure',
        })}`,
      );
      console.error('Error in pre-render hook: Simulated pre-render hook execution failure');
      process.exit(1);
    } else {
      console.log(
        `RN_EVENT ${JSON.stringify({
          type: 'pre_render_hook_success',
          hook: payload.preRenderHook,
        })}`,
      );
    }
  }

  // 3. Job start
  console.log(
    `RN_EVENT ${JSON.stringify({
      type: 'job_start',
      totalFrames: frames.length,
      frames,
      scene: sceneName,
      camera: payload.camera || 'Camera',
      engine: 'CYCLES',
    })}`,
  );

  const tStart = Date.now();
  let completedCount = 0;
  const failedCount = 0;

  for (let idx = 0; idx < frames.length; idx++) {
    const f = frames[idx];

    // Check control sentinel before frame
    while (true) {
      if (controlFile && fs.existsSync(controlFile)) {
        try {
          const ctrl = JSON.parse(fs.readFileSync(controlFile, 'utf8'));
          if (ctrl.command === 'stop') {
            break;
          }
          if (ctrl.command === 'pause') {
            await new Promise((r) => setTimeout(r, 20));
            continue;
          }
        } catch {
          // ignore read error
        }
      }
      break;
    }

    if (controlFile && fs.existsSync(controlFile)) {
      try {
        const ctrl = JSON.parse(fs.readFileSync(controlFile, 'utf8'));
        if (ctrl.command === 'stop') {
          break;
        }
      } catch {
        // ignore
      }
    }

    // Crash simulation
    const crashConfig = payload.crashConfig;
    const shouldCrash =
      crashConfig &&
      (crashConfig.frame === f ||
        (Array.isArray(crashConfig.frames) && crashConfig.frames.includes(f)));
    if (shouldCrash) {
      if ((isGpu && crashConfig.crashGpu !== false) || (!isGpu && crashConfig.crashCpu !== false)) {
        console.error(`CUDA error: Out of memory at frame ${f} (simulated crash)`);
        console.error(`Traceback (most recent call last):`);
        console.error(`  File "render_runner.py", line 123, in render_frame`);
        console.error(`RuntimeError: GPU/CPU out of memory at frame ${f}`);
        process.exit(139);
      }
    }

    // Frame start
    console.log(
      `RN_EVENT ${JSON.stringify({
        type: 'frame_start',
        frame: f,
        scene: sceneName,
        frameIndex: idx,
        totalFrames: frames.length,
      })}`,
    );

    // Native blender progress output
    console.log(`Fra:${f} Mem:14.25M (Peak 25.10M) | Time:00:00.05 | Remaining:00:00.10 | Sample 64/128`);
    await new Promise((r) => setTimeout(r, 20));
    console.log(`Fra:${f} Mem:15.80M (Peak 25.10M) | Time:00:00.10 | Remaining:00:00.00 | Sample 128/128`);

    // Output path computation
    let frameFile = `frame_${String(f).padStart(4, '0')}.png`;
    if (payload.outputPattern) {
      if (payload.outputPattern.includes('#')) {
        frameFile = payload.outputPattern.replace(/#+/g, (m) => String(f).padStart(m.length, '0'));
      } else {
        frameFile = payload.outputPattern;
      }
    }
    const savedPath = path.isAbsolute(frameFile)
      ? frameFile
      : path.join(payload.outputDir || process.cwd(), frameFile);

    try {
      fs.mkdirSync(path.dirname(savedPath), { recursive: true });
      fs.writeFileSync(savedPath, 'MOCK_IMAGE_DATA', 'utf8');
    } catch {
      // ignore
    }

    console.log(`Saved: "${savedPath}"`);
    console.log(
      `RN_EVENT ${JSON.stringify({
        type: 'frame_done',
        frame: f,
        scene: sceneName,
        saved: savedPath,
        timeSeconds: 0.1,
        peakMemory: '25.10M',
      })}`,
    );
    completedCount++;
  }

  const durationSeconds = (Date.now() - tStart) / 1000;
  console.log(
    `RN_EVENT ${JSON.stringify({
      type: 'job_done',
      completedFrames: completedCount,
      failedFrames: failedCount,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
    })}`,
  );
  console.log(`Blender quit`);
  process.exit(0);
}
