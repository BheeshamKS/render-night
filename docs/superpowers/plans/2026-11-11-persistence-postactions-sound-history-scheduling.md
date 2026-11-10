# Persistence, Safe Post-Queue Actions, Finish Sound, History, and Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement persistent queue state with crash restore and orphan cleanup, OS-specific post-queue power actions guarded by a 60-second cancel countdown and crash safety rule, deterministic "to-DUNG" finish audio with volume controls and background playback, append-only render history with search and re-add capabilities, and one-shot time scheduling with sleep prevention.

**Architecture:** Pure Node/TypeScript modules in `src/core` (`persistence/`, `post-actions/`, `history/`) with zero Electron dependencies. Electron main handles OS process execution and window lifecycle prompts. The renderer manages audio synthesis/playback, history modal/drawer, schedule timers, and post-action countdown UI.

**Tech Stack:** TypeScript, Node.js (`node:fs`, `node:child_process`, `node:path`), Zod, Zustand, Electron (`webPreferences.backgroundThrottling = false`, `powerSaveBlocker`, `shell`), React, Lucide Icons, Vitest.

**Spec:** Section 4 of user request ("PERSISTENCE / CRASH RESTORE", "POST-QUEUE ACTIONS", "FINISH SOUND", "HISTORY", "SCHEDULING").

## Global Constraints

- Pure Node/TS in `src/core/`, ZERO Electron imports.
- Update Zod schemas in `src/core/schemas/` and documentation in `docs/protocol.md` before changing code.
- Write queue state atomically (`write tmp file` then `fs.rename`).
- Hard safety rule: Post-queue actions only trigger after graceful in-session queue completion followed by a 60-second visible countdown. A crash, kill, or restored session NEVER triggers it.
- Deterministic finish sound generated via `tools/make-todung.mjs` into `resources/sounds/todung.wav`, committed together.
- Git author: `BheeshamKS <bheeshamkumarsajnani3@gmail.com>`. Commit and push to `main` after each feature.

## Review Focus

1. **Unclean shutdown & orphan cleanup**: If the app is killed mid-render (`kill -9`), restart detects the unclean marker, cleans up dead Blender PIDs, displays the resume prompt, and resume continues from the first missing frame.
2. **Post-action crash safety**: A restored session from a crashed queue must never trigger a shutdown or sleep action, even if one was configured prior to the crash.
3. **Sound playback while minimized**: Window minimization must not mute or delay the finish sound (`backgroundThrottling: false`).
4. **Atomic writes across power outages**: State writes cannot leave truncated or corrupted JSON files on disk.
5. **History fidelity**: Render history records the actual compute device from `device_report` (e.g. `GPU: NVIDIA RTX 4090 (OPTIX)` or `CPU: 16 threads`), not just the user's requested preference.

---

### Task 1: Protocol Schemas, Docs & Audio Synthesizer Tool

**Files:**
- Create: `src/core/schemas/history.ts`
- Create: `tools/make-todung.mjs`
- Create: `resources/sounds/todung.wav` (generated)
- Modify: `src/core/schemas/queue-state.ts`
- Modify: `src/core/schemas/index.ts`
- Modify: `docs/protocol.md`
- Test: `tests/schemas-and-sound.test.ts`

**Steps:**
- [ ] Add `postActionSchema`, `soundSettingsSchema`, `scheduleConfigSchema` to `src/core/schemas/queue-state.ts`.
- [ ] Create `historyEntrySchema` and `historyListSchema` in `src/core/schemas/history.ts`.
- [ ] Export all new schemas in `src/core/schemas/index.ts`.
- [ ] Document all new schemas, lock sentinel, post-actions, and history in `docs/protocol.md`.
- [ ] Create `tools/make-todung.mjs` to synthesize the "to-DUNG" WAV file into `resources/sounds/todung.wav`.
- [ ] Run `tools/make-todung.mjs` to generate `resources/sounds/todung.wav`.
- [ ] Write unit tests in `tests/schemas-and-sound.test.ts` verifying schema validation and WAV file header/duration.
- [ ] Run tests, lint, typecheck, commit: `feat(schema): add schemas for history, post-actions, sound and generate todung wav`, push.

---

### Task 2: Atomic Persistence, Session Lock & Crash Restore Engine

**Files:**
- Create: `src/core/persistence/atomic-file.ts`
- Create: `src/core/persistence/session-lock.ts`
- Create: `src/core/persistence/queue-persistence.ts`
- Modify: `src/core/queue/queue-engine.ts`
- Test: `tests/persistence-and-restore.test.ts`

**Steps:**
- [ ] Implement `writeAtomicFile` and `readJsonFile` with atomic write-temp-and-rename semantics in `atomic-file.ts`.
- [ ] Implement `SessionLockManager` in `session-lock.ts` to manage `unclean-shutdown.lock`, record running worker PIDs, and detect/kill orphaned Blender processes.
- [ ] Implement `QueuePersistence` in `queue-persistence.ts` with `schemaVersion`, migrations support, auto-save on state changes, and resume frame calculation via `filterMissingFrames`.
- [ ] Integrate session lock tracking and worker PID registration into `QueueEngine`.
- [ ] Write unit tests in `tests/persistence-and-restore.test.ts` testing atomic writes, corruption resilience, session lock lifecycle, orphan PID cleanup, and resume calculations.
- [ ] Run tests, lint, typecheck, commit: `feat(persistence): implement atomic state persistence, session lock, and crash restore engine`, push.

---

### Task 3: Safe Post-Queue Power Actions & OS Execution

**Files:**
- Create: `src/core/post-actions/post-action-executor.ts`
- Create: `src/core/post-actions/post-action-manager.ts`
- Test: `tests/post-actions.test.ts`

