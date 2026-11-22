# Known Limitations & Design Boundaries

This document comprehensively records all known technical limitations, design boundaries, and architectural trade-offs in Render Night's pure-Rust architecture.

---

## 1. EXR and HDR Floating-Point Previews in Viewport & Sequence Player
- **Architecture**: In the Rust desktop app (`rn-app`), OpenEXR (`.exr`) image files are decoded natively off the main thread using the `exr` crate with custom multithreaded raster scanline reading and sRGB tonemapping.
- **Behavior**: Direct OpenEXR decoding at 4K resolution can require significant memory bandwidth (30–60 MB per frame in memory). When playback drop rate exceeds 5% for more than 2 seconds, the `ProxyManager` automatically transcodes an intra-frame H.264 proxy (GOP 1) with sRGB tonemapping to maintain smooth 24–60 FPS playback.
- **Rationale**: Keeps RAM consumption bounded within the configured LRU cache budget (default 4 GB / 40% free RAM) without dropping playback frames.

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

## 7. macOS Ad-Hoc Code Signing & Gatekeeper
- **Limitation**: Release binaries for macOS are built with ad-hoc signatures.
- **Behavior**: On first launch, macOS Gatekeeper requires user authorization.
- **Workaround**: Users right-click `Render Night.app` in `/Applications`, select **Open**, and confirm once.

---

## 8. Pre-Render Hook Execution Scope
- **Limitation**: Pre-render Python hooks run arbitrary Python code within Blender's runtime environment.
- **Behavior**: Marked explicitly in the UI as **Advanced / Trusted Code Only**. Render Night executes the hook before starting the render range; any runtime exceptions raised by the hook immediately halt the job and report the error.
