# Third-Party Licenses and Notices

Render Night integrates and interacts with third-party software and libraries. This document outlines relevant licensing terms, source code attribution, and compliance requirements.

---

## FFmpeg

Render Night utilizes [FFmpeg](https://ffmpeg.org/) for image sequence inspection, proxy generation, and video stitching (e.g. converting image sequences to MP4, WebM, and ProRes).

### Licensing Terms

- FFmpeg is an open-source multimedia framework licensed under the **GNU Lesser General Public License (LGPL) version 2.1 or later**, or the **GNU General Public License (GPL) version 2 or later** depending on configuration and enabled external libraries.
- Render Night does not statically or dynamically link proprietary code into FFmpeg. Instead, FFmpeg is executed strictly as an independent external process via standard command-line process invocation (`child_process.spawn` / `child_process.execFile`).
- Render Night dynamically discovers FFmpeg through:
  1. A user-selected custom binary path configured in preferences.
  2. The system `PATH` environment variable (`which ffmpeg` / `where.exe ffmpeg`).
  3. A fallback binary provided by the `ffmpeg-static` npm package.
- Users can replace the FFmpeg binary at any time by specifying a custom binary path or installing their own build into their system `PATH`.
- For more information on FFmpeg licensing and to obtain FFmpeg source code, visit [https://ffmpeg.org/legal.html](https://ffmpeg.org/legal.html).

---

## Blender

Render Night launches and coordinates local [Blender](https://www.blender.org/) instances in headless background mode (`blender -b`). Blender is licensed under the **GNU General Public License (GPL) version 3 or later**. Render Night does not bundle Blender, does not modify Blender binaries, and communicates with Blender solely via command-line arguments and standard input/output streams.
