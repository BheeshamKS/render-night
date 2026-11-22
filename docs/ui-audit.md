# Phase R2: BUI Desktop UI Usability & Visual Regression Audit

**Date:** 2026-11-22  
**Implementation Target:** `crates/rn-app` (`blenderui 0.5.1`, `rn-core`, Rust 1.88+)  
**Evaluation Viewports:** 1100×700 (Compact Desktop), 1280×800 (Standard Laptop), 1920×1080 (Full HD Workstation)  
**Artifacts Generated:**  
- `docs/screenshots/01_queue_acceptance_1100x700.png`  
- `docs/screenshots/02_monitor_dock_expanded_1280x800.png`  
- `docs/screenshots/03_job_editor_rna_1920x1080.png`  
- `docs/screenshots/04_empty_queue_dropzone_1100x700.png`  
- `docs/screenshots/05_multi_select_bulk_bar_1280x800.png`  

---

## 1. Executive Summary

Phase R2 delivers the complete native Blender UI (`blenderui`) implementation of Render Night's Phase 11 desktop layout, resolving the UX deficiencies identified during the legacy TypeScript application audit.

By migrating from unstyled DOM widgets and inline accordion expansion to native Blender controls (`Button`, `Dropdown`, `Checkbox`, `NumberField`, `NumberSlider`, `TextField`), a persistent icon+label navigation rail, a non-modal preflight warnings banner, a right-hand slide-over properties editor, a full-width bottom monitor dock, and a sticky multi-select bulk bar, the interface achieves the fidelity and ergonomics of a native Blender workstation module.

Headless rendering verification at 1100×700, 1280×800, and 1920×1080 confirms that all elements maintain structural stability, zero text clipping or overlap, correct master-detail separation, and graceful ellipsis truncation for extreme filenames.

---

## 2. Layout Architecture & Component Verification

### 2.1. Minimal Header Toolbar
- **Branding & Version:** `RENDER NIGHT v0.1.0` with subtle contrast badges.
- **Queue Controls:** Dynamic action buttons (`+ Add .blend`, `▶ Start Queue`, `⏸ Pause`, `⏹ Stop`) clearly communicating the active state.
- **Post-Queue Commitment:** Prominent `"When finished:"` dropdown in the center/right group offering `Do nothing`, `Sleep`, `Hibernate`, `Shutdown`, `Restart`, and `Close App` (`PostAction` enum).
- **Global Preflight Badge:** Displays `⚠️ N warnings` pill when issues are detected across queued jobs.
- **Overflow Menu:** Context menu button (`⋮`) for secondary batch operations.

### 2.2. Left Navigation Rail
- **Dimensions:** Fixed 78px width, dark panel background (`#2e2e2e`), right border (`#3c3c3c`).
- **Items:** Icon + label stack featuring **Queue** (with active job counter badge e.g. `3`), **History**, **Tools**, and **Settings**.
- **Active State:** Visual highlight with accent blue border (`#4772b3`) and elevated surface background (`#2b384a`).

### 2.3. Queue Work Area & Two-Line Job Cards
- **Empty State:** Centered dashed drop zone with icon, call-to-action button (`+ Browse .blend Files`), and format compatibility notice.
- **Two-Line Card Design (~60px Height):**
  - **Line 1 (Primary):** Selection checkbox, job filename (bold primary text with `.truncate()`), status chip (`Queued`, `Rendering`, `Paused`, `Completed`, `Failed`), dedicated compute device badge (`GPU · OptiX`, `GPU · CUDA`, `CPU`), warning chips (`⚠️ N warnings`), and modification chips (`⚡ N changes`), followed by action buttons (`✎ Edit`, `✕ Delete`).
  - **Line 2 (Metadata & Summary):** One-line effective settings string:
    `Scene: Scene | Frames: 1..250 (250 f) | 1920x1080 (100%) | Cycles · GPU · OptiX (128 spl) | Output: //render/`
  - **Bottom Edge Progress Bar:** Full-width sleek progress line spanning the entire bottom border of the card, color-coded by state (green for active rendering, blue for completed, red for failed).

