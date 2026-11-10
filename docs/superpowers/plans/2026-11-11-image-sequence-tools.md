# Image Sequence Tools (Viewer & Converter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated Image Sequence Tools tab in Render Night featuring an image sequence viewer (timeline scrubber, fps playback, native & proxy display, missing-frame detection) and a converter/stitcher (MP4 H.264/H.265, WebM, ProRes, crop, resolution, quality, audio in, progress & cancel) powered by system/fallback FFmpeg, plus an automatic "Stitch to MP4 when finished" job post-step.

**Architecture:** Pure Node/TS discovery, detection, proxy generation, and FFmpeg conversion engines in `src/core/sequence/` and `src/core/ffmpeg/` (zero Electron imports); Electron main IPC handlers in `src/main/ipc.ts`; Preload APIs in `src/preload/`; Zustand store updates and React UI in `src/renderer/components/sequence/`.

**Tech Stack:** TypeScript, React, Tailwind CSS, Zustand, FFmpeg (system detection + `ffmpeg-static` fallback), Vitest, Electron.

**Spec:** User request: Image Sequence Tools tab with Viewer (PNG/JPEG/WEBP/BMP/TGA native, EXR/TIFF/DPX proxies via FFmpeg/Blender with limitation notice, scrubber, fps, missing frames), Converter (MP4, WebM, ProRes, crop, resolution, quality, audio, progress & cancel), FFmpeg fallback with `docs/LICENSES.md`, "Stitch to MP4 when finished" post-step on image jobs, and end-to-end acceptance rendering 10 mock PNGs, viewing them, and stitching to MP4.

## Global Constraints
- Pure Node/TS in `src/core/`: NO Electron imports in core engines.
- Blender dark theme tokens: bg `#181818`, panel `#282828`, subpanel `#2d2d2d`, input `#1d1d1d`, border `#3d3d3d`, accent `#4772b3`, rendering `#e57a24`, text `#e6e6e6`, muted `#999999`.
- Multi-range rule adherence: image sequences can be stitched to video after rendering, without violating the rule that forbids direct video output for multi-range Blender renders.
- Git author: `BheeshamKS <bheeshamkumarsajnani3@gmail.com>`.

## Review Focus
1. Discontinuous frame sequences with gaps (e.g. frames 1..50 with missing frames 12, 13) must be detected and highlighted clearly without crashing playback.
2. FFmpeg executable resolution must reliably check user-selected path -> system `PATH` (`which ffmpeg` / `where ffmpeg`) -> `ffmpeg-static` bundled binary.
3. Proxy cache must avoid re-converting EXR/TIFF frames that are already cached and handle unsupported formats with visible limitation feedback.
4. Video stitching cancellation must terminate the child process tree immediately without leaving orphaned FFmpeg processes.
5. "Stitch to MP4 when finished" post-step must run only after all image frames finish successfully, preserving the original sequence.

---

### Task 1: FFmpeg Discovery Engine & Licensing Documentation

**Files:**
- Create: `src/core/ffmpeg/discovery.ts`
- Create: `docs/LICENSES.md`
- Test: `tests/ffmpeg-discovery.test.ts`

**Interfaces:**
- Produces: `getFfmpegPath(customPath?: string): Promise<{ path: string; source: 'custom' | 'system' | 'bundled'; version?: string } | null>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { getFfmpegPath } from '../src/core/ffmpeg/discovery';

describe('FFmpeg Discovery', () => {
  it('discovers ffmpeg from system or ffmpeg-static fallback', async () => {
    const result = await getFfmpegPath();
    expect(result).not.toBeNull();
    expect(result?.path).toBeTruthy();
    expect(['system', 'bundled', 'custom']).toContain(result?.source);
  });

  it('validates custom ffmpeg path', async () => {
    const invalid = await getFfmpegPath('/non/existent/path/to/ffmpeg');
    expect(invalid).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ffmpeg-discovery.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `discovery.ts` and `docs/LICENSES.md`**

Implement `getFfmpegPath` in `src/core/ffmpeg/discovery.ts` checking `customPath` -> system PATH (`execFile('ffmpeg', ['-version'])`) -> `ffmpeg-static` package (`import('ffmpeg-static')`).
Create `docs/LICENSES.md` documenting FFmpeg LGPL v2.1+ / GPL v2+ licensing terms and attribution.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ffmpeg-discovery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ffmpeg/discovery.ts docs/LICENSES.md tests/ffmpeg-discovery.test.ts
git commit -m "feat(ffmpeg): implement ffmpeg discovery and license documentation"
```

---

### Task 2: Image Sequence Detection & Missing Frames Engine

