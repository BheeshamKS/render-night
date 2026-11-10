# Render Runner, Process Control, and Live Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the single-machine Blender batch render runner (`render_runner.py`), process control with pause/stop and process-tree termination, sleep prevention via powerSaveBlocker, GPU utilization monitoring, and the bottom live monitor dock with real-time stats and thumbnail previews.

**Architecture:** Pure Node logic lives in `src/core/queue`, `src/core/power`, and `src/core/render`. The Python runner (`render_runner.py`) reads a JSON payload, configures Cycles/EEVEE GPU/CPU devices, applies overrides in-memory without saving the `.blend`, renders image sequences frame-by-frame (or animation for FFmpeg), checks a `control.json` file between frames for pause/stop, and emits structured `RN_EVENT` lines. The queue engine streams stdout/stderr to disk logs and exposes typed events. Electron Main wires `powerSaveBlocker` and IPC to the React frontend.

**Tech Stack:** Node.js child_process, Blender Python (`bpy`), Electron `powerSaveBlocker` & IPC, React 18, Zustand, Tailwind CSS, Zod, Vitest.

**Spec:** User prompt requirements for Render Runner, Process Control, Sleep Prevention, Device Detection, and Live Monitor.

## Global Constraints
- App display name: "Render Night", slug: `render-night`, runner stdout prefix: `RN_EVENT`.
- Never modify or save the user's original `.blend` file (the runner must never call `bpy.ops.wm.save_mainfile`).
- Compatibility: Blender 3.6 LTS, 4.2 LTS, 5.x.
- Process termination: kill entire process tree (`taskkill /T /F` on Windows, process group SIGTERM/SIGKILL on Unix).
- All JSON contracts must have Zod schemas in `src/core/schemas/` and docs in `docs/protocol.md` before writing code.
- Tests, lint, and typecheck must pass before every commit. Git author: `BheeshamKS <bheeshamkumarsajnani3@gmail.com>`.

## Review Focus
1. Process tree kill cleanup: ensures no orphan Blender processes remain when stopping or killing a job.
2. Pause responsiveness: checking `control.json` cleanly between frames without blocking or race conditions.
3. GPU device fallback detection: verifying that if GPU is requested but Cycles falls back to CPU, `fallbackToCpu` is set to `true` and warned in UI.
4. FFmpeg video vs Image Sequences: identifying video containers and updating pause mode to "Pause After Current Job" with UI documentation.
5. Thumbnail generation and handling of formats (PNG/JPEG/WEBP displayable, EXR placeholder).

---

### Task 1: Update Protocol Schemas and Documentation for Runner & Control

**Files:**
- Modify: `src/core/schemas/runner-event.ts`
- Modify: `src/core/schemas/override.ts`
- Modify: `docs/protocol.md`
- Create: `tests/runner-protocol.test.ts`

**Interfaces:**
- Produces: `RunnerEvent` union (`job_start`, `device_report`, `overrides_report`, `frame_start`, `frame_done`, `frame_error`, `job_done`), `RunnerPayload` schema, `ControlCommand` schema.

- [ ] **Step 1: Write schema validation test in tests/runner-protocol.test.ts**
  - Test validation of each `RN_EVENT` variant.
  - Test validation of `runnerPayloadSchema` and `controlCommandSchema`.

- [ ] **Step 2: Run test to verify failure**
  - Run `npm test tests/runner-protocol.test.ts`.

- [ ] **Step 3: Update schemas and docs**
  - In `src/core/schemas/runner-event.ts`, add `job_start`, `device_report` (with `computeDeviceType`, `mode`, `devices`, `requestedGpu`, `fallbackToCpu`), `overrides_report` (`applied`, `skipped`), `frame_done` (`saved`, `timeSeconds`, `peakMemory`), `frame_error`, and `job_done`.
  - In `src/core/schemas/override.ts`, define `runnerPayloadSchema` and `controlCommandSchema`.
  - In `docs/protocol.md`, document every event and payload format.

- [ ] **Step 4: Run test to verify pass**
  - Run `npm test tests/runner-protocol.test.ts`.

- [ ] **Step 5: Commit and push**
  - Run lint and typecheck.
  - Commit `feat(schema): update runner event and control protocol schemas` and git push.

---

### Task 2: Python Render Runner Implementation (`render_runner.py`)

**Files:**
- Modify: `resources/python/render_runner.py`
- Modify: `tools/mock-blender/index.js`
- Create: `tests/render-runner.test.ts`

**Interfaces:**
- Produces: `resources/python/render_runner.py` supporting `blender -b file -P render_runner.py -- <payload.json>`

- [ ] **Step 1: Write test for render_runner in tests/render-runner.test.ts using mock-blender**
  - Test that mock-blender can execute a job payload, emit `job_start`, `device_report`, `overrides_report`, `frame_start`, `frame_done`, and `job_done`.
  - Test pause and stop control via `control.json`.

