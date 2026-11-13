import * as fs from 'node:fs';
import * as path from 'node:path';
import { _electron as electron, type Page } from 'playwright';

interface BenchResult {
  name: string;
  targetFps: number;
  totalFrames: number;
  measuredDurationSec: number;
  framesDisplayed: number;
  achievedFps: number;
  droppedFrames: number;
  longTasksCount: number;
  longTasksTotalMs: number;
  maxLongTaskMs: number;
  avgLoadDecodeMs: number;
  p95LoadDecodeMs: number;
}

export async function runBenchmark(mode: 'before' | 'after' = 'before'): Promise<BenchResult[]> {
  console.log(`Starting Sequence Benchmark in mode: ${mode.toUpperCase()}...`);

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DISPLAY: process.env.DISPLAY || ':0',
      WINDOW_WIDTH: '1280',
      WINDOW_HEIGHT: '800',
    },
  });

  const page: Page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Wait for store to be available
  await page.waitForFunction(() => {
    return typeof (window as unknown as { __queueStore?: unknown }).__queueStore !== 'undefined';
  });

  const sequences = [
    {
      name: '1080p PNG (250f @ 24fps)',
      dir: path.resolve('test-sequences/1080p_png'),
      targetFps: 24,
      durationMs: 4000,
    },
    {
      name: '4K PNG (250f @ 24fps)',
      dir: path.resolve('test-sequences/4k_png'),
      targetFps: 24,
      durationMs: 4000,
    },
    {
      name: '1080p JPEG (250f @ 30fps)',
      dir: path.resolve('test-sequences/1080p_jpeg'),
      targetFps: 30,
      durationMs: 4000,
    },
    {
      name: '1080p EXR (100f @ 24fps)',
      dir: path.resolve('test-sequences/exr'),
      targetFps: 24,
      durationMs: 3000,
    },
  ];

  const results: BenchResult[] = [];

  for (const seq of sequences) {
    console.log(`\nBenchmarking: ${seq.name}...`);

    // Setup instrumentation in browser page
    await page.evaluate(() => {
      const win = window as unknown as {
        __longTasks: { duration: number; startTime: number }[];
        __frameEvents: { frame: number; time: number; loadMs: number }[];
        __obs?: PerformanceObserver;
      };
      win.__longTasks = [];
      win.__frameEvents = [];

      if (!win.__obs && typeof PerformanceObserver !== 'undefined') {
        try {
          win.__obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              win.__longTasks.push({
                duration: entry.duration,
                startTime: entry.startTime,
              });
            }
          });
          win.__obs.observe({ entryTypes: ['longtask'] });
        } catch {}
      }
    });

    // Load sequence into store
    await page.evaluate(async (dirPath) => {
      const store = (
        window as unknown as {
          __queueStore: {
            getState: () => {
              loadSequenceFromPath: (p: string) => Promise<unknown>;
              setActiveTab: (t: string) => void;
            };
          };
        }
      ).__queueStore;
      store.getState().setActiveTab('sequences');
      await store.getState().loadSequenceFromPath(dirPath);
    }, seq.dir);

    // Wait for sequence to load in viewer
    await page.waitForTimeout(600);

    // Start listening for frame loads / changes
    await page.evaluate(() => {
      const win = window as unknown as {
        __frameEvents: { frame: number; time: number; loadMs: number }[];
        __benchTracking?: boolean;
      };
      win.__benchTracking = true;
      let lastSrcTime = performance.now();

      const img = document.querySelector('img[alt^="Frame "]') as HTMLImageElement | null;
      if (img) {
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'src') {
              lastSrcTime = performance.now();
            }
          }
        });
        observer.observe(img, { attributes: true });

        img.addEventListener('load', () => {
          const now = performance.now();
          const frameMatch = img.alt.match(/\d+/);
          const frameNum = frameMatch ? parseInt(frameMatch[0], 10) : 0;
          win.__frameEvents.push({
            frame: frameNum,
            time: now,
            loadMs: now - lastSrcTime,
          });
        });
      }
    });

    // Click Play button
    const playButton = page.locator('button[title*="Play sequence"]');
    if (await playButton.count()) {
      await playButton.click();
    } else {
      await page.keyboard.press('Space');
    }

    const tStart = Date.now();
    await page.waitForTimeout(seq.durationMs);
    const measuredDurationSec = (Date.now() - tStart) / 1000;

    // Pause playback
    await page.keyboard.press('Space');

    // Collect metrics from browser
    const metrics = await page.evaluate(() => {
      const win = window as unknown as {
        __longTasks: { duration: number; startTime: number }[];
        __frameEvents: { frame: number; time: number; loadMs: number }[];
        __playerEngineStats?: {
          achievedFps: number;
          droppedFrames: number;
          renderedFrames: number;
          avgDecodeMs: number;
        };
      };

      return {
        longTasks: win.__longTasks || [],
        frameEvents: win.__frameEvents || [],
        engineStats: win.__playerEngineStats || null,
      };
    });

    const longTasks = metrics.longTasks;
    const longTasksCount = longTasks.length;
    const longTasksTotalMs = longTasks.reduce((acc, t) => acc + t.duration, 0);
    const maxLongTaskMs = longTasks.reduce((max, t) => Math.max(max, t.duration), 0);

    const frameEvents = metrics.frameEvents;
    const framesDisplayed = metrics.engineStats
      ? metrics.engineStats.renderedFrames
      : frameEvents.length;

    const achievedFps = metrics.engineStats
      ? metrics.engineStats.achievedFps
      : framesDisplayed / measuredDurationSec;

    const expectedFrames = Math.floor(seq.targetFps * measuredDurationSec);
    const droppedFrames = metrics.engineStats
      ? metrics.engineStats.droppedFrames
      : Math.max(0, expectedFrames - framesDisplayed);

    const loadTimes = frameEvents.map((e) => e.loadMs).sort((a, b) => a - b);
    const avgLoadDecodeMs =
      loadTimes.length > 0
        ? loadTimes.reduce((acc, t) => acc + t, 0) / loadTimes.length
        : metrics.engineStats?.avgDecodeMs || 0;
    const p95LoadDecodeMs =
      loadTimes.length > 0 ? loadTimes[Math.floor(loadTimes.length * 0.95)] || 0 : 0;

    results.push({
      name: seq.name,
      targetFps: seq.targetFps,
      totalFrames: seq.name.includes('100f') ? 100 : 250,
      measuredDurationSec,
      framesDisplayed,
      achievedFps: Number(achievedFps.toFixed(2)),
      droppedFrames,
      longTasksCount,
      longTasksTotalMs: Math.round(longTasksTotalMs),
      maxLongTaskMs: Math.round(maxLongTaskMs),
      avgLoadDecodeMs: Number(avgLoadDecodeMs.toFixed(2)),
      p95LoadDecodeMs: Number(p95LoadDecodeMs.toFixed(2)),
    });

    console.log(
      `Result for ${seq.name}: Achieved ${achievedFps.toFixed(1)} fps (target ${seq.targetFps}), Dropped: ${droppedFrames}, LongTasks: ${longTasksCount} (${Math.round(longTasksTotalMs)}ms total), Avg Load/Decode: ${avgLoadDecodeMs.toFixed(1)}ms`,
    );
  }

  await app.close();
  return results;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.includes('--after') ? 'after' : 'before';
  runBenchmark(mode)
    .then((results) => {
      const docPath = path.resolve('docs/sequence-perf.md');
      let content = '';
      if (fs.existsSync(docPath)) {
        content = fs.readFileSync(docPath, 'utf8');
      }

      if (mode === 'before') {
        const md = `# Sequence Player Performance Profile

## Benchmark Environment
- OS: Linux (x86_64)
- Test Display: 1280x800, 60 Hz
- Test Sequences:
  - 1080p PNG: 250 frames @ 24 fps (1920x1080)
  - 4K PNG: 250 frames @ 24 fps (3840x2160)
  - 1080p JPEG: 250 frames @ 30 fps (1920x1080)
  - 1080p EXR: 100 frames @ 24 fps (1920x1080)

## BEFORE (Baseline: \`setInterval\` + \`<img>\` src swap on main thread)

| Sequence | Target FPS | Achieved FPS | Dropped / Lagged Frames | Long Tasks (>50ms) | Max Long Task | Avg Load + Decode |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
${results
  .map(
    (r) =>
      `| **${r.name}** | ${r.targetFps} | ${r.achievedFps} | ${r.droppedFrames} | ${r.longTasksCount} (${r.longTasksTotalMs} ms) | ${r.maxLongTaskMs} ms | ${r.avgLoadDecodeMs} ms |`,
  )
  .join('\n')}

### Root Cause Analysis of Baseline
1. **Timer Drift & Main-Thread Blocking**: The baseline player relies on \`setInterval\`. Each tick triggers a React state update (\`setCurrentFrame\`), an \`<img>\` DOM \`src\` mutation, and synchronous image decoding on Chromium's main thread.
2. **Slideshow on High-Resolution / Uncompressed Media**:
   - 4K PNGs require heavy main-thread decoding, freezing the UI and causing severe frame skips.
   - EXR files trigger on-demand proxy generation and IPC roundtrips per frame, stalling playback completely.
3. **No Read-Ahead or Memory Budgeting**: Frames are requested just-in-time, meaning disk I/O and CPU decompression reside directly on the critical animation path.
`;
        fs.writeFileSync(docPath, md, 'utf8');
        console.log(`\nWrote baseline profile to ${docPath}`);
      } else {
        // Append AFTER results
        const afterSection = `
## AFTER (New Playback Engine: Web Worker pool + Canvas + Ring Buffer + Custom Protocol)

| Sequence | Target FPS | Achieved FPS | Dropped Frames | Long Tasks (>50ms) | Max Long Task | Avg Decode |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
${results
  .map(
    (r) =>
      `| **${r.name}** | ${r.targetFps} | ${r.achievedFps} | ${r.droppedFrames} | ${r.longTasksCount} (${r.longTasksTotalMs} ms) | ${r.maxLongTaskMs} ms | ${r.avgLoadDecodeMs} ms |`,
  )
  .join('\n')}
`;
        fs.writeFileSync(docPath, content + afterSection, 'utf8');
        console.log(`\nAppended AFTER results to ${docPath}`);
      }
    })
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
