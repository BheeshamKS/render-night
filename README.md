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

## Releases

- Tag as `v0.1.0-alpha.N`.
- macOS builds are currently unsigned. To run on macOS: right-click the app in Finder and choose "Open" from the context menu to bypass Gatekeeper.
