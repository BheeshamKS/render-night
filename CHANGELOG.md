# Changelog

All notable changes to Render Night are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-alpha.1] - 2026-11-11

Initial Alpha Release of Render Night: a fast local render queue for Blender.

### Added
- **Core Architecture & Blender Discovery:**
  - Fast headless discovery of Blender installations across Windows, macOS, Linux, Steam, Flatpak, and Snap.
  - Semver comparison and automatic detection of Blender 3.6 LTS, 4.2 LTS, 4.x, and 5.x.
  - Zero-GUI RNA property extraction and custom `.blend` header byte reader without modifying or saving files on disk.
- **Process Control & Live Monitor:**
  - One isolated Blender process per render job with structured event streaming (`RN_EVENT`) and native stdout parsing (Fra, Mem, Time, Remaining, Sample, Saved).
  - Live monitor dock with rolling ETA, peak memory tracker, elapsed timer, and image thumbnail previews.
  - Per-frame pause/resume sentinel channel for image sequence jobs, and "Pause After Job" for video jobs.
  - System sleep blocker (`powerSaveBlocker`) holding active lock during renders and scheduled waiting.
- **Frame Ranges & Image-vs-Video Rules:**
  - Range modes: Scene Default, Simple, Custom, and Single Still.
  - Custom multi-range parser with automatic deduplication, sorting, and step evaluation (e.g. `1-50, 75, 120-240x2`).
  - Strict continuous sequential range validation for video container formats (FFmpeg, AVI).
  - "Render Missing Frames Only" toggle to skip existing rendered outputs on disk.
- **Crash Recovery & Persistence:**
  - Transparent crash recovery relaunching Blender into memory without modifying files, retrying failed frames, optional CPU fallback, and frame-skipping failure isolation.
  - Atomic queue state persistence (`writeAtomicJson`) to app data directory.
  - Session lock manager (`unclean-shutdown.lock`) and orphaned worker PID cleanup on launch.
  - Safe resume banner prompting to continue unfinished queues from the first missing frame.
- **Safe Post-Queue Actions:**
  - OS actions: Do Nothing, Sleep, Hibernate, Shutdown, Restart, and Close Night Render across Windows, macOS, and Linux.
  - Hard safety rule: Executes only after graceful queue completion inside a live session with an interactive 60-second cancel countdown. Never triggers on crash or restored session.
- **Audio Feedback & Notifications:**
  - Deterministically synthesized "to-DUNG" completion sound (low thump + inharmonic bell hit normalized to -1 dBFS).
  - Background throttling disabled so audio plays when minimized.
  - Mute toggle, volume slider, failure alert sound option, and test button.
- **Render History & Scheduling:**
  - Append-only JSON history store recording blend path, scenes, cameras, frames, duration, compute devices, and results.
  - One-shot overnight scheduler ("Start queue at HH:MM") with sleep prevention.
- **Advanced Drawer, Diff Overrides & Presets:**
  - Schema-driven property drawer with 30+ pinned controls (Cycles, EEVEE, EEVEE-Next, Workbench) and full All Properties tree.
  - Override diff model (`{ rnaPath: value }`) storing modifications against file defaults with reset buttons and copy/paste validation.
  - Production presets (Draft Cycles, Final Cycles, EEVEE Fast Preview, Print 300 DPI) and custom preset store.
- **Pre-flight Validation & Job Tools:**
  - Pre-render checker detecting missing assets, unwritable paths, low disk space, missing cameras, newer file versions, and video range violations.
  - One-click quick fixes (e.g., switch range to continuous, switch device to CPU).
  - Job duplication, "Render all cameras", "Render all scenes", "Open in Blender", and advanced pre-render Python hooks.
- **Image Sequence Tools:**
  - Sequence viewer tab with timeline scrubber, fps selector, missing frame gap warnings, and native image display.
  - Image sequence converter to MP4 (H.264/H.265), WebM, and ProRes with crop, resolution, quality, and audio input.
  - "Stitch to MP4 when finished" post-render step.
- **Headless CLI (`night-render`):**
  - Standalone CLI entry sharing `src/core` with zero Electron dependency.
  - Commands: `night-render --queue queue.json`, `night-render inspect <file.blend>`, `night-render list-blenders`.
  - Terminal progress line, terminal bell (`\x07`), dry-run mode, and exit codes (`0`, `1`, `2`).
  - Bundled with esbuild into `dist-cli/night-render.cjs`.
- **Packaging & CI/CD:**
  - Multi-platform packaging targets: Windows (NSIS + Portable), macOS DMG (arm64 + x64), Linux (AppImage + deb).
  - Linux desktop entry and categories under `Graphics`.
  - App icons in PNG, ICO, and ICNS formats.
  - GitHub Actions matrix workflow building release artifacts and draft releases on tag push.
