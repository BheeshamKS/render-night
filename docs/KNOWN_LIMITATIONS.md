# Known Limitations

- GUI preview of renders inside Render Night is displayed in the live monitor dock for standard image formats (PNG, JPEG, WEBP). For EXR files, a placeholder is displayed because 32-bit floating point EXR decoding is not natively supported in Chromium without full OpenEXR WASM decoders.
- For FFmpeg video container output jobs, per-frame pause is not possible due to video stream muxing constraints. The queue engine instead supports "Pause After Current Job" for video outputs.
- Video container formats (FFmpeg, AVI) require continuous sequential frame rendering (`step: 1`). Custom discontinuous ranges, stepped skipping (`step > 1`), and single still frames are not supported for video formats. The UI validates and enforces continuous ranges.
- Blender crash recovery: When a Blender process crashes (e.g. GPU CUDA/OptiX out of memory or unhandled segmentation fault), the operating system terminates the process. Resuming means relaunching Blender afresh, reloading the file into memory without saving, and rendering the remaining frames. Render Night manages this transparently with configurable retries, CPU fallback, and frame-skipping policies.
- macOS releases are unsigned; users must right-click and choose Open on first launch.
