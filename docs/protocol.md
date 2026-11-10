# Render Night Protocol Specification

All JSON contracts and communication formats for Render Night. Every contract is enforced by a Zod schema in `src/core/schemas/`.

---

## 1. Inspect Output (`InspectOutput`)

Produced by `resources/python/inspect_blend.py` when invoked headlessly:
```bash
blender -b "<blend_file>" -P inspect_blend.py -- "<out.json>"
```
Validated via `inspectOutputSchema` in `src/core/schemas/inspect.ts`.

### Top-Level Properties

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `number` | Version of the inspect schema (currently `1`). |
| `blenderVersion` | `string` | Blender version executing the inspect (e.g. `"4.2.0"`). |
| `savedWithVersion` | `string` | Blender version from the `.blend` file header or data block. |
| `blendPath` | `string` | Absolute path to the inspected `.blend` file. |
| `activeScene` | `string` | Name of the active scene when the file was saved. |
| `scenes` | `InspectScene[]` | List of scenes in the file. |
| `missingFiles` | `MissingFile[]` | External image, library, or sound files that do not exist on disk. |
| `cyclesDevices` | `CyclesDevice[]` | Compute devices detected by the Cycles addon (CPU, CUDA, OPTIX, METAL, HIP, ONEAPI). |
| `engineItems` | `RnaEnumItem[]` | Available render engines (e.g. `CYCLES`, `BLENDER_EEVEE_NEXT`, `BLENDER_WORKBENCH`). |
| `formatItems` | `RnaEnumItem[]` | Available image/video file formats (e.g. `PNG`, `JPEG`, `OPEN_EXR`, `FFMPEG`). |
| `codecItems` | `RnaEnumItem[]` | Available video codecs for FFMPEG containers. |
| `viewTransformItems`| `RnaEnumItem[]` | Color management view transforms (e.g. `Standard`, `AgX`, `Filmic`). |
| `lookItems` | `RnaEnumItem[]` | Color management look presets (e.g. `None`, `Medium Contrast`, `High Contrast`). |
| `deviceItems` | `RnaEnumItem[]` | Cycles compute device enum items (`CPU`, `GPU`). |

### Scene Structure (`InspectScene`)

- `name`: string
- `activeCamera`: string | null
- `cameras`: string[] (all cameras in the scene)
- `viewLayers`: string[] (all view layers in the scene)
- `frameStart`, `frameEnd`, `frameStep`: numbers
- `fps`, `fpsBase`: numbers
- `resolutionX`, `resolutionY`, `resolutionPercentage`: numbers
- Whitelist RNA Structs (`render`, `imageSettings`, `ffmpeg`, `cycles`, `eevee`, `viewSettings`, `displaySettings`):
  Each struct maps property names to `RnaPropertyMeta`:
  ```json
  {
    "value": "CYCLES",
    "type": "ENUM",
    "name": "Engine",
    "enumItems": [
      { "identifier": "CYCLES", "name": "Cycles" },
      { "identifier": "BLENDER_EEVEE_NEXT", "name": "EEVEE" }
    ]
  }
  ```

---

## 2. Runner Events (`RunnerEvent`)

Emitted by `resources/python/render_runner.py` prefixed with `RN_EVENT ` on stdout:
```
RN_EVENT {"type":"frame_start","frame":1,"scene":"Scene"}
```
Validated via `runnerEventSchema` in `src/core/schemas/runner-event.ts`.

### Event Types

1. `job_start`:
   ```json
   {
     "type": "job_start",
     "totalFrames": 100,
     "frames": [1, 2, 3],
     "scene": "Scene",
     "camera": "Camera",
     "engine": "CYCLES"
   }
   ```
2. `device_report`:
   ```json
   {
     "type": "device_report",
     "computeDeviceType": "OPTIX",
     "engine": "CYCLES",
     "mode": "GPU",
     "devices": [{ "name": "NVIDIA GeForce RTX 4090", "type": "OPTIX", "use": true }],
     "requestedGpu": true,
     "fallbackToCpu": false,
     "threads": 16
   }
   ```
3. `overrides_report`:
   ```json
   {
     "type": "overrides_report",
     "applied": [{ "rnaPath": "scene.cycles.samples", "value": 256 }],
     "skipped": [{ "rnaPath": "scene.eevee.bloom", "reason": "Property not found in Blender 4.2+" }]
   }
   ```
4. `frame_start`:
   ```json
   { "type": "frame_start", "frame": 1, "scene": "Scene", "frameIndex": 0, "totalFrames": 100 }
   ```
5. `frame_done`:
   ```json
   {
     "type": "frame_done",
     "frame": 1,
     "scene": "Scene",
     "saved": "/path/to/frame_0001.png",
     "timeSeconds": 1.23,
     "peakMemory": "4.2G"
   }
   ```
6. `frame_error`:
   ```json
   { "type": "frame_error", "frame": 1, "message": "CUDA out of memory" }
   ```
7. `job_done`:
   ```json
   { "type": "job_done", "completedFrames": 100, "failedFrames": 0, "durationSeconds": 123.4 }
   ```

---

## 3. Runner Payload (`RunnerPayload`) & Control Channel

Passed to `render_runner.py` specifying render parameters and control file:
```bash
blender -b "<blend_file>" -P render_runner.py -- "<payload.json>"
```
Validated via `runnerPayloadSchema` in `src/core/schemas/override.ts`.

