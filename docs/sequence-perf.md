# Sequence Player Performance Profile

## Benchmark Environment
- OS: Linux (x86_64)
- Test Display: 1280x800, 60 Hz
- Test Sequences:
  - 1080p PNG: 250 frames @ 24 fps (1920x1080)
  - 4K PNG: 250 frames @ 24 fps (3840x2160)
  - 1080p JPEG: 250 frames @ 30 fps (1920x1080)
  - 1080p EXR: 100 frames @ 24 fps (1920x1080)

## BEFORE (Baseline: `setInterval` + `<img>` src swap on main thread)

| Sequence | Target FPS | Achieved FPS | Dropped / Lagged Frames | Long Tasks (>50ms) | Max Long Task | Avg Load + Decode |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1080p PNG (250f @ 24fps)** | 24 | 9.49 | 58 | 0 (0 ms) | 0 ms | 1.53 ms |
| **4K PNG (250f @ 24fps)** | 24 | 19.7 | 17 | 33 (3840 ms) | 237 ms | 30.05 ms |
| **1080p JPEG (250f @ 30fps)** | 30 | 70.98 | 0 | 0 (0 ms) | 0 ms | 2.35 ms |
| **1080p EXR (100f @ 24fps)** | 24 | 1 | 69 | 0 (0 ms) | 0 ms | 5.6 ms |

### Root Cause Analysis of Baseline
1. **Timer Drift & Main-Thread Blocking**: The baseline player relies on `setInterval`. Each tick triggers a React state update (`setCurrentFrame`), an `<img>` DOM `src` mutation, and synchronous image decoding on Chromium's main thread.
2. **Slideshow on High-Resolution / Uncompressed Media**:
   - 4K PNGs require heavy main-thread decoding, freezing the UI and causing severe frame skips.
   - EXR files trigger on-demand proxy generation and IPC roundtrips per frame, stalling playback completely.
3. **No Read-Ahead or Memory Budgeting**: Frames are requested just-in-time, meaning disk I/O and CPU decompression reside directly on the critical animation path.
