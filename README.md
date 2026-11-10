# Render Night

A fast local render queue for Blender.

## Development

- `npm install`
- `npm run dev`

## Build

- `npm run dist`

## Features

- **Blender Discovery**: Automatically detects Blender installations across Windows, macOS, Linux, Steam, Flatpak, and custom binaries.
- **Background Inspection**: Zero GUI inspection via RNA property extraction and custom header reading without saving the file.
- **Frame Ranges**:
  - `Scene Default`: Automatically uses inspected scene frame boundaries and step.
  - `Simple`: User-defined start, end, and step.
  - `Custom`: Comma-separated expressions (e.g. `50-200, 200-300`, `1-50, 75, 120-240x2`) with deduplication, ascending sort, and live frame counting.
  - `Single Still`: Single frame rendering.
- **Image vs Video Rule**: Continuous sequential frame ranges are strictly enforced for video formats (FFmpeg, AVI), while custom multi-ranges and discontinuous frame sets are supported for image sequences.
- **Missing Frames Only**: Scans target destination directory to skip existing frames on disk before rendering.
- **Crash Recovery**: When Blender crashes (e.g. GPU out of memory), Render Night automatically relaunches Blender, reloads the file in memory, retries the failed frame, optionally falls back to CPU, and continues rendering subsequent frames with failure tracking and single-click retry.
- **Live Monitor**: Bottom dock with rolling ETA, peak memory tracking, elapsed time, progress bar, and thumbnail preview.
- **Sleep Prevention**: System sleep blocker (`powerSaveBlocker`) prevents sleep during queue rendering.
- **Persistence & Crash Restore**: Atomic state persistence (`writeAtomicJson`) to app data directory. Tracks sessions with an unclean-shutdown marker (`unclean-shutdown.lock`). On launch after crash or force-close, orphaned Blender worker PIDs are cleaned up, and a prompt allows resuming the queue from the first unfinished frame using missing-frames scanning while keeping subsequent queue jobs intact. Normal quit during render prompts "Stop render and quit?", cleanly kills Blender, and saves state as resumable.
- **Safe Post-Queue Actions**: Dropdown selectable before start: Do Nothing, Sleep, Hibernate, Shutdown, Restart, Close Night Render. **Hard Safety Rule**: Executes ONLY after the queue completes gracefully inside a live session, preceded by a visible 60-second cancel countdown. Crashes, kills, or restored sessions NEVER trigger it.
- **Finish Sound ("to-DUNG")**: Deterministically synthesized audio ("to" low thump + "dung" inharmonic bell hit normalised to -1 dBFS). Plays on job completion, with volume slider, test button, mute toggle, and optional "play on failure" setting. Background throttling disabled so sound plays even when minimized.
- **Render History**: Append-only JSON history store with automatic rotation. Records blend file, scene, camera, frame count, total time, average frame time, engine, device ACTUALLY used (e.g. `GPU: NVIDIA GeForce RTX 3060 (OPTIX)` or `CPU`), result, failed frames, and output folder. History modal includes search, filters, "Re-add to queue", and "Open output folder".
- **One-Shot Scheduling**: "Start queue at HH:MM" with optional sleep blocker while waiting.

## Releases

- Tag as `v0.1.0-alpha.N`.
- macOS builds are currently unsigned. To run on macOS: right-click the app in Finder and choose "Open" from the context menu to bypass Gatekeeper.
