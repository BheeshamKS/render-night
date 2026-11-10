# Render Night Implementation Plan: Scaffold, Discovery, Inspector & Queue UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete foundation and Phase 1/2 features of Render Night: Electron/React desktop app scaffold, cross-platform Blender discovery, headless `.blend` file inspector Python bridge with RNA introspection and header version extraction, token path expander, and Blender-native dark UI queue shell with job cards and drag-and-drop.

**Architecture:** Pure Node logic lives in `src/core` with zero Electron imports. JSON contracts are guarded by Zod schemas in `src/core/schemas` and documented in `docs/protocol.md`. The Electron main process exposes discovery and inspection IPC to the React frontend via a typed preload bridge. The UI uses Zustand for queue state, Tailwind with Blender 4.x dark theme tokens, and dynamic token previewing.

**Tech Stack:** Electron 33, React 18, TypeScript 5.6, Vite 5 / electron-vite 3, Tailwind CSS 3, Zustand 4, Zod 3, Vitest 2, Python 3 / `bpy`.

**Spec:** User prompt requirements for Render Night scaffold and Phase 2 (Blender discovery, inspect bridge, Simple Mode queue UI).

## Global Constraints
- App display name: "Render Night", slug: `render-night`, runner stdout prefix: `RN_EVENT`, app ID: `com.bheeshamks.rendernight`.
- UI is thin; all business logic lives in `src/core` with typed events and zero Electron imports.
- Never modify or save the user's original `.blend` file (the runner must never call save).
- Compatibility: Blender 3.6 LTS, 4.2 LTS, and latest 4.x/5.x (handle `BLENDER_EEVEE` vs `BLENDER_EEVEE_NEXT`).
- All dropdown options come from inspected file RNA enum items, never hardcoded.
- Git config: user.name "BheeshamKS", user.email "bheeshamkumarsajnani3@gmail.com". No Co-authored-by trailers. Branch `main`. Push after each completed feature.
- Tests, lint, and typecheck must pass before every commit.

## Review Focus
1. Header version extraction on corrupt or non-standard `.blend` files: falls back gracefully without crashing.
2. Flatpak execution on Linux: `["flatpak", "run", "org.blender.Blender"]` executed correctly as an argv array rather than single string path.
3. Token expansion edge cases: paths with multiple tokens, nested directories, missing tokens, and frame hashes (`####`) expanded accurately.
4. RNA introspection on varying Blender versions: safely handling missing attributes between 3.6 and 4.2+ (e.g., EEVEE Next, color management props) without script abort.
5. Inspect failure handling: capturing the stderr tail when Blender exits non-zero or crashes, setting job status to `failed` and presenting the error to the user.

---

### Task 1: Project Scaffold, Configuration, and Git Repository Initialization

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `electron-builder.yml`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `.github/workflows/release.yml`
- Create: `src/renderer/index.html`
- Delete: `index.html` (moved to renderer)

