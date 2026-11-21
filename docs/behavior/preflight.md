# Render Night - Pre-Flight & Inspection Behavior Specification

This document defines the exact behavioral contract for Render Night's pre-flight checking, file inspection, and render execution. **Any future implementation (including Rust or native CLI ports) must strictly adhere to this specification.**

---

## 1. Guiding Principle: Never Hard-Block, Force-Continue

Render Night is designed for unattended and overnight batch rendering. An overnight queue must **never** stall waiting for user interaction because of missing textures, missing cameras, unwritable directories, or non-fatal inspection issues.

Blender's native design renders missing assets gracefully (e.g. magenta placeholder for missing textures). Render Night mirrors this resilience.

---

## 2. The Three (And Only Three) Blocking Conditions

A job is strictly blocked from starting (`isBlocking: true`) if and only if one of the following three physical impossibilities occurs:

1. **Missing or Inexecutable Blender Binary (`BLENDER_NOT_FOUND` / `BLENDER_NOT_EXECUTABLE`)**:
   - The configured Blender executable path does not exist on disk or has no execution permissions (`X_OK`).
2. **Missing or Unreadable `.blend` File (`BLEND_NOT_FOUND` / `BLEND_NOT_READABLE`)**:
   - The `.blend` file path does not exist on the filesystem or read access is denied (`R_OK`).
3. **Zero Frames to Render (`ZERO_FRAMES_TO_RENDER`)**:
   - The resolved frame range evaluates to an empty set (`frames.length === 0`), or an invalid custom range syntax yields zero valid frames.

**EVERYTHING ELSE is classified as a warning, never a block.**

---

## 3. Warning Classification & Semantics

All other pre-flight checks generate warnings (`severity: 'warning'`, `isBlocking: false`). The queue may start and proceed unimpeded:

| Code | Trigger Condition | Severity | Blocking | Quick Fix |
|---|---|---|---|---|
| `OUTPUT_DIR_NOT_WRITABLE` | Directory does not exist and cannot be created, or lacks write permissions (`W_OK`). | `warning` | **No** | Create Output Directory |
| `INSPECTION_FAILED` | Headless Blender inspection timed out, crashed, or exited with error. | `warning` | **No** | Enters Basic Mode |
| `NEWER_BLENDER_VERSION` | `.blend` file was saved with a newer Blender version than the runner executable. | `warning` | **No** | Select Compatible Blender |
| `NO_ACTIVE_CAMERA` | Scene has no active camera or camera datablock is unassigned. | `warning` | **No** | Select Available Camera |
| `VIDEO_RANGE_RULE_VIOLATION` | Video container format (FFmpeg, AVI) configured with a discontinuous frame range. | `warning` | **No** | Switch to Continuous Range |
| `MISSING_ASSETS` | External file (image, library, sound, vdb) missing on disk AND classified as `used` or `unknown`. | `warning` | **No** | Locate Missing Files |
| `NO_COMPATIBLE_GPU` | GPU compute requested for Cycles, but no compatible GPU devices were detected. | `warning` | **No** | Switch to CPU |
| `LOW_DISK_SPACE` | Free disk space on the output volume is below the configured threshold (default 1024 MB). | `warning` | **No** | None |
| `WINDOWS_LONG_PATH` | Output path exceeds 250 characters on Windows. | `warning` | **No** | None |

---

## 4. Asset Relevance: Used vs. Unused vs. Unknown

When scanning external assets (textures, libraries, sounds, caches, VDBs, alembics), `inspect_blend.py` evaluates whether each missing asset is actually reachable by the render pipeline.

### 4.1. Reachability Rules
An asset is classified as **`used`** if it meets any of the following criteria:
1. **Materials on Renderable Objects**:
   - The object is present in the selected scene.
   - The object is not hidden from render (`hide_render == False`).
   - The object's parent collection is not excluded from the active view layer.
   - The asset is referenced by a node in the object's active material node tree (or nested node groups), such as `ShaderNodeTexImage` or `ShaderNodeTexEnvironment`.
2. **World Environment**:
   - The asset is referenced by the active `scene.world.node_tree`.
3. **Compositor**:
   - Compositing is enabled (`scene.render.use_compositing` or `scene.use_nodes == True`) and the asset is referenced in the compositor node tree (`CompositorNodeImage`).
4. **Sequencer**:
   - Sequencer is enabled (`scene.render.use_sequencer == True`), a `sequence_editor` exists, and an image or sound strip references the asset.
