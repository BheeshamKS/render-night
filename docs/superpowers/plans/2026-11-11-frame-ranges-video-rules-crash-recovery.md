# Frame Ranges, Image-vs-Video Rules, and Crash Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement flexible frame range modes (Scene Default, Simple, Custom multi-range with deduplication, Single Still), image-vs-video formatting constraints, missing frame detection, robust crash recovery with retries/CPU fallback/skipping, and rolling ETA calculation.

**Architecture:**
- Range parsing and validation logic in `src/core/ranges/` (zero Electron dependencies, pure Node/TS, fully unit tested).
- Zod schemas in `src/core/schemas/` updated for frame range configurations, crash policies, and failed frame reports; documented in `docs/protocol.md`.
- `QueueEngine` in `src/core/queue/queue-engine.ts` enhanced to handle crash detection, frame retries, CPU fallback, frame skipping, consecutive crash thresholds, and non-distorted rolling ETA.
- Mock-blender updated to simulate frame crashes via `crashConfig`.
- React UI updated to provide range mode selectors, live frame count display, video format constraints, "Render Missing Frames Only" toggle, failed frames display, and "Retry failed frames" action.

**Tech Stack:** TypeScript, React, Zustand, Zod, Vitest, Node.js child_process, Tailwind CSS.

**Spec:** User prompt requirements in conversation transcript.

## Global Constraints
- `src/core` has ZERO Electron imports.
- Git author: `BheeshamKS <bheeshamkumarsajnani3@gmail.com>`. No co-authors.
- Branch `main`. Push after each completed feature.
- Update Zod schemas and `docs/protocol.md` before implementation.
- Tests, lint (`eslint .`), and typecheck (`tsc --noEmit`) must pass before every commit.

## Review Focus
1. Overlapping range deduplication: `"50-200, 200-300"` must contain frame 200 exactly once and produce 251 sorted frames.
2. Video format validation: FFmpeg video formats must disallow discontinuous or custom multi-ranges and show a clear reason.
3. Missing frame scanner: Output pattern expansion must check physical existence on disk and correctly skip only existing frames.
4. Crash loop containment: Consecutive crashes on a single job must fail that job without stopping the rest of the queue.
5. Rolling ETA accuracy: Skipped, missing, and failed frames must not enter the rolling average frame duration calculation.

---

### Task 1: Protocol Schemas & Documentation Updates

**Files:**
- Modify: `src/core/schemas/override.ts`
- Modify: `src/core/schemas/queue-state.ts`
- Modify: `docs/protocol.md`
- Test: `tests/range-schemas.test.ts`

**Interfaces:**
- Produces: `frameRangeConfigSchema`, `crashPolicySchema`, `failedFrameSchema`, and updated `queueStateSchema`.

- [ ] **Step 1: Write failing test in `tests/range-schemas.test.ts`**
  Validate schema parsing for custom range configs, crash policies, and failed frames tracking.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test tests/range-schemas.test.ts`
  Expected: FAIL
- [ ] **Step 3: Update `src/core/schemas/override.ts` and `src/core/schemas/queue-state.ts`**
  Add `frameRangeConfigSchema`, `crashPolicySchema`, and `failedFrameSchema`.
- [ ] **Step 4: Update `docs/protocol.md`**
  Document the range modes, image-vs-video constraint rule, and crash recovery policy options.
- [ ] **Step 5: Run tests and verify they pass**
  Run: `npm test tests/range-schemas.test.ts`
  Expected: PASS
- [ ] **Step 6: Commit and push**
  `git commit -m "feat(schema): add schemas for frame range configurations and crash recovery policies"`

---

### Task 2: Custom Range Parser & Missing Frames Scanner

**Files:**
- Create: `src/core/ranges/frame-range.ts`
- Create: `src/core/ranges/missing-frames.ts`
- Create: `src/core/ranges/index.ts`
- Modify: `src/core/render/range-parser.ts` (re-export for backward compatibility)
- Test: `tests/frame-range.test.ts`

**Interfaces:**
- Produces:
  - `parseCustomRange(expression: string): number[]`
  - `resolveFrameRange(config: FrameRangeConfig, sceneDefaults: { start: number; end: number; step?: number }): ResolvedFrameRange`
  - `validateRangeForFormat(range: ResolvedFrameRange, format: string): { valid: boolean; reason?: string }`
  - `filterMissingFrames(frames: number[], outputPattern: string, outputDir: string, existsSyncFn?: (p: string) => boolean): { missingFrames: number[]; existingFrames: number[] }`

- [ ] **Step 1: Write table-driven unit tests in `tests/frame-range.test.ts`**
  Include `"50-200, 200-300"`, `"1-50, 75, 120-240x2"`, single frames, negative ranges, deduplication, sorting, invalid input rejections, video format validation, and missing frame filtering.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test tests/frame-range.test.ts`
  Expected: FAIL
