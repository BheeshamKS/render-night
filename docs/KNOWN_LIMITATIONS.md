# Known Limitations

- GUI preview of renders inside Render Night is displayed in the live monitor dock for standard image formats (PNG, JPEG, WEBP). For EXR files, a placeholder is displayed because 32-bit floating point EXR decoding is not natively supported in Chromium without full OpenEXR WASM decoders.
- For FFmpeg video container output jobs, per-frame pause is not possible due to video stream muxing constraints. The queue engine instead supports "Pause After Current Job" for video outputs.
- macOS releases are unsigned; users must right-click and choose Open on first launch.