5. **Modifiers & Geometry Nodes**:
   - Modifiers on renderable objects (e.g. Displacement, Geometry Nodes) referencing image or cache datablocks.
6. **Linked Libraries**:
   - A linked `.blend` library is `used` only if datablocks linked from it are actively referenced by renderable objects or scenes (evaluated via `bpy.data.user_map`).

### 4.2. Reporting Semantics
- **`used` or `unknown`**: Emits a `MISSING_ASSETS` warning with details.
- **`unused`**: Does **NOT** produce a warning. Unused missing files are aggregated into an informational count (`unusedMissingCount`, e.g. "12 unused missing files") accessible under a collapsed details section.

---

## 5. Pre-Flight Modes & Execution Policy

Render Night provides three queue execution modes:

### 5.1. `never_block` (DEFAULT)
- When the user or an automation triggers "Start Queue", execution commences **immediately**.
- Pre-flight checks run asynchronously and log any detected warnings to the queue log.
- **No modal or confirmation dialog ever interrupts execution.**

### 5.2. `ask`
- If warnings exist, a **non-modal top banner** displays the warning summary with a "Render anyway" button.
- An **auto-continue countdown timer** (default 30 seconds, user-configurable) is displayed.
- If the user takes no action before the countdown reaches zero, the queue **automatically starts**. Unattended queues never stay blocked.

### 5.3. `strict`
- Opt-in policy for production environments that demand zero warnings.
- The queue will not proceed if any error or warning exists without explicit user dismissal.

---

## 6. Warning Suppression (Per-Job & Global)

Every warning supports granular dismissal, persisted within the queue state:
1. **Ignore (`ignore`)**: Suppresses a specific issue instance by ID on that job.
2. **Ignore All Like This (`ignore_code`)**: Suppresses all issues sharing the same warning code (e.g. `MISSING_ASSETS`) on that job.
3. **Ignore All Warnings (`ignoreAllWarnings: true`)**: A per-job toggle that bypasses all warnings for that job.

---

## 7. Inspection Failure & "Basic Mode"

If Blender inspection times out, crashes, or fails to parse RNA properties:
- The job is **NEVER** marked with a `Failed` status.
- The job status remains `Queued`.
- The job enters **Basic Mode** (`isBasicMode: true`):
  - Overrides and custom RNA controls are disabled with a clear explanation (`basicModeReason`).
  - The job renders using the `.blend` file's internal saved settings.
  - The UI displays an unobtrusive "Basic mode" badge.

---

## 8. Render Semantics & Frame Success

- **Console Error Lines**: Error lines in Blender's stdout/stderr (e.g., Python warnings, missing texture notices) are highlighted in the log viewer but **never abort the render** on their own.
- **Frame Success Condition**:
  - **Image Renders**: A frame is considered successful if and only if its expected output file exists on disk and has a file size greater than zero bytes (`size > 0`).
  - **Video Renders**: The render is considered successful if the output file exists and is non-empty, or the Blender animation process exited with return code `0`.
- **Job Result States**:
  - `Completed`: All frames were rendered with zero failed frames and zero warnings.
  - `Completed with warnings`: All frames were rendered, but pre-flight warnings or non-fatal runtime warnings occurred.
  - `Completed with errors`: The render completed with $N$ failed frames ($0 < \text{completed} < \text{total}$).
  - `Failed`: Zero frames were produced ($\text{completed} === 0$).

---

## 9. In-Memory Asset Helpers

To fix asset paths without violating the hard rule of never saving the `.blend` file:
1. **Locate Missing Files**: Searches a user-selected folder recursively for files matching the basenames of missing assets. Mappings are stored in `job.missingPathRemaps` (`{ oldPath: newPath }`).
2. **In-Memory Remapping**: When launching `render_runner.py`, the runner reassigns `img.filepath` and `lib.filepath` in memory before rendering. `bpy.ops.wm.save_mainfile` is **NEVER** called.
3. **Make Paths Absolute**: Evaluates `//` relative prefixes against the `.blend` directory in memory.

---

## 10. CLI Specification

The `night-render` headless CLI adheres to the same rules:
- **Default Behavior**: Never blocks on warnings. Warnings are printed to `stderr` with a warning marker, and queue execution begins immediately.
- **Flags**:
  - `--strict`: Opts into strict mode; halts with exit code `1` if any pre-flight warning or error is detected.
  - `--fail-on-warning`: If set, any unignored warning results in exit code `1` upon queue completion. Without this flag, warnings do not affect the exit code.