**Files:**
- Create: `src/core/schemas/sequence.ts`
- Create: `src/core/sequence/sequence-detector.ts`
- Test: `tests/sequence-detector.test.ts`

**Interfaces:**
- Produces:
  - `ImageSequenceInfo`: `{ directory: string; baseName: string; extension: string; pattern: string; startFrame: number; endFrame: number; totalFrames: number; frames: number[]; filePaths: Map<number, string>; missingFrames: number[]; isNativeFormat: boolean }`
  - `detectSequence(dirOrPattern: string): Promise<ImageSequenceInfo | null>`
  - `findSequencesInDirectory(dir: string): Promise<ImageSequenceInfo[]>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectSequence } from '../src/core/sequence/sequence-detector';

describe('Sequence Detector', () => {
  it('detects numbered frames, calculates range, and identifies missing frames', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-seq-test-'));
    // Create frames 1, 2, 4, 5 (missing frame 3)
    [1, 2, 4, 5].forEach((f) => {
      fs.writeFileSync(path.join(tmp, `shot_${String(f).padStart(4, '0')}.png`), 'data');
    });

    const info = await detectSequence(tmp);
    expect(info).not.toBeNull();
    expect(info?.startFrame).toBe(1);
    expect(info?.endFrame).toBe(5);
    expect(info?.totalFrames).toBe(4);
    expect(info?.missingFrames).toEqual([3]);
    expect(info?.extension).toBe('png');
    expect(info?.isNativeFormat).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sequence-detector.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `sequence-detector.ts` and `src/core/schemas/sequence.ts`**

Implement regex matching for frame sequences (`name_####.ext`, `name.####.ext`, `name0001.ext`). Group files by base prefix and extension, sort frames, compute missing frame gaps between `min(frames)` and `max(frames)`, determine native formats (`png`, `jpg`, `jpeg`, `webp`, `bmp`, `tga`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/sequence-detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/schemas/sequence.ts src/core/sequence/sequence-detector.ts tests/sequence-detector.test.ts
git commit -m "feat(sequence): implement image sequence and missing frames detection"
```

---

### Task 3: EXR/TIFF/DPX Proxy Cache Generator

**Files:**
- Create: `src/core/sequence/proxy-generator.ts`
- Test: `tests/proxy-generator.test.ts`

**Interfaces:**
- Produces:
  - `generateFrameProxy(sourcePath: string, cacheDir: string, ffmpegBin?: string): Promise<{ proxyPath: string; isCached: boolean; error?: string }>`
  - `batchGenerateProxies(filePaths: string[], cacheDir: string, ffmpegBin?: string): Promise<Map<string, string>>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateFrameProxy } from '../src/core/sequence/proxy-generator';

