# Known Limitations & Design Boundaries

This document comprehensively records all known technical limitations, design boundaries, and architectural trade-offs in Render Night across all phases.

---

## 1. EXR and HDR Floating-Point Previews in Live Monitor
- **Limitation**: 32-bit floating-point OpenEXR (`.exr`) image files cannot be decoded natively by Chromium's graphics pipeline without full OpenEXR WebAssembly decoders or tonemapping pipelines.
- **Behavior**: In the live monitor dock, standard formats (PNG, JPEG, WEBP, BMP, TGA) display real-time rendered frame previews. For EXR renders, an informational badge and placeholder are displayed, while the Sequence Tools tab generates cached 8-bit PNG proxies via FFmpeg.
- **Rationale**: Keeps the Electron UI lightweight and eliminates memory bloat from multi-megabyte 32-bit float buffers in the renderer process.

---

## 2. Video Container Pause Semantics
- **Limitation**: Per-frame pausing cannot be performed during active FFmpeg / AVI video container rendering.
- **Behavior**: Video formats render through Blender's internal animation pipeline (`render(animation=True)`). If the user clicks Pause while a video job is rendering, Render Night displays **"Pause After Job"** and pauses the queue as soon as the current video container finishes encoding.
- **Rationale**: Blender's internal video container muxers cannot be halted and resumed mid-stream without corrupting container headers and index tables.

---

## 3. Image vs. Video Range Rule
- **Limitation**: Discontinuous multi-ranges (e.g. `1-50, 75, 120-240x2`), stepped skips (`step > 1`), and Single Still frame modes cannot be combined with video container formats.
- **Behavior**: Pre-flight checks and the UI card strictly flag video jobs with discontinuous ranges as an error (`VIDEO_RANGE_RULE_VIOLATION`) and provide a one-click quick fix to switch to a continuous sequential range.
- **Rationale**: FFmpeg and video containers require unbroken, sequential frame streams to compute temporal compression (P-frames and B-frames). Discontinuous ranges are only valid for individual image sequence outputs.

---

## 4. Blender Crash Recovery & Process Lifecycle
- **Limitation**: When a Blender background process crashes (e.g., CUDA / OptiX out of memory, GPU driver hang, or unhandled segmentation fault), the operating system terminates the process.
- **Behavior**: True in-process state recovery is impossible because the process is dead. Render Night implements crash recovery by relaunching Blender afresh, reloading the `.blend` file into memory (never modifying or saving the file on disk), retrying the failed frame, optionally falling back to CPU for that frame, and continuing with the remaining frames in the queue.
- **Rationale**: Guarantees system stability and avoids corrupting Blender process heaps or GPU contexts.

---

## 5. Single-Machine, Single-Job Queue Model
- **Limitation**: Render Night runs exactly one Blender background worker process at a time.
- **Behavior**: Jobs in the queue are executed sequentially. Splitting a single job across multiple parallel Blender processes on the same machine is an explicit non-goal.
- **Rationale**: 3D rendering heavily saturates GPU VRAM and CPU thread capacity. Running parallel render workers on a single workstation causes GPU memory swapping, thermal throttling, and severe performance degradation.

---

## 6. Non-Goals: Cloud, Network, & Auto-Update
- **Non-Goals**:
  - Network and cloud rendering across multiple remote machines.
  - Third-party chat notifications (Discord webhooks, Telegram bots, email alerts).
  - Background auto-update daemons.
  - Blender UI add-on.
- **Behavior**: Render Night is exclusively a fast local queue tool. The only alert mechanism is the signature synthesized "to-DUNG" audio chime and the terminal bell (`\x07`) in CLI mode.

---

## 7. macOS Unsigned Gatekeeper Prompt
- **Limitation**: Alpha distribution binaries on macOS are currently unsigned (`hardenedRuntime: false`, `identity: null`).
- **Behavior**: On first launch, macOS Gatekeeper blocks execution with an untrusted developer prompt.
- **Workaround**: Users must right-click `Render Night.app` in Finder, select **Open**, and confirm the dialog once.

---

## 8. Pre-Render Hook Execution Scope
- **Limitation**: Pre-render Python hooks run arbitrary Python code within Blender's runtime environment.
- **Behavior**: Marked explicitly in the UI as **Advanced / Trusted Code Only**. Render Night executes the hook before starting the render range; any runtime exceptions raised by the hook immediately halt the job and report the error.
