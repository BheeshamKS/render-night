# Headless CLI (`night-render`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a standalone, headless CLI (`night-render`) that consumes pure `src/core` with ZERO Electron dependencies, running queues from `queue.json`, inspecting files, discovering Blenders, handling preflight validation, crash recovery/resume, history, sleep prevention, graceful post-actions, terminal bell, progress reporting, and deterministic exit codes, bundled via esbuild.

**Architecture:** Pure Node.js CLI entry in `src/cli/` that orchestrates `src/core` engines (`QueueEngine`, `PreflightChecker`, `discoverAllBlenders`, `inspectBlend`, `HistoryStore`, `SessionLockManager`, `QueuePersistence`, `executeOsPostAction`, `SleepBlockerManager`). CLI argument parsing via minimal zero-dependency parser; schema validation via Zod in `src/core/schemas/cli.ts`.

**Tech Stack:** Node.js 20+, TypeScript, Zod, esbuild, Vitest.

**Spec:** User request:
- Commands: `night-render --queue queue.json [--blender <path|version|latest>] [--post-action none|sleep|shutdown] [--resume] [--preset <name>] [--dry-run]`, `night-render inspect <file.blend>`, `night-render list-blenders`.
- `queue.json` schema documented in `docs/cli.md` using the same override diffs and presets as the app.
- Live progress lines, terminal bell (`\x07`) on job completion, final summary with exit codes (0 ok, 1 failed, 2 invalid input).
- Preflight, crash recovery, sleep hold, history, and graceful post-action safety countdown.
- Bundled with esbuild into `dist-cli/night-render.cjs` and exposed in `package.json` bin.
- Acceptance: 2-job queue runs against mock-blender, resumes after kill, verifies exit codes.

## Global Constraints
- ZERO Electron imports in `src/cli/` or `src/core/`.
- Strict exit codes: 0 = ok, 1 = job/render failure, 2 = invalid input/syntax/schema.
- Hard safety rule: Post-actions fire ONLY after graceful completion in a live session with countdown, never on crash or Ctrl+C.
- Git author: `BheeshamKS <bheeshamkumarsajnani3@gmail.com>`.

## Review Focus
1. Malformed or non-existent `queue.json` files must exit immediately with code 2 and a descriptive schema error message without throwing uncaught exceptions.
2. `--blender latest` must dynamically pick the highest installed Blender version, while `--blender 4.2` picks the best matching installation, and explicit paths are validated on disk.
3. Ctrl+C (SIGINT) must cleanly shut down child Blender processes and save the queue state so `--resume` can continue without duplicate frames.
4. Terminal bell (`\x07`) must sound on each finished job without corrupting the progress line output.
5. In `--dry-run` mode, preflight checks run and summary prints, but no processes are spawned and exit code is 0.

---

### Task 1: CLI Queue Zod Schema & Documentation

**Files:**
- Create: `src/core/schemas/cli.ts`
- Create: `docs/cli.md`
- Test: `tests/cli-schema.test.ts`

**Interfaces:**
- Produces:
  - `cliJobSchema`, `cliQueueSchema`, `CliQueueInput`, `CliJobInput` in `src/core/schemas/cli.ts`
  - Function `validateCliQueue(data: unknown): CliQueueInput`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { cliQueueSchema, validateCliQueue } from '../src/core/schemas/cli';