- [ ] **Step 2: Run test to verify failure**
  - Run `npm test tests/render-runner.test.ts`.

- [ ] **Step 3: Implement resources/python/render_runner.py**
  - Load payload from sys.argv after `--`.
  - Set active scene and camera (without saving).
  - Configure GPU devices via Cycles addon preferences (`compute_device_type`, `get_devices()`, enable specific/active devices, fallback to CPU if no GPU available).
  - Apply in-memory overrides using safe attribute path traversal in `try/except`; report applied and skipped.
  - Frame-by-frame loop for image formats:
    - Check `control.json` before each frame for `'pause'` or `'stop'`.
    - `scene.frame_set(frame)`.
    - Emit `RN_EVENT frame_start`.
    - Set `scene.render.filepath` to explicit computed frame path.
    - `bpy.ops.render.render(write_still=True)`.
    - Emit `RN_EVENT frame_done`.
  - Video formats (FFmpeg): render animation sequence without per-frame pause.
  - Emit `RN_EVENT job_done`.
  - Update `tools/mock-blender/index.js` to simulate frame-by-frame rendering and control.json checks for unit tests.

- [ ] **Step 4: Run test to verify pass**
  - Run `npm test tests/render-runner.test.ts`.

- [ ] **Step 5: Commit and push**
  - Run lint and typecheck.
  - Commit `feat(runner): implement headless python render runner with device setup and control channel` and git push.

---

### Task 3: Process Killer, Sleep Blocker, and GPU Monitor Utilities

**Files:**
- Create: `src/core/render/process-killer.ts`
- Create: `src/core/power/sleep-blocker.ts`
- Create: `src/core/render/gpu-monitor.ts`
- Create: `tests/power-and-process.test.ts`

**Interfaces:**
- `killProcessTree(pid: number): Promise<void>`
- `SleepBlocker`: `{ acquire(reason?: string): number; release(id: number): void; isBlocking(): boolean }`
- `sampleGpuUtilization(): Promise<{ status: 'ok' | 'unverified'; utilizationGpu?: number; memoryUsedMb?: number; memoryTotalMb?: number }>`

- [ ] **Step 1: Write tests for process killer and sleep blocker in tests/power-and-process.test.ts**
  - Test reference counting and acquire/release behavior of `SleepBlocker`.
  - Test GPU monitor fallback to `'unverified'` when GPU tooling is absent.

- [ ] **Step 2: Run tests to verify failures**
  - Run `npm test tests/power-and-process.test.ts`.

- [ ] **Step 3: Implement process-killer, sleep-blocker, and gpu-monitor**
  - `src/core/render/process-killer.ts`: use `taskkill /pid <pid> /T /F` on win32, and `process.kill(-pid, 'SIGKILL')` on Unix.
  - `src/core/power/sleep-blocker.ts`: manage power save blocker state with support for Electron main `powerSaveBlocker` and mock adapters.
  - `src/core/render/gpu-monitor.ts`: execute `nvidia-smi` / `rocm-smi` with short timeout, parse output or return `'unverified'`.

- [ ] **Step 4: Run tests to verify pass**
  - Run `npm test tests/power-and-process.test.ts`.

- [ ] **Step 5: Commit and push**
  - Run lint and typecheck.
  - Commit `feat(core): implement process tree killer, sleep blocker and gpu monitor` and git push.

---

### Task 4: Queue Execution Engine (`src/core/queue/queue-engine.ts`)

**Files:**
- Create: `src/core/queue/queue-engine.ts`
- Create: `tests/queue-engine.test.ts`
- Modify: `tests/stdout.test.ts` (add real Blender output samples)

**Interfaces:**
- `QueueEngine`: manages sequential job execution, creates per-job log files, writes `control.json`, spawns Blender, parses stdout + `RN_EVENT`, handles Pause/Stop, emits typed events.

- [ ] **Step 1: Write test for QueueEngine in tests/queue-engine.test.ts**
  - Test running a 10-frame job using mock-blender.
  - Test pausing after current frame via `engine.pause()`.
  - Test stopping and process tree termination via `engine.stop()`.
  - Test disk log file creation under `logs/<jobId>/<timestamp>.log`.
  - Add recorded real Blender stdout samples to `tests/stdout.test.ts`.

- [ ] **Step 2: Run test to verify failure**
  - Run `npm test tests/queue-engine.test.ts`.

- [ ] **Step 3: Implement QueueEngine in src/core/queue/queue-engine.ts**
  - Support job queue state, priority (nice level), thread limits.
  - Stream logs to disk file and memory buffer.
  - Handle pause sentinel writing and stop signal killing.
  - Emit typed events: `job:start`, `frame:start`, `frame:done`, `progress`, `device:report`, `job:done`, `job:failed`.

