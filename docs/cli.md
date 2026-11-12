# Headless CLI (`night-render`)

`night-render` is a standalone, headless CLI for Render Night. It shares `src/core` with the desktop application and has **ZERO Electron dependencies**.

---

## Installation

### From Source / Local Repository
```bash
# Build the CLI bundle
npm run build:cli

# Link globally (optional)
npm link
```

### Direct Invocation
```bash
# Using node
node dist-cli/night-render.cjs --help

# Or using npx
npx night-render --queue queue.json
```

---

## Commands & Usage

### 1. Run Queue
```bash
night-render --queue <queue.json> [options]
```
> **Tip:** You can export queues directly from the Render Night desktop app via `Ctrl+Shift+S` or the Toolbar menu ("Export Queue..."). These exported `.rnqueue.json` files can be passed directly to `night-render --queue`.

**Options:**
- `--blender <path|version|latest>`: Choose Blender executable. Accepts:
  - `latest`: Automatically chooses the highest installed Blender version.
  - `4.2` or `3.6`: Chooses the best matching installed version.
  - `/path/to/blender` or `C:\...\blender.exe`: Direct path to executable.
- `--post-action <none|sleep|hibernate|shutdown|restart|quit>`: OS action after queue finishes.
- `--resume`: Relaunches and resumes an unfinished queue from the first missing frame.
- `--preset <name>`: Applies a global render preset to all jobs in the queue.
- `--dry-run`: Validates `queue.json`, runs pre-flight validation checks, and prints the summary without spawning Blender.

### 2. Inspect Blend File
```bash
night-render inspect <path/to/file.blend> [--blender <path|version|latest>]
```
Inspects scenes, cameras, frame ranges, render engines, and missing assets, printing JSON to stdout.

### 3. List Installed Blenders
```bash
night-render list-blenders
```
Discovers and lists all local Blender installations with version numbers and paths.

---

## `queue.json` Specification

`queue.json` is validated with Zod and supports the same properties, diff overrides, and range expressions as the desktop UI:

```json
{
  "blender": "latest",
  "postAction": "sleep",
  "jobs": [
    {
      "blendPath": "/projects/shot_01.blend",
      "scene": "Scene",
      "camera": "Camera_Main",
      "range": "1-100",
      "overrides": {
        "scene.cycles.samples": 256,
        "scene.render.resolution_percentage": 100
      },
      "renderMissingOnly": true,
      "stitchToMp4": true,
      "crashPolicy": {
        "maxRetries": 3,
        "consecutiveCrashLimit": 2,
        "fallbackCpu": true,
        "skipOnFailure": false
      }
    },
    {
      "blendPath": "/projects/shot_02.blend",
      "range": { "start": 50, "end": 150, "step": 2 },
      "overrides": {
        "scene.cycles.device": "GPU"
      }
    }
  ]
}
```

### Range Format
- Continuous simple range string: `"1-100"` or `"1-100x2"`
- Custom discontinuous multi-range string: `"1-50, 75, 120-240x2"` (image formats only)
- Structured range object: `{ "start": 1, "end": 100, "step": 1 }`

---

## Exit Codes

| Code | Meaning | Description |
|:----:|:--------|:------------|
| **`0`** | **Success** | All jobs rendered successfully, or `--dry-run` validation passed. |
| **`1`** | **Failure** | One or more frames/jobs failed, or preflight errors blocked execution. |
| **`2`** | **Invalid Input** | Missing queue file, malformed JSON, invalid arguments, or schema validation failure. |

---

## Safety Rules & Behavior

1. **Safety Rule for Post-Actions:**
   Power actions (`sleep`, `hibernate`, `shutdown`, `restart`) fire **ONLY** after graceful completion inside an interactive live session, preceded by a 60-second visible countdown that can be cancelled with any keypress or Ctrl+C. A crash, process kill, or SIGINT **NEVER** triggers a post-action.
2. **Terminal Bell:**
   On completion of each job, the terminal bell ASCII character (`\x07`) is emitted to alert the user without interrupting progress line formatting.
3. **Crash Recovery & Resume:**
   When running with `--resume`, Night Render scans output directories for missing frames and resumes execution from the first unrendered frame.