- [ ] **Step 3: Implement `src/core/ranges/frame-range.ts` and `src/core/ranges/missing-frames.ts`**
  Build the parser with tokenization, stepping, set deduplication, sorting, and format validation.
- [ ] **Step 4: Run tests and verify they pass**
  Run: `npm test tests/frame-range.test.ts`
  Expected: PASS
- [ ] **Step 5: Run lint and typecheck**
  Run: `npm run lint:fix && npm run typecheck`
- [ ] **Step 6: Commit and push**
  `git commit -m "feat(ranges): implement custom multi-range parser and missing frames filter"`

---

### Task 3: Queue Engine Crash Recovery & Rolling ETA

**Files:**
- Modify: `src/core/queue/queue-engine.ts`
- Modify: `tools/mock-blender/index.js`
- Test: `tests/crash-recovery.test.ts`

**Interfaces:**
- Consumes: `CrashPolicy`, `filterMissingFrames`
- Produces: Crash retry logic, CPU fallback on frame crash, skipping failed frames, max consecutive crashes enforcement, and rolling ETA calculation.

- [ ] **Step 1: Update `tools/mock-blender/index.js` to support crash simulation**
  Accept `crashConfig: { frame: number; crashGpu?: boolean; crashCpu?: boolean }` to crash on target frame.
- [ ] **Step 2: Write unit/integration test in `tests/crash-recovery.test.ts`**
  Simulate frame 114 crashing on GPU -> retried on GPU -> falling back to CPU -> crashing on CPU -> skipped and continued for 115-200. Test rolling ETA ignoring skipped/failed frames.
- [ ] **Step 3: Implement crash recovery loop and rolling ETA in `src/core/queue/queue-engine.ts`**
  Relaunch Blender with remaining frames upon crash, handle retries, CPU fallback, and track failed frames.
- [ ] **Step 4: Run tests and verify they pass**
  Run: `npm test tests/crash-recovery.test.ts`
  Expected: PASS
- [ ] **Step 5: Run lint and typecheck**
  Run: `npm run lint:fix && npm run typecheck`
- [ ] **Step 6: Commit and push**
  `git commit -m "feat(queue): implement crash recovery with retries, cpu fallback, frame skipping, and rolling eta"`

---

### Task 4: UI Integration (Range Selectors, Video Rules, Missing Frames & Failed Frames Retry)

**Files:**
- Modify: `src/renderer/store/queueStore.ts`
- Modify: `src/renderer/components/JobCard.tsx`
- Modify: `src/renderer/components/MonitorDock.tsx`
- Test: `tests/ui-ranges-and-recovery.test.ts`

**Interfaces:**
- Consumes: `FrameRangeConfig`, `validateRangeForFormat`, `CrashPolicy`
- Produces: Range mode UI controls (Scene Default, Simple, Custom, Single Still), live frame count, video format validation warning, "Render Missing Frames Only" toggle, failed frames badge, and "Retry failed frames" button.

- [ ] **Step 1: Write tests for store range validation and retry failed frames action**
  In `tests/ui-ranges-and-recovery.test.ts`.
- [ ] **Step 2: Update `src/renderer/store/queueStore.ts`**
  Add range mode configuration, format validation check, missing frames toggle, and `retryFailedFrames(jobId)` action.
- [ ] **Step 3: Update `src/renderer/components/JobCard.tsx`**
  Render range mode selector, live frame count display, video rule warning banner, missing frames checkbox, and failed frames list with retry button.
- [ ] **Step 4: Update `src/renderer/components/MonitorDock.tsx`**
  Display video ETA from Blender's native remaining time when applicable.
- [ ] **Step 5: Run tests, lint, and typecheck**
  Run: `npm test && npm run lint:fix && npm run typecheck && npm run build`
- [ ] **Step 6: Commit and push**
  `git commit -m "feat(ui): add frame range modes, video rule validation, missing frames toggle, and failed frames retry"`

---

### Task 5: End-to-End Acceptance Verification & Regression Testing

**Files:**
- Test: `tests/e2e-crash-recovery-acceptance.test.ts`
- Modify: `docs/KNOWN_LIMITATIONS.md`

- [ ] **Step 1: Run comprehensive end-to-end acceptance test**
  Verify mock-blender crashing at frame 114 results in retry, CPU fallback, skip, then continue 115-200.
- [ ] **Step 2: Run full test suite, lint, typecheck, and build**
  Run: `npm test && npm run lint && npm run typecheck && npm run build`
- [ ] **Step 3: Commit and push**
  `git commit -m "test: verify end-to-end crash recovery and frame range acceptance"`