- [ ] **Step 4: Run test to verify pass**
  - Run `npm test tests/queue-engine.test.ts`.

- [ ] **Step 5: Commit and push**
  - Run lint and typecheck.
  - Commit `feat(queue): implement queue engine with process control and disk logging` and git push.

---

### Task 5: Electron Main Process Integration & IPC

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/types.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Expose `window.rnApi.queue`:
  - `startQueue(jobs: QueueJobPayload[]): Promise<void>`
  - `pauseQueue(): Promise<void>`
  - `stopQueue(): Promise<void>`
  - `openLogsFolder(jobId: string): Promise<void>`
  - `onQueueEvent(callback: (event: QueueEngineEvent) => void): () => void`

- [ ] **Step 1: Wire QueueEngine in Main Process**
  - Instantiate `QueueEngine` and integrate with Electron `powerSaveBlocker`.
  - Broadcast queue engine events to `BrowserWindow` via `webContents.send('queue:event', event)`.
  - Register IPC handlers for start, pause, stop, open folder.

- [ ] **Step 2: Expose in Preload Bridge**
  - Update `src/preload/types.ts` and `src/preload/index.ts` with typed queue API and listener cleanup.

- [ ] **Step 3: Verify build and typecheck**
  - Run `npm run typecheck` and `npm run build`.

- [ ] **Step 4: Commit and push**
  - Run lint.
  - Commit `feat(ipc): expose queue engine controls and real-time events over ipc` and git push.

---

### Task 6: UI Polish: Live Monitor Dock, Device Badges, and Console Drawers

**Files:**
- Modify: `src/renderer/store/queueStore.ts`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/renderer/components/JobCard.tsx`
- Modify: `src/renderer/components/MonitorDock.tsx`
- Modify: `docs/KNOWN_LIMITATIONS.md`

**Interfaces:**
- Queue UI:
  - Enabled Start, Pause ("Pause After Current Frame" / "Pause After Current Job"), and Stop buttons with confirmation.
  - Per-job device badge: "GPU: RTX 3060 (OptiX)" or "CPU: 16 threads", orange warning on CPU fallback.
  - Collapsible console drawer per job with error syntax highlighting and "Open Output Folder" button.
  - Live monitor dock showing overall queue progress, current frame, samples, elapsed, ETA, peak memory, and thumbnail of the last rendered frame.

- [ ] **Step 1: Update queueStore.ts with execution state and event subscriptions**
  - Store active job stats: current frame, total frames, current sample, total samples, elapsed seconds, eta seconds, peak memory, last thumbnail URL/path.
  - Store per-job console output buffer.
  - Listen to `window.rnApi.onQueueEvent` and update store in real time.

- [ ] **Step 2: Update Toolbar.tsx**
  - Wire Start, Pause, and Stop buttons to `startQueue`, `pauseQueue`, `stopQueue`.
  - Dynamic button text for Pause ("Pause After Current Frame" vs "Pause After Current Job").

- [ ] **Step 3: Update JobCard.tsx**
  - Add real-time device badge and CPU fallback warning.
  - Add collapsible console drawer displaying live stdout/stderr with error keyword highlighting.
  - Add "Open Output Folder" and "View Log File" buttons.

- [ ] **Step 4: Update MonitorDock.tsx**
  - Render progress bar, frame count ("Frame 64 of 250"), samples ("Sample 128/512"), elapsed time, ETA, peak memory.
  - Render thumbnail preview of the last finished frame (image for PNG/JPEG/WEBP, placeholder for EXR).

- [ ] **Step 5: Verify build, lint, and typecheck**
  - Run `npm run lint`, `npm run typecheck`, and `npm run build`.

- [ ] **Step 6: Commit and push**
  - Commit `feat(ui): implement live monitor dock, device badges, and console drawer` and git push.

---

### Task 7: End-to-End Acceptance Verification & Regression Testing

**Files:**
- Modify: `tests/integration.test.ts`
- Modify: `tests/stdout.test.ts`

**Interfaces:**
- Test acceptance criteria:
  - Mock-blender 10-frame job streams progress.
  - Pause and Stop control channels work cleanly.
  - Process tree termination kills subprocesses.
  - Sleep blocker activates while rendering and releases when idle.
  - Device badge and fallback warning render properly.
  - Real recorded Blender output lines are parsed accurately.

- [ ] **Step 1: Run comprehensive tests**
  - Run `npm test` across all suites.
  - Verify all tests pass with 0 failures.

- [ ] **Step 2: Full quality gate verification**
  - Run `npm run lint` -> 0 errors.
  - Run `npm run typecheck` -> 0 errors.
  - Run `npm run build` -> builds successfully.

- [ ] **Step 3: Commit and push**
  - Commit `test: verify render runner, process control, and live monitor acceptance` and git push.