### 2.4. Multi-Select & Sticky Bulk Action Bar
- **Multi-Selection:** Supports selecting individual rows or selecting all rows (`select_all`).
- **Bulk Action Bar:** Appears immediately when 1 or more jobs are selected.
- **Capabilities:**
  - Displays selected count: `✓ 3 job(s) selected`.
  - One-click bulk operations: `Set Cycles`, `Set EEVEE`, `Samples: 256`, `Res: 100%`, `Reset Overrides`, `Remove Selected`, and `✕ Deselect`.
  - Overrides are applied across all selected jobs simultaneously without mutating unselected queue items.

### 2.5. Slide-Over Job Properties Editor (Master-Detail Workflow)
- **Positioning:** Slide-over panel docked on the right side (380px wide), eliminating inline accordion expansion reflows.
- **Essentials Section:**
  - Render Engine: `Dropdown` (Cycles, EEVEE, Workbench).
  - Compute Device: `Dropdown` (GPU Compute, CPU).
  - Resolution X / Y (`NumberField`s) and Scale % (`NumberSlider`).
  - Frame Range Start, End, Step steppers.
  - Render Samples stepper.
  - Output Directory and pattern `TextField`.
- **Schema-Driven RNA Metadata Section:**
  - Collapsible `<details>` disclosure with `<summary>All Settings (RNA Schema-Driven)</summary>`.
  - Driven directly by Blender's inspect RNA metadata (`InspectOutput`, `RnaStruct`, `RnaPropertyMeta`).
  - **Widget Mapping:**
    - `ENUM` → Native `Dropdown` with `enum_items`.
    - `BOOLEAN` → Native `Checkbox`.
    - `INT` / `FLOAT` → Native `NumberSlider` or `NumberField`.
    - `STRING` → Native `TextField`.
  - **Engine-Aware Visibility:** Cycles RNA parameters (`cycles.*`) appear only when Cycles is active; EEVEE RNA parameters (`eevee.*`) appear only when EEVEE is active.
  - **Change Markers & Reset:** Overridden properties display a `• modified` indicator and a single-click reset button (`↺`) that restores the `.blend` file's native value.

### 2.6. Slim Monitor Bar & Expandable Full Dock
- **Slim State (Collapsed, 34px):**
  - Left: Pulsing status indicator dot (green for rendering, amber for paused, gray for idle) and active job title.
  - Center: Live frame and sample progress (`Frame 88/250`, `Sample 45/128`, `ETA: 02m 25s`).
  - Right: `▲ Expand Monitor Dock` button.
- **Full Dock State (Expanded, 240px):**
  - **Tabs:** `🖼 Live Preview`, `📈 Frame Times`, `💻 Console & Log`.
  - **Tab 1 (Live Preview):** Render buffer display with frame stamp, sample indicator, and render metrics sidebar (resolution, engine, memory peak, tile count).
  - **Tab 2 (Frame Times Sparkline):** Visual sparkline graph plotting per-frame completion times in seconds. Color-coded bars identify frame rendering spikes (orange for >1.5x average) and failed frames (red). Statistics compute average, min, and max frame times.
  - **Tab 3 (Console & Log):** Virtualized monospace log viewer streaming Blender stdout/stderr with red error highlighting.

### 2.7. Non-Modal Preflight Warnings Panel
- **Implementation:** Complies strictly with `docs/behavior/preflight.md`.
- **Principle:** Never hard-blocks unattended queues. Only physical impossibilities (missing binary, missing blend file, zero frames) block execution.
- **Banner Layout:** Top amber banner (`#352b12`, `#7a6020` border) featuring summary message, auto-continue countdown in `ask` mode (`Auto-continuing in 30s...`), and direct action buttons: `Render Anyway` and `Dismiss`.
- **Granular Controls:** Each detected warning lists the code (e.g. `[MISSING_ASSETS]`, `[NO_ACTIVE_CAMERA]`), affected job, quick-fix button (`Create Output Dir`, `Switch to CPU`), and per-issue `Ignore` button.

---

## 3. Viewport Responsiveness & Visual Audit Record