**Interfaces:**
- Consumes: Existing project files
- Produces: Clean `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, and initialized git remote `origin` on GitHub.

- [ ] **Step 1: Update package.json, tsconfig.json, and vitest.config.ts**
  - Add `"type": "module"`, set `"main": "out/main/index.js"`.
  - Ensure devDependencies include `typescript-eslint`, `eslint-plugin-prettier`, `@trivago/prettier-plugin-sort-imports`.
  - Update `tsconfig.json` to have `"types": ["vite/client", "node", "vitest/globals"]`.
  - Fix `vite.config.ts` and `vitest.config.ts` to run tests in node/dom environment cleanly without Uint8Array invariant violations.

- [ ] **Step 2: Update electron-builder.yml and release workflow**
  - Set `appId: com.bheeshamks.rendernight`.
  - Set `files: ["out/**/*", "resources/**/*", "package.json"]`.
  - Remove non-existent `afterPack` and `afterAllArtifactBuild` script hooks.
  - Ensure Windows (NSIS + portable), macOS (dmg arm64+x64), Linux (AppImage + deb only) configurations match spec.

- [ ] **Step 3: Move index.html into src/renderer/index.html**
  - Move root `index.html` to `src/renderer/index.html` and update script tag to `<script type="module" src="./main.tsx"></script>`.

- [ ] **Step 4: Update CLAUDE.md and README.md**
  - Ensure `CLAUDE.md` matches the user rules verbatim with "Render Night", `render-night`, and `RN_EVENT`.
  - Document the macOS right-click Open workaround in `README.md`.

- [ ] **Step 5: Git repo setup and initial commit**
  - Run `git init -b main`.
  - Configure `git config user.name "BheeshamKS"`, `git config user.email "bheeshamkumarsajnani3@gmail.com"`.
  - Create GitHub repository `BheeshamKS/render-night` using `gh repo create` if not already present, and set remote origin.
  - Run `npm test`, `npm run lint:fix`, `npm run typecheck`, and `npm run build`.
  - Commit `feat(scaffold): initial project scaffold for Render Night` and push to `origin main`.

---

### Task 2: Pure Core Utilities: Blend Header Reader, Token Expander, and Stdout Parser

**Files:**
- Create: `src/core/blender/header-reader.ts`
- Create: `src/core/render/token-expander.ts`
- Modify: `src/core/render/stdout-parser.ts`
- Create: `tests/header-reader.test.ts`
- Create: `tests/token-expander.test.ts`
- Modify: `tests/stdout.test.ts`

**Interfaces:**
- `readBlendHeader(filePath: string): Promise<{ version: string; is64Bit: boolean; littleEndian: boolean }>`
- `expandTokens(template: string, ctx: { project: string; scene: string; camera: string; frame?: number }): string`
- `parseStdoutLine(line: string, ctx?: StdoutContext): ParsedLine`

- [ ] **Step 1: Write tests for blend header reader, token expander, and stdout parser**
  - In `tests/header-reader.test.ts`, test binary buffer parsing for `BLENDER_v402` (4.2.0), `BLENDER-v306` (3.6.0), and non-blend file error handling.
  - In `tests/token-expander.test.ts`, test `{project}`, `{scene}`, `{camera}`, and `####` (padded frames, e.g. 4 hashes -> 0042, 3 hashes -> 042, bare frame).
  - In `tests/stdout.test.ts`, test native Blender lines (`Fra:1 Mem:24.50M (Peak 25.10M) | Time:00:00.52 | Remaining:00:05.12 | Mem:12.30M, Peak:14.20M | Scene, ViewLayer | Rendered 32/128 Samples`, `Saved: '/path/to/frame_0001.png'`) and structured `RN_EVENT` lines.

- [ ] **Step 2: Run tests to verify failures**
  - Run `npm test` and verify that the new test suites fail.

- [ ] **Step 3: Implement header-reader, token-expander, and stdout-parser**
  - Implement `readBlendHeader` reading the first 12 bytes (`fs.read`) with regex extraction.
  - Implement `expandTokens` replacing `{project}`, `{scene}`, `{camera}`, and hash blocks `#{1,8}` with padded frame strings.
  - Update `stdout-parser.ts` to parse `Fra:`, `Mem:`, `Time:`, `Remaining:`, `Sample`, and `Saved:`.

- [ ] **Step 4: Run tests to verify pass**
  - Run `npm test` and verify all tests pass.

- [ ] **Step 5: Commit and push**
  - Run `npm run lint` and `npm run typecheck`.
  - Commit `feat(core): implement blend header reader, token expander and stdout parser` and git push.

---

### Task 3: Protocol Schemas and Protocol Documentation

**Files:**
- Modify: `src/core/schemas/inspect.ts`
- Modify: `src/core/schemas/index.ts`
- Modify: `docs/protocol.md`
- Create: `tests/schema.test.ts`
- Create: `tests/fixtures/inspect-sample.json`

**Interfaces:**
- Produces: `inspectOutputSchema`, `InspectOutput`, `RnaPropertyMetadata` types and validation.

- [ ] **Step 1: Write schema validation tests and fixture**
  - Create `tests/fixtures/inspect-sample.json` representing complete output from a Blender 4.x scene with RNA metadata, cameras, view layers, Cycles devices, missing files.
  - In `tests/schema.test.ts`, validate that `inspectOutputSchema.parse(fixture)` succeeds.