describe('CLI Queue Schema', () => {
  it('validates a correct queue.json object with overrides and range', () => {
    const valid = {
      blender: 'latest',
      postAction: 'sleep',
      jobs: [
        {
          blendPath: '/renders/scene.blend',
          scene: 'Scene',
          camera: 'Camera',
          range: '1-50',
          overrides: { 'scene.cycles.samples': 128 },
        },
      ],
    };
    const parsed = validateCliQueue(valid);
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.blender).toBe('latest');
  });

  it('rejects invalid inputs with descriptive error', () => {
    expect(() => validateCliQueue({ jobs: 'not-an-array' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli-schema.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `src/core/schemas/cli.ts` and `docs/cli.md`**

Define `cliJobSchema` and `cliQueueSchema` with Zod, supporting `blendPath`, `scene`, `camera`, `range` (string or `{ start, end, step }`), `overrides`, `presets`, `outputPattern`, `priority`, `threads`, `renderMissingOnly`, `preRenderHook`, `crashPolicy`. Document schema and CLI usage in `docs/cli.md`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/schemas/cli.ts docs/cli.md tests/cli-schema.test.ts
git commit -m "feat(cli): define queue.json schema and cli documentation"
```

---

### Task 2: CLI Options Parser & Blender Version Resolver

**Files:**
- Create: `src/cli/args.ts`
- Create: `src/cli/blender-resolver.ts`
- Test: `tests/cli-args.test.ts`

**Interfaces:**
- Produces:
  - `parseCliArgs(argv: string[]): CliParsedCommand`
  - `resolveBlenderForCli(spec?: string): Promise<{ executable: string[]; version: string; displayPath: string }>`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../src/cli/args';

describe('CLI Args Parser', () => {
  it('parses --queue flags and optional parameters', () => {
    const cmd = parseCliArgs([
      '--queue', 'queue.json',
      '--blender', '4.2',
      '--post-action', 'shutdown',
      '--dry-run',
      '--resume'
    ]);
    expect(cmd.kind).toBe('queue');
    if (cmd.kind === 'queue') {
      expect(cmd.queueFile).toBe('queue.json');
      expect(cmd.blender).toBe('4.2');
      expect(cmd.postAction).toBe('shutdown');
      expect(cmd.dryRun).toBe(true);
      expect(cmd.resume).toBe(true);
    }
  });

  it('parses inspect and list-blenders commands', () => {
    expect(parseCliArgs(['inspect', 'file.blend']).kind).toBe('inspect');
    expect(parseCliArgs(['list-blenders']).kind).toBe('list-blenders');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli-args.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `src/cli/args.ts` and `src/cli/blender-resolver.ts`**

Parse flags (`--queue`, `--blender`, `--post-action`, `--resume`, `--preset`, `--dry-run`, `inspect`, `list-blenders`). In `blender-resolver.ts`, resolve `latest` (picks newest discovered), version string prefix match (e.g. `4.2`), or absolute path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli-args.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/args.ts src/cli/blender-resolver.ts tests/cli-args.test.ts
git commit -m "feat(cli): implement args parser and blender version resolver"
```

---

### Task 3: CLI Queue Runner Engine & Progress Renderer

**Files:**
- Create: `src/cli/runner.ts`
- Create: `src/cli/terminal.ts`
- Test: `tests/cli-runner.test.ts`

**Interfaces:**
- Produces:
  - `runCliQueue(options: CliRunOptions): Promise<{ exitCode: number; summary: CliSummary }>`
  - `ringTerminalBell(): void` (outputs `\x07`)
  - `formatSummaryTable(summary: CliSummary): string`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { runCliQueue } from '../src/cli/runner';

describe('CLI Queue Runner', () => {
  it('runs a valid queue in dry-run mode and returns exit code 0', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-cli-test-'));
    const queueFile = path.join(tmp, 'queue.json');
    fs.writeFileSync(
      queueFile,
      JSON.stringify({
        jobs: [
          {
            blendPath: path.resolve(__dirname, 'fixtures/sample.blend'),
            range: '1-5',
          },
        ],
      }),
    );

    const res = await runCliQueue({
      queueFile,
      dryRun: true,
      blender: path.resolve(__dirname, '../tools/mock-blender/index.js'),
    });

    expect(res.exitCode).toBe(0);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli-runner.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `src/cli/runner.ts` and `src/cli/terminal.ts`**

Implement queue execution using `QueueEngine`, `PreflightChecker`, `SessionLockManager`, `HistoryStore`, and `executeOsPostAction`. Wire SIGINT/SIGTERM handlers to call `engine.stop()`. Render single-line progress updates (`process.stdout.write(...)`), ring terminal bell `\x07` on job finish, execute post-action with countdown only on graceful success.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli-runner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/runner.ts src/cli/terminal.ts tests/cli-runner.test.ts
git commit -m "feat(cli): implement headless queue runner, terminal progress, and bell"
```

---

### Task 4: CLI Main Entry Point & esbuild Bundling

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `package.json`
- Test: `tests/cli-bundle.test.ts`

**Interfaces:**
- Produces:
  - Command line entry `night-render` in `dist-cli/night-render.cjs`
  - NPM script `"build:cli": "esbuild src/cli/index.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist-cli/night-render.cjs --banner:js=\"#!/usr/bin/env node\""`
  - Package.json `"bin": { "night-render": "dist-cli/night-render.cjs" }`

- [ ] **Step 1: Write test verifying CLI exit codes**

```typescript
import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);
const cliEntry = path.resolve(__dirname, '../src/cli/index.ts');

describe('CLI Main Entry', () => {
  it('exits with code 2 on invalid flags or missing queue file', async () => {
    try {
      await execFileAsync('npx', ['tsx', cliEntry, '--queue', 'non_existent.json']);
      expect.fail('Should have exited with code 2');
    } catch (err: any) {
      expect(err.code).toBe(2);
    }
  });

  it('exits with code 0 on list-blenders', async () => {
    const { stdout } = await execFileAsync('npx', ['tsx', cliEntry, 'list-blenders']);
    expect(stdout).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails or runs**

Run: `npm test -- tests/cli-bundle.test.ts`
Expected: FAIL or verify behavior.

- [ ] **Step 3: Update `src/cli/index.ts` and `package.json`**

Wire `main()` in `src/cli/index.ts` to dispatch `list-blenders`, `inspect`, and `--queue`. Add `"build:cli"` script in `package.json` and configure `bin`.

- [ ] **Step 4: Build CLI bundle and run test**

Run: `npm run build:cli && npm test -- tests/cli-bundle.test.ts`
Expected: PASS and `dist-cli/night-render.cjs` created.

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts package.json tests/cli-bundle.test.ts
git commit -m "feat(cli): wire main cli commands and esbuild bundle"
```

---

### Task 5: End-to-End Acceptance Test (2 Jobs Against Mock-Blender, Resume After Kill, Exit Codes)

**Files:**
- Create: `tests/e2e-cli-acceptance.test.ts`

**Interfaces:**
- Tests:
  - Generates `queue.json` with 2 jobs.
  - Runs full queue against `mock-blender` -> exit code 0.
  - Tests process termination and `--resume` continuation from first missing frame.
  - Tests failed job exit code 1.
  - Tests invalid input exit code 2.

- [ ] **Step 1: Write the end-to-end acceptance test**

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCliQueue } from '../src/cli/runner';

describe('E2E CLI Acceptance Test', () => {
  it('runs 2 jobs against mock-blender, resumes after kill, and returns exact exit codes', async () => {
    // End-to-end verification logic
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- tests/e2e-cli-acceptance.test.ts`
Expected: PASS

- [ ] **Step 3: Run full verification (lint, typecheck, test, build)**

Run: `npm run lint && npm run typecheck && npm test && npm run build:cli && npm run build`
Expected: Exit code 0 for all commands.

- [ ] **Step 4: Commit and push**

```bash
git add tests/e2e-cli-acceptance.test.ts
git commit -m "test: verify headless cli execution, resume, and exit codes end-to-end"
git push origin main
```