**Steps:**
- [ ] Implement `executePostAction(action, platform, options)` with OS commands for Windows (`shutdown /s /t 0`, `powrprof`), macOS (`osascript`, `pmset`), and Linux (`systemctl`) in `post-action-executor.ts`.
- [ ] Implement `PostActionManager` enforcing the HARD SAFETY RULE:
  - Only execute after graceful in-session queue completion.
  - A restored session or crashed session initializes `armed = false`.
  - Dispatches 60-second countdown with cancellation token.
- [ ] Write unit tests in `tests/post-actions.test.ts` validating OS command generation, 60s countdown timer, abort/cancel behavior, and verifying that a simulated crash or restored queue NEVER triggers the action.
- [ ] Run tests, lint, typecheck, commit: `feat(power): implement safe post-queue actions with 60s countdown and crash safety guard`, push.

---

### Task 4: Append-Only History Store & Rotation

**Files:**
- Create: `src/core/history/history-store.ts`
- Modify: `src/core/queue/queue-engine.ts`
- Test: `tests/history-store.test.ts`

**Steps:**
- [ ] Implement `HistoryStore` in `src/core/history/history-store.ts` with append-only write, file rotation (at max entries limit), search, filtering, and query APIs.
- [ ] Wire `QueueEngine` to emit `job:history` on job completion (recording actual device used from `device_report`, total time, average frame duration, result, and failed frames).
- [ ] Write unit tests in `tests/history-store.test.ts` verifying append, rotation, search, and filtering by engine, device, and status.
- [ ] Run tests, lint, typecheck, commit: `feat(history): implement append-only history store with rotation and device tracking`, push.

---

### Task 5: Main Process IPC, Window Lifecycle & Background Throttling

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/types.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/ipc-persistence.test.ts`

**Steps:**
- [ ] Set `webPreferences.backgroundThrottling = false` in `src/main/index.ts`.
- [ ] Add `before-quit` / `close` event interception in `src/main/index.ts`: if rendering, prompt "Stop render and quit?", kill processes cleanly, and save resumable state.
- [ ] Wire IPC handlers in `src/main/ipc.ts`:
  - `persistence:checkUncleanShutdown`
  - `persistence:saveQueue`
  - `persistence:loadQueue`
  - `persistence:clearLock`
  - `postAction:execute`
  - `history:getEntries`
  - `history:clear`
  - `sound:playTodung` (or renderer native audio with asset URI)
- [ ] Expose new methods and events in `src/preload/types.ts` and `src/preload/index.ts`.
- [ ] Run tests, lint, typecheck, commit: `feat(main): wire persistence, window close prompt, and background audio IPC`, push.

---

### Task 6: UI Integration: Restore Prompt, Post-Action Countdown, Sound Settings, History Drawer & Scheduling

**Files:**
- Create: `src/renderer/components/HistoryModal.tsx`
- Create: `src/renderer/components/ScheduleModal.tsx`
- Create: `src/renderer/components/SoundSettingsModal.tsx`
- Create: `src/renderer/components/PostActionCountdownModal.tsx`
- Create: `src/renderer/components/CrashRestoreBanner.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/renderer/store/queueStore.ts`
- Modify: `src/renderer/App.tsx`
- Test: `tests/ui-full-features.test.ts`

**Steps:**
- [ ] Update `queueStore.ts` with state and actions for:
  - `postAction` selection (`none`, `sleep`, `hibernate`, `shutdown`, `restart`, `close_app`).
  - Post-action 60s countdown and cancellation.
  - Sound settings (`volume`, `mute`, `playOnFailure`, `testSound`).
  - History view search, filter, and "Re-add to queue".
  - One-shot scheduler (`HH:MM`, countdown, sleep blocker integration).
  - Unclean shutdown detection and "Resume queue where it left off?" banner.
- [ ] Implement `CrashRestoreBanner.tsx` to display on launch after crash.
- [ ] Implement `PostActionCountdownModal.tsx` displaying 60s live countdown with Cancel button.
- [ ] Implement `HistoryModal.tsx` with search, filter, "Re-add to queue", and "Open output folder".
- [ ] Implement `ScheduleModal.tsx` for one-shot scheduling with sleep prevention.
- [ ] Implement `SoundSettingsModal.tsx` with volume slider, test button, and play on failure toggle.
- [ ] Update `Toolbar.tsx` to include Post-Action dropdown, History button, Schedule button, and Sound Settings button.
- [ ] Write tests in `tests/ui-full-features.test.ts` validating store state transitions.
- [ ] Run tests, lint, typecheck, commit: `feat(ui): add crash restore banner, post-action countdown, history modal, sound settings, and scheduler`, push.

---

### Task 7: End-to-End Acceptance Verification & Regression Testing

**Files:**
- Create: `tests/e2e-persistence-acceptance.test.ts`
- Modify: `docs/KNOWN_LIMITATIONS.md`
- Modify: `README.md`

**Steps:**
- [ ] Write comprehensive acceptance test verifying:
  - Simulated `kill -9` unclean shutdown mid-render.
  - Restart detects unclean shutdown, kills orphaned mock process PIDs, and displays resume prompt.
  - Resuming continues from the first missing frame.
  - Proves that post-queue action does NOT fire on restored sessions.
  - Proves that post-queue action DOES fire in graceful session with 60s countdown.
  - Verifies "to-DUNG" sound plays on job completion.
  - Verifies history records actual compute device used.
- [ ] Update documentation in `docs/KNOWN_LIMITATIONS.md` and `README.md`.
- [ ] Run full test suite, lint, typecheck, and electron-vite build.
- [ ] Commit: `test: verify end-to-end persistence, crash restore, post-actions, sound, history, and scheduling`, push.