- [ ] **Step 2: Implement comprehensive Zod schema in src/core/schemas/inspect.ts**
  - Define `rnaPropertySchema`: `{ value: z.unknown(), type?: z.string(), name?: z.string(), min?: z.number(), max?: z.number(), default?: z.unknown(), enumItems?: z.array(z.tuple([z.string(), z.string(), z.string().optional()])) }`.
  - Define `sceneSchema`: name, camera (active), cameras (array of strings), viewLayers (array of strings), frameStart, frameEnd, frameStep, fps, fpsBase, resolutionX, resolutionY, resolutionPercentage, rna properties for whitelist structs (`render`, `imageSettings`, `ffmpeg`, `cycles`, `eevee`, `viewSettings`, `displaySettings`).
  - Define missing files array (`{ path: string, type: 'image' | 'sound' | 'library' }`).
  - Define Cycles devices list.
  - Update `docs/protocol.md` documenting every field and JSON contract.

- [ ] **Step 3: Run tests to verify pass**
  - Run `npm test` to confirm schema validation passes.

- [ ] **Step 4: Commit and push**
  - Run lint and typecheck.
  - Commit `feat(schema): enrich inspect protocol schema and documentation` and git push.

---

### Task 4: Cross-Platform Blender Discovery Engine

**Files:**
- Modify: `src/core/blender/discovery.ts`
- Create: `tests/discovery.test.ts`

**Interfaces:**
- Produces:
  - `BlenderInstallation`: `{ executable: string[]; version: string; major: number; minor: number; patch: number; isPortable: boolean; label: string }`
  - `discoverAllBlenders(customPaths?: string[]): Promise<BlenderInstallation[]>`
  - `probeBlender(executable: string[] | string): Promise<BlenderInstallation>`
  - `defaultCandidateExecutables(platform?: NodeJS.Platform): (string | string[])[]`

- [ ] **Step 1: Write tests for Blender discovery with mocked filesystem & child_process**
  - In `tests/discovery.test.ts`, test discovering multiple versions, sorting semver descending, handling flatpak argv arrays `["flatpak", "run", "org.blender.Blender"]`, and probing custom paths.

- [ ] **Step 2: Run tests to verify failures**
  - Verify `npm test` fails.

- [ ] **Step 3: Implement discovery.ts**
  - Detect on Windows: `C:\Program Files\Blender Foundation\*`, Steam, MS Store paths.
  - Detect on macOS: `/Applications/Blender*.app/Contents/MacOS/Blender`, `~/Applications`.
  - Detect on Linux: `PATH`, `/opt`, `~/blender*`, `/snap/bin`, Steam, and Flatpak (`flatpak run org.blender.Blender`).
  - Probe using `--version`, parse version string `Blender X.Y.Z`.
  - Sort by semver descending (latest is index 0).
  - Export functions for probing and adding/removing custom paths with validation.

- [ ] **Step 4: Run tests to verify pass**
  - Run `npm test` and verify discovery tests pass.

- [ ] **Step 5: Commit and push**
  - Run lint and typecheck.
  - Commit `feat(blender): implement cross-platform blender discovery engine` and git push.

---

### Task 5: Headless Blend Inspector Python Bridge

**Files:**
- Modify: `resources/python/inspect_blend.py`
- Modify: `src/core/blender/inspector.ts`
- Create: `tests/inspector.test.ts`
- Modify: `tools/mock-blender/index.js`

**Interfaces:**
- `inspectBlend(blendPath: string, blenderExecutable: string[] | string, options?: InspectOptions): Promise<InspectOutput>`
- `InspectOptions`: `{ isolatedMode?: boolean; autoExec?: boolean; timeoutMs?: number }`