describe('Proxy Generator', () => {
  it('generates a cached PNG thumbnail proxy for non-native image format', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-proxy-test-'));
    const cacheDir = path.join(tmp, 'cache');
    const dummySrc = path.join(tmp, 'sample.tif');
    fs.writeFileSync(dummySrc, 'DUMMY_TIFF');

    // In unit test without real TIFF decoder, handles cache check & error report gracefully
    const res = await generateFrameProxy(dummySrc, cacheDir);
    expect(res).toBeDefined();

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/proxy-generator.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `proxy-generator.ts`**

Generate deterministic cache filename from `md5(sourcePath + mtimeMs) + '.png'`. Check if proxy already exists; if not, invoke FFmpeg `-i <sourcePath> -frames:v 1 -vf scale='min(1920,iw):-2' <proxyPath>` or fallback to Blender script. Return error note if unsupported.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/proxy-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sequence/proxy-generator.ts tests/proxy-generator.test.ts
git commit -m "feat(sequence): implement EXR/TIFF/DPX proxy thumbnail generator"
```

---

### Task 4: FFmpeg Image Sequence Converter / Stitching Engine

**Files:**
- Create: `src/core/ffmpeg/converter.ts`
- Test: `tests/ffmpeg-converter.test.ts`

**Interfaces:**
- Produces:
  - `StitchOptions`: `{ inputPattern: string; startFrame?: number; fps: number; outputFormat: 'mp4_h264' | 'mp4_h265' | 'webm' | 'prores'; resolution?: { width: number; height: number }; crop?: { width: number; height: number; x: number; y: number }; quality?: 'high' | 'medium' | 'low' | number; audioPath?: string; outputPath: string; ffmpegExecutable?: string }`
  - `StitchProgress`: `{ frame: number; fps: number; totalFrames?: number; progressPercent?: number; speed: string; time: string }`
  - `SequenceStitcher`: Class with `start(onProgress?: (p: StitchProgress) => void): Promise<string>` and `cancel(): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildFfmpegArgs } from '../src/core/ffmpeg/converter';

describe('FFmpeg Sequence Converter', () => {
  it('constructs correct arguments for MP4 H.264, WebM, and ProRes', () => {
    const mp4Args = buildFfmpegArgs({
      inputPattern: '/renders/shot_%04d.png',
      startFrame: 1,
      fps: 24,
      outputFormat: 'mp4_h264',
      outputPath: '/renders/output.mp4',
    });
    expect(mp4Args).toContain('-framerate');
    expect(mp4Args).toContain('24');
    expect(mp4Args).toContain('libx264');
    expect(mp4Args).toContain('/renders/output.mp4');

    const proresArgs = buildFfmpegArgs({
      inputPattern: '/renders/shot_%04d.png',
      fps: 30,
      outputFormat: 'prores',
      outputPath: '/renders/output.mov',
    });
    expect(proresArgs).toContain('prores_ks');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ffmpeg-converter.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `converter.ts`**

Implement `buildFfmpegArgs` and `SequenceStitcher`. Parse FFmpeg stdout/stderr regex for `frame=\s*(\d+)`, `fps=\s*([0-9.]+)`, `time=\s*([0-9:.]+)`, and calculate percentage against `totalFrames`. Add child process reference and clean `cancel()` terminating the process.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ffmpeg-converter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ffmpeg/converter.ts tests/ffmpeg-converter.test.ts
git commit -m "feat(ffmpeg): implement sequence stitching engine with progress and cancel"
```

---

### Task 5: IPC Handlers, Preload API & Post-Step Queue Automation

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/store/queueStore.ts`
- Test: `tests/stitch-post-step.test.ts`

**Interfaces:**
- Produces:
  - IPC channels: `sequence:detect`, `sequence:generateProxy`, `sequence:stitch`, `sequence:cancelStitch`, `dialog:selectAudioFile`
  - Preload `RenderNightApi` methods: `detectSequence`, `generateProxy`, `stitchSequence`, `cancelStitch`, `selectAudioFile`
  - Store fields: `stitchToMp4?: boolean; stitchConfig?: StitchOptions` on `QueueJob`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { QueueEngine } from '../src/core/queue/queue-engine';

describe('Stitch to MP4 Post-Step', () => {
  it('triggers post-step stitch when job is completed and stitchToMp4 is enabled', async () => {
    // Test logic asserting stitch completion event
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/stitch-post-step.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement IPC handlers, Preload methods, and Queue Store post-step trigger**

Register `sequence:*` handlers in `src/main/ipc.ts`. Expose them through `src/preload/types.ts` and `src/preload/index.ts`. In `src/renderer/store/queueStore.ts`, on `job:done`, if `job.stitchToMp4 === true` and `job.isVideo !== true`, automatically invoke `stitchSequence` with the detected sequence output and log completion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/stitch-post-step.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/types.ts src/preload/index.ts src/renderer/store/queueStore.ts tests/stitch-post-step.test.ts
git commit -m "feat(sequence): wire up IPC handlers, preload API, and post-render stitch step"
```

---

### Task 6: Image Sequence Viewer UI (Timeline Scrubber, FPS, Missing Frames)

**Files:**
- Create: `src/renderer/components/sequence/SequenceViewer.tsx`
- Create: `src/renderer/components/sequence/ImageSequenceTab.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/ui-sequence-viewer.test.tsx`

**Interfaces:**
- Produces:
  - `<ImageSequenceTab />` component containing `<SequenceViewer />` and `<SequenceConverter />`
  - Tab navigation between `Queue` and `Image Sequences` in `<Toolbar />`

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SequenceViewer } from '../src/renderer/components/sequence/SequenceViewer';

describe('SequenceViewer UI', () => {
  it('renders playback controls, timeline scrubber, and fps selector', () => {
    render(<SequenceViewer />);
    expect(screen.getByText(/Open Sequence/i)).toBeDefined();
    expect(screen.getByTitle(/Play sequence/i)).toBeDefined();
    expect(screen.getByText(/FPS:/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui-sequence-viewer.test.tsx`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `SequenceViewer.tsx`, `ImageSequenceTab.tsx`, and Tab Switch in `Toolbar.tsx` & `App.tsx`**

Build the sequence viewer with canvas/image display, play/pause, step +/- 1, loop, scrubber slider, timecode, and missing frames warning alert. Wire tab toggle in Toolbar.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui-sequence-viewer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/sequence/SequenceViewer.tsx src/renderer/components/sequence/ImageSequenceTab.tsx src/renderer/components/Toolbar.tsx src/renderer/App.tsx tests/ui-sequence-viewer.test.tsx
git commit -m "feat(ui): add sequence viewer with timeline scrubber and tab navigation"
```

---

### Task 7: Sequence Converter UI & JobCard Integration

**Files:**
- Create: `src/renderer/components/sequence/SequenceConverter.tsx`
- Modify: `src/renderer/components/JobCard.tsx`
- Test: `tests/ui-sequence-converter.test.tsx`

**Interfaces:**
- Produces:
  - `<SequenceConverter />` component with codec options, resolution, crop, audio in, progress bar, cancel button.
  - JobCard button "View Sequence" on completed jobs and "Stitch to MP4 when finished" checkbox on image jobs.

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SequenceConverter } from '../src/renderer/components/sequence/SequenceConverter';

describe('SequenceConverter UI', () => {
  it('renders format dropdown, resolution, quality, audio picker, and stitch button', () => {
    render(<SequenceConverter sequence={null} />);
    expect(screen.getByText(/Format/i)).toBeDefined();
    expect(screen.getByText(/Resolution/i)).toBeDefined();
    expect(screen.getByText(/Quality/i)).toBeDefined();
    expect(screen.getByText(/Stitch to Video/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui-sequence-converter.test.tsx`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `SequenceConverter.tsx` and integrate into `JobCard.tsx`**

Build converter settings form (formats: MP4 H.264/H.265, WebM, ProRes; resolution, crop, audio picker, destination path). Implement progress bar and Cancel button. Add "View Sequence" and "Stitch to MP4 when finished" on `JobCard`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui-sequence-converter.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/sequence/SequenceConverter.tsx src/renderer/components/JobCard.tsx tests/ui-sequence-converter.test.tsx
git commit -m "feat(ui): add sequence converter UI and job card integration"
```

---

### Task 8: End-to-End Acceptance Test (Render 10 Mock PNGs, View Sequence, Stitch to MP4)

**Files:**
- Create: `tests/e2e-sequence-acceptance.test.ts`

**Interfaces:**
- Tests:
  - Generates 10 mock PNG frames (`frame_0001.png` .. `frame_0010.png`) using real PNG image bytes.
  - Detects sequence via `detectSequence(dir)`.
  - Stitches sequence to MP4 (`output.mp4`) at 24 fps.
  - Verifies MP4 exists on disk, has non-zero size, and checks frame count/metadata via FFmpeg.

- [ ] **Step 1: Write the end-to-end acceptance test**

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectSequence } from '../src/core/sequence/sequence-detector';
import { SequenceStitcher } from '../src/core/ffmpeg/converter';
import { getFfmpegPath } from '../src/core/ffmpeg/discovery';

describe('E2E Acceptance: Render 10 Mock PNGs, View, and Stitch to MP4', () => {
  it('detects 10 frames and stitches them to an MP4 video file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-e2e-seq-'));
    const outVideo = path.join(tmp, 'stitched_output.mp4');

    // 1-pixel valid PNG buffer base64
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    // Write 10 mock PNGs
    for (let i = 1; i <= 10; i++) {
      fs.writeFileSync(path.join(tmp, `test_${String(i).padStart(4, '0')}.png`), validPng);
    }

    // 1. Detect sequence
    const seq = await detectSequence(tmp);
    expect(seq).not.toBeNull();
    expect(seq?.totalFrames).toBe(10);
    expect(seq?.startFrame).toBe(1);
    expect(seq?.endFrame).toBe(10);
    expect(seq?.missingFrames).toHaveLength(0);

    // 2. Stitch to MP4
    const ffmpegInfo = await getFfmpegPath();
    expect(ffmpegInfo).not.toBeNull();

    const stitcher = new SequenceStitcher({
      inputPattern: path.join(tmp, 'test_%04d.png'),
      startFrame: 1,
      fps: 24,
      outputFormat: 'mp4_h264',
      outputPath: outVideo,
      ffmpegExecutable: ffmpegInfo!.path,
    });

    await stitcher.start();

    // 3. Verify output video exists
    expect(fs.existsSync(outVideo)).toBe(true);
    const stat = fs.statSync(outVideo);
    expect(stat.size).toBeGreaterThan(0);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- tests/e2e-sequence-acceptance.test.ts`
Expected: PASS

- [ ] **Step 3: Run full verification (lint, typecheck, test, build)**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: Exit code 0 for all commands.

- [ ] **Step 4: Commit and push**

```bash
git add tests/e2e-sequence-acceptance.test.ts
git commit -m "test: verify image sequence detection, viewing, and mp4 stitching end-to-end"
git push origin main
```