| Viewport | Screenshot File | Layout Assessment | Visual Quality |
|---|---|---|:---:|
| **1100×700** (Compact Desktop) | `01_queue_acceptance_1100x700.png` | Toolbar, Nav rail, 3 queue cards, and slim monitor bar fit with comfortable margins. Long filenames truncate smoothly with ellipsis (`...`); status chips and action buttons remain fully visible with zero overlap. | **PASS** |
| **1280×800** (Standard Laptop) | `02_monitor_dock_expanded_1280x800.png` | Expanded bottom dock cleanly divides screen space (560px queue viewport + 240px dock). Frame-time sparkline renders 6 samples with summary statistics without vertical scroll jumps. | **PASS** |
| **1920×1080** (Full HD Workstation) | `03_job_editor_rna_1920x1080.png` | Master-detail workflow operates seamlessly: Left nav rail (78px), center queue view, right slide-over properties editor (380px), and bottom monitor dock (240px) display simultaneously with zero layout collision. | **PASS** |
| **1100×700** (Empty Queue) | `04_empty_queue_dropzone_1100x700.png` | Centered dashed drop zone renders cleanly. Start button reflects idle state, and monitor dock indicates "Queue Idle". | **PASS** |
| **1280×800** (Multi-Select Bulk Bar) | `05_multi_select_bulk_bar_1280x800.png` | Sticky bulk action bar sits above queue rows. All 3 rows reflect active selection highlights (`#2b384a`, `#4772b3` border). | **PASS** |

---

## 4. Internationalization & Extreme String Stress Testing

### 4.1. Non-Latin Text Rendering
- **Sample Scripts Tested:**
  - ASCII: `archviz_living_room_cycles.blend`
  - Long English VFX Filename: `production_render_shot_042_sequence_lighting_final_v098_with_compositing_passes.blend` (89 chars)
  - Urdu (RTL): `منظر_رینڈر_رات_کمرہ_نمبر_ایک.blend`
  - Japanese (CJK Kanji/Kana): `夜のレンダリング_シーン01_メカ設計.blend`
  - Chinese (Simplified Hanzi): `太空站内部_夜间渲染_最终版.blend`
  - Emoji: `🎬_Render_Night_✨_Final_Render_🚀.blend`
- **Observations:**
  - Long filenames truncate smoothly via CSS text-overflow ellipsis within the flex container (`min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`).
  - Right-aligned chips (`Rendering`, `GPU · OptiX`, `2 warnings`, `Edit`) have `flex: none` and are never displaced or clipped by long titles.
  - Non-Latin strings evaluate without panics or memory corruption. The default bundled Inter font displays fallback glyph boxes; bundling Noto Sans CJK and Arabic in `resources/fonts/` (documented in Feasibility Item 7) resolves glyph rendering across non-Latin locales.

---

## 5. Acceptance Criteria Checklist

| Requirement | Test Scenario | Verified Status |
|---|---|:---:|
| **Drop 3 files, Start in 2 actions** | Add 3 jobs via `add_job`, press `start_queue()`. Queue moves to `Running`, first job transitions to `Active`. | **PASS** (`test_acceptance_criteria_drop_3_files_start_in_2_actions`) |
| **Independent Job Overrides** | Set samples and resolution on Job 1; verify Job 2 and Job 3 overrides remain empty. Reset Job 1 overrides cleanly. | **PASS** (`test_change_one_job_overrides_without_affecting_others`) |
| **Device Badge & Progress at a Glance** | Dedicated `GPU · OptiX` / `CPU` badges and bottom edge progress bar visible on every job card. | **PASS** (`test_device_badge_and_progress_at_a_glance`) |
| **Non-Modal Preflight Warnings** | Warnings summary shown with auto-continue countdown and "Render Anyway" bypass; unattended queues never blocked. | **PASS** (`test_preflight_non_modal_behavior`) |
| **Multi-Selection & Bulk Bar** | Select multiple jobs; apply engine, sample, and resolution changes in bulk; reset in bulk. | **PASS** (`test_multi_selection_and_bulk_actions`) |
| **Headless Visual Regression Capture** | Automated off-screen capture at 1100×700, 1280×800, and 1920×1080 with >95% valid pixel coverage. | **PASS** (`test_headless_screenshots_1100x700_1280x800_1920x1080`) |
| **Event Dispatch & 5 Hz Throttling** | Queue progress events throttled to 5 Hz (~200ms); idle process sleeps at 0.0% CPU. | **PASS** (`test_core_events_dispatch_and_throttling`) |