- [ ] **Step 1: Implement resources/python/inspect_blend.py**
  - Introspect `bpy.data.scenes`. For each scene:
    - Extract active camera (`scene.camera.name` if present), list of all cameras in `bpy.data.cameras` / `scene.objects` of type `'CAMERA'`.
    - Extract view layers: `[vl.name for vl in scene.view_layers]`.
    - Generic RNA introspection over whitelist structs:
      - `scene.render` (resolution_x, resolution_y, resolution_percentage, fps, fps_base, frame_start, frame_end, frame_step, etc.)
      - `scene.render.image_settings` (file_format, color_mode, color_depth, quality, compression)
      - `scene.render.ffmpeg` (format, codec, video_bitrate, audio_codec)
      - `scene.cycles` (device, samples, preview_samples, use_denoising, etc.)
      - `scene.eevee` (taa_render_samples, use_bloom, etc. - compatible with 3.6 and 4.2+ `BLENDER_EEVEE_NEXT`)
      - `scene.view_settings` (view_transform, look, exposure, gamma)
      - `scene.display_settings` (display_device)
    - Enum items extraction: `rna_type.properties[prop_id].enum_items` -> `[item.identifier, item.name, item.description]`.
    - Report missing external files: check `bpy.data.images`, `bpy.data.libraries`, `bpy.data.sounds` (skipping packed and generated images).
    - Report Cycles compute devices: `bpy.context.preferences.addons['cycles'].preferences.devices`.
    - Write JSON output to file specified in `sys.argv` after `--`.

- [ ] **Step 2: Implement inspector.ts in src/core/blender**
  - First extract saved Blender version cheaply via `readBlendHeader(blendPath)`.
  - Spawn Blender CLI: `[...executable, "-b", blendPath, "-P", scriptPath, "--", tempOutputFile]`.
  - Handle `--factory-startup` if `options.isolatedMode` is enabled.
  - Handle `--enable-autoexec` if `options.autoExec` is enabled.
  - Default scripts auto-exec stays OFF.
  - Read output file, validate via `inspectOutputSchema.parse(json)`.
  - If Blender fails or exits with error, capture stderr tail (last 1000 characters) and reject with descriptive `InspectorError`.

- [ ] **Step 3: Update mock-blender and write tests in tests/inspector.test.ts**
  - Update `tools/mock-blender/index.js` so it can simulate `--version` and `-b <file> -P inspect_blend.py -- <out>` when called by tests.
  - Test successful inspect, timeout, and stderr tail on failure.

- [ ] **Step 4: Run tests to verify pass**
  - Run `npm test` and verify inspector tests pass.

- [ ] **Step 5: Commit and push**
  - Run lint and typecheck.
  - Commit `feat(inspector): implement headless python blend inspector and bridge` and git push.

---

### Task 6: Electron Main IPC & Preload Bridge

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/preload/types.ts`
- Create: `src/main/ipc.ts`

**Interfaces:**
- Exposes `window.rnApi`:
  - `discoverBlenders(): Promise<BlenderInstallation[]>`
  - `probeBlender(executable: string[] | string): Promise<BlenderInstallation>`
  - `inspectBlend(filePath: string, blenderExecutable?: string[] | string, options?: InspectOptions): Promise<InspectOutput>`
  - `readHeaderVersion(filePath: string): Promise<string>`
  - `selectBlendFiles(): Promise<string[]>`
  - `selectDirectory(): Promise<string | null>`

- [ ] **Step 1: Implement IPC handlers in src/main/ipc.ts**
  - Register `ipcMain.handle` for discovery, inspect, file selection dialogs (`dialog.showOpenDialog` with `.blend` filter), and folder picker dialogs.

- [ ] **Step 2: Expose typed API in src/preload/index.ts**
  - Expose `window.rnApi` using `contextBridge.exposeInMainWorld`.
  - Define TypeScript types in `src/preload/types.ts` and add ambient declarations for `window.rnApi`.

- [ ] **Step 3: Verify build and typecheck**
  - Run `npm run typecheck` and `npm run build`.

- [ ] **Step 4: Commit and push**
  - Run lint.
  - Commit `feat(ipc): expose typed discovery and inspection ipc bridge` and git push.

---

### Task 7: Simple Mode Queue UI & Zustand State Store

**Files:**
- Create: `src/renderer/store/queueStore.ts`
- Create: `src/renderer/components/Toolbar.tsx`
- Create: `src/renderer/components/JobCard.tsx`
- Create: `src/renderer/components/DropZone.tsx`
- Create: `src/renderer/components/MonitorDock.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `tailwind.config.js`

