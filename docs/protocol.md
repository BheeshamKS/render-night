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

1. `frame_start`:
   ```json
   { "type": "frame_start", "frame": 1, "scene": "Scene" }
   ```
2. `frame_end`:
   ```json
   { "type": "frame_end", "frame": 1, "scene": "Scene", "saved": "/path/to/frame_0001.png", "time": 1.23 }
   ```
3. `device_report`:
   ```json
   { "type": "device_report", "devices": [{ "name": "GeForce RTX 4090", "type": "OPTIX", "use": true }] }
   ```
4. `override_applied`:
   ```json
   { "type": "override_applied", "rnaPath": "scene.cycles.samples", "value": 256 }
   ```
5. `override_skipped`:
   ```json
   { "type": "override_skipped", "rnaPath": "scene.eevee.bloom", "reason": "Property not found in Blender 4.2+" }
   ```
6. `error`:
   ```json
   { "type": "error", "message": "Out of GPU memory", "frame": 5, "fatal": true }
   ```

---

## 3. Override Payload (`OverridePayload`)

Passed to `render_runner.py` specifying the diff against file defaults:
```json
{
  "blendPath": "/path/to/project.blend",
  "scene": "Scene",
  "device": "GPU",
  "range": { "start": 1, "end": 100, "step": 1 },
  "overrides": {
    "scene.cycles.samples": 256,
    "scene.render.resolution_percentage": 50
  }
}
```
Validated via `overridePayloadSchema` in `src/core/schemas/override.ts`.

---

## 4. Queue State Persistence (`QueueState`)

Stored in the application data folder (`render-night-queue.json`):
```json
{
  "version": 1,
  "jobs": [...],
  "settings": {
    "concurrentJobs": 1,
    "stopOnFailure": false,
    "soundOnCompletion": true
  }
}
```
Validated via `queueStateSchema` in `src/core/schemas/queue-state.ts`.