```json
{
  "blendPath": "/path/to/project.blend",
  "scene": "Scene",
  "camera": "Camera",
  "viewLayers": ["ViewLayer"],
  "overrides": {
    "scene.cycles.samples": 256,
    "scene.render.resolution_percentage": 50
  },
  "frames": [1, 2, 3, 4, 5],
  "outputPattern": "//render/test_####.png",
  "outputDir": "/path/to/renders",
  "controlFile": "/path/to/control.json",
  "devicePreferences": {
    "deviceType": "OPTIX",
    "enableGpu": true,
    "selectedDevices": ["NVIDIA GeForce RTX 4090"]
  },
  "threads": 8,
  "crashPolicy": {
    "maxRetries": 2,
    "fallbackToCpu": true,
    "skipOnFailure": true,
    "maxConsecutiveCrashes": 3
  },
  "renderMissingOnly": false
}
```

### Frame Range Modes & Constraints

1. `scene_default`: Uses inspected scene `frameStart`, `frameEnd`, and `frameStep`.
2. `simple`: User-defined continuous linear range `{ start, end, step }`.
3. `custom`: Comma-separated expression (e.g. `"50-200, 200-300"`, `"1-50, 75, 120-240x2"`). Dedupes overlapping frame numbers and sorts ascending.
4. `single_still`: Single frame number.

**Image vs Video Rule:**
- Custom multi-range, stepped discontinuous, and single still modes are allowed **ONLY** for image formats.
- For FFmpeg video container formats (`FFMPEG`, `AVI_JPEG`, `AVI_RAW`), the engine strictly enforces `scene_default` or `simple` continuous sequential ranges (`step = 1`). Video containers cannot mux non-sequential frame streams.

### Crash Recovery Policy (`CrashPolicy`)

When a Blender worker process crashes or exits unexpectedly on frame `F`:
1. Relaunches Blender with remaining frames starting at `F`, retrying up to `maxRetries` times.
2. If retries fail and `fallbackToCpu` is `true`, attempts frame `F` once on CPU (`scene.cycles.device = 'CPU'`).
3. If CPU fallback also fails, records frame `F` in `failedFrames` with error and stderr tail, increments consecutive crash counter, and skips to frame `F+1`.
4. If consecutive crashes exceed `maxConsecutiveCrashes`, marks the job as `failed` without terminating remaining jobs in the queue.
5. Failed frames can be retried via the "Retry failed frames" action.

### Control Sentinel (`control.json`)

Between frames, `render_runner.py` polls `controlFile`:
- `{"command": "continue"}`: Normal execution.
- `{"command": "pause"}`: Pause after current frame and wait until resumed.
- `{"command": "stop"}`: Abort remaining frames and terminate cleanly.
Validated via `controlCommandSchema` in `src/core/schemas/override.ts`.

---

## 4. Queue State Persistence (`QueueState`)

Stored atomically (write to temp file then rename) in the application data folder (`render-night-queue.json`):
```json
{
  "version": 1,
  "jobs": [...],
  "settings": {
    "concurrentJobs": 1,
    "stopOnFailure": false,
    "postAction": "none",
    "sound": {
      "enabled": true,
      "volume": 100,
      "playOnFailure": false
    },
    "schedule": {
      "enabled": false,
      "targetTime": "23:30",
      "blockSleepWhileWaiting": true
    }
  }
}
```
Validated via `queueStateSchema` in `src/core/schemas/queue-state.ts`.

### Session Lock Sentinel (`unclean-shutdown.lock`)
Active while a queue is rendering:
```json
{
  "pid": 12345,
  "timestamp": 1731289200000,
  "workerPids": [12346, 12347],
  "statePath": "/path/to/render-night-queue.json"
}
```
If present on launch and the main PID is dead, Render Night detects an unclean shutdown, kills orphaned worker processes, and prompts to resume unfinished frames.

---

## 5. Safe Post-Queue Actions (`PostAction`)

Configurable before queue execution or while queued:
`'none' | 'sleep' | 'hibernate' | 'shutdown' | 'restart' | 'close_app'`

### Safety Invariants:
1. **Live Graceful Completion Only**: The action only ever executes after the queue completes gracefully in a live session.
2. **60-Second Cancel Window**: A visible modal countdown displays for 60 seconds with an immediate "Cancel" button before executing the OS power command.
3. **Crash / Restore Disarm**: An unclean shutdown, crash, kill (`kill -9`), or restored session NEVER triggers a post-action. Restoring a queue sets `armed = false`.

---

## 6. Render History (`HistoryEntry`)

Append-only history stored at `<userData>/history/render-history.json` with file rotation:
```json
{
  "id": "hist-1731289200000",
  "jobId": "job-1",
  "filePath": "/path/to/scene.blend",
  "fileName": "scene.blend",
  "project": "scene",
  "scene": "Scene",
  "camera": "Camera",
  "frameCount": 250,
  "totalTimeSeconds": 312.4,
  "averageFrameTimeSeconds": 1.25,
  "engine": "CYCLES",
  "device": "GPU: NVIDIA RTX 4090 (OPTIX)",
  "result": "completed",
  "failedFrames": [],
  "outputPath": "/path/to/renders/scene_0001.png",
  "timestamp": 1731289200000
}
```
Validated via `historyEntrySchema` and `historyListSchema` in `src/core/schemas/history.ts`.