**Interfaces:**
- Zustand `useQueueStore`:
  - `jobs: QueueJob[]`
  - `blenders: BlenderInstallation[]`
  - `selectedBlender: BlenderInstallation | null`
  - `addFiles(filePaths: string[]): Promise<void>`
  - `removeJob(id: string): void`
  - `updateJob(id: string, updates: Partial<QueueJob>): void`
  - `reorderJobs(fromIndex: number, toIndex: number): void`
  - `setSelectedBlender(install: BlenderInstallation): void`
  - `setIsolatedMode(enabled: boolean): void`
  - `setAutoExec(enabled: boolean): void`

- [ ] **Step 1: Implement queue store in src/renderer/store/queueStore.ts**
  - Manage state for jobs, discovered Blender installations, selected global Blender, isolated mode, auto-exec, and monitor log messages.
  - When files are added, instantiate job with status `'inspecting'`, call `window.rnApi.inspectBlend` with concurrency limit, populate job with scenes, active camera, cameras list, default output path, and compute expanded token preview.
  - On failure, set status to `'failed'` with error message (including stderr tail).

- [ ] **Step 2: Build UI components with Blender 4.x dark theme**
  - `Toolbar.tsx`:
    - Title "Render Night", version badge.
    - "Add .blend" button (invokes file dialog).
    - Blender version selector dropdown (lists detected installations, sorted semver descending, showing version and path/type).
    - Isolated mode toggle / Auto-exec setting toggle.
    - Start / Pause / Stop buttons (disabled for now).
  - `JobCard.tsx`:
    - Enable checkbox.
    - Status badge: Queued, Inspecting, Rendering, Completed, Failed, Skipped.
    - Filename and blend file path tooltip.
    - Scene dropdown and Camera dropdown (populated dynamically from inspected RNA items).
    - Output path input field + Browse button.
    - Dynamic Token Preview showing the expanded output filename (evaluating `{project}`, `{scene}`, `{camera}`, `####`).
    - Remove button (`X`).
    - Drag-to-reorder affordance (move up/down or drag handle).
    - Error display with full stderr tail tooltip when status is Failed.
  - `DropZone.tsx`:
    - Full-window drag-over detector with high-contrast Blender-themed overlay for dropping `.blend` files.
  - `MonitorDock.tsx`:
    - Bottom dock displaying system events and log entries.

- [ ] **Step 3: Connect components in App.tsx**
  - Initialize Blender discovery on app startup.
  - Render Toolbar, DropZone with empty state or job list, and MonitorDock.

- [ ] **Step 4: Verify typecheck, lint, and build**
  - Run `npm run typecheck`, `npm run lint`, `npm run build`.

- [ ] **Step 5: Commit and push**
  - Commit `feat(ui): implement simple mode queue shell with job cards and drag-and-drop` and git push.

---

### Task 8: Integration Tests and Acceptance Verification

**Files:**
- Create: `tests/integration.test.ts`
- Modify: `tests/discovery.test.ts`
- Modify: `tests/inspector.test.ts`

**Interfaces:**
- Tests: token expander, discovery with mocked filesystems, schema validation of fixture JSON, inspector bridge, queue store logic.

- [ ] **Step 1: Write comprehensive tests covering acceptance criteria**
  - Test dropping 3 files, verifying inspector invocation and store updates.
  - Test scene and camera switching, verifying token preview updates instantly.
  - Test Blender version override per job and global version switching.
  - Test token expander with `{project}`, `{scene}`, `{camera}`, and `####`.
  - Test discovery with mock filesystem configurations.

- [ ] **Step 2: Run all tests, lint, and typecheck**
  - Run `npm test` -> all suites pass.
  - Run `npm run lint` -> 0 errors.
  - Run `npm run typecheck` -> 0 errors.
  - Run `npm run build` -> builds successfully.

- [ ] **Step 3: Commit and push final verification**
  - Commit `test: add comprehensive unit and integration tests for discovery, inspect and queue` and git push.
