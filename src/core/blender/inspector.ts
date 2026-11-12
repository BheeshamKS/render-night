import { inspectOutputSchema, type InspectOutput } from '../schemas';
import { readBlendHeader } from './header-reader';

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface InspectOptions {
  isolatedMode?: boolean;
  autoExec?: boolean;
  timeoutMs?: number;
  resourcesPath?: string;
  scriptPath?: string;
}

export class InspectorError extends Error {
  public readonly stderrTail?: string;

  constructor(message: string, stderrTail?: string) {
    super(message);
    this.name = 'InspectorError';
    this.stderrTail = stderrTail;
  }
}

/**
 * Resolves the absolute path to inspect_blend.py on disk.
 * Prioritizes packaged resources directory (process.resourcesPath/python/inspect_blend.py)
 * and ensures no virtual app.asar path is ever passed to an external native process.
 */
export function resolveInspectScriptPath(
  resourcesPath: string = process.resourcesPath || '',
): string {
  const candidates: string[] = [];
  if (resourcesPath) {
    candidates.push(join(resourcesPath, 'python', 'inspect_blend.py'));
  }
  candidates.push(
    resolve(__dirname, '../../../resources/python/inspect_blend.py'),
    resolve(__dirname, '../../resources/python/inspect_blend.py'),
    resolve(process.cwd(), 'resources/python/inspect_blend.py'),
  );

  for (const p of candidates) {
    const safePath =
      p.includes('app.asar') && !p.includes('app.asar.unpacked')
        ? p.replace('app.asar', 'app.asar.unpacked')
        : p;
    if (existsSync(safePath)) return safePath;
    if (existsSync(p) && !p.includes('app.asar')) return p;
  }
  return candidates[0] || resolve(process.cwd(), 'resources/python/inspect_blend.py');
}

/**
 * Headlessly inspect a .blend file using Blender Python API.
 * Emits validated InspectOutput containing scenes, cameras, RNA metadata, and devices.
 */
export async function inspectBlend(
  blendPath: string,
  blenderExecutable: string | string[],
  options: InspectOptions = {},
): Promise<InspectOutput> {
  const resolvedBlendPath = resolve(blendPath);
  if (!existsSync(resolvedBlendPath)) {
    throw new InspectorError(`Blend file not found: ${resolvedBlendPath}`);
  }

  // 1. Cheaply extract header version and verify magic before spawning Blender
  let headerVersion = '4.2.0';
  try {
    const header = await readBlendHeader(resolvedBlendPath);
    headerVersion = header.version;
  } catch {
    // If header read fails, still proceed to let Blender attempt opening or fail with full error
  }

  const script = options.scriptPath || resolveInspectScriptPath(options.resourcesPath);

  // Use user cache dir on Linux/Unix so flatpak/sandboxed Blender with host permissions can access the temp file
  const baseTmpDir =
    process.platform === 'win32'
      ? tmpdir()
      : join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'render-night', 'tmp');

  try {
    await fs.mkdir(baseTmpDir, { recursive: true });
  } catch {
    // ignore
  }

  const effectiveTmpDir = existsSync(baseTmpDir) ? baseTmpDir : tmpdir();
  const tempOutputFile = join(effectiveTmpDir, `rn-inspect-${randomUUID()}.json`);

  const argv = Array.isArray(blenderExecutable) ? [...blenderExecutable] : [blenderExecutable];
  const [cmd, ...baseArgs] = argv;

  // Build command: blender -b "<file>" [--factory-startup] [--enable-autoexec | --disable-autoexec] -P inspect_blend.py -- <out.json>
  const args: string[] = [...baseArgs, '-b', resolvedBlendPath];

  if (options.isolatedMode) {
    args.push('--factory-startup');
  }

  if (options.autoExec) {
    args.push('--enable-autoexec');
  } else {
    args.push('--disable-autoexec');
  }

  args.push('-P', script, '--', tempOutputFile);

  const timeoutMs = options.timeoutMs ?? 60_000;

  return new Promise((resolveResult, rejectResult) => {
    let stdout = '';
    let stderr = '';

    const child = execFile(
      cmd,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      },
      async (err, outStr, errStr) => {
        stdout += outStr || '';
        stderr += errStr || '';

        try {
          if (existsSync(tempOutputFile)) {
            const raw = await fs.readFile(tempOutputFile, 'utf8');
            await fs.unlink(tempOutputFile).catch(() => {});
            const parsed = JSON.parse(raw);
            if (!parsed.savedWithVersion && headerVersion) {
              parsed.savedWithVersion = headerVersion;
            }
            const validated = inspectOutputSchema.parse(parsed);
            resolveResult(validated);
            return;
          }

          // If tempOutputFile was not created, Blender failed
          const tail = stderr.slice(-1000) || stdout.slice(-1000);
          rejectResult(
            new InspectorError(
              `Failed to inspect ${resolvedBlendPath}: ${err ? err.message : 'No output file generated'}${
                tail ? `\n--- stderr ---\n${tail}` : ''
              }`,
              tail,
            ),
          );
        } catch (parseErr) {
          await fs.unlink(tempOutputFile).catch(() => {});
          const tail = stderr.slice(-1000);
          rejectResult(
            new InspectorError(
              `Failed to validate inspect output: ${(parseErr as Error).message}${
                tail ? `\n--- stderr ---\n${tail}` : ''
              }`,
              tail,
            ),
          );
        }
      },
    );

    child.on('error', (err) => {
      fs.unlink(tempOutputFile).catch(() => {});
      rejectResult(new InspectorError(`Failed to spawn Blender executable: ${err.message}`));
    });
  });
}

/**
 * Concurrency limiter for running inspections across multiple files.
 */
export function createInspectQueue(concurrency: number = 2) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active < concurrency && queue.length > 0) {
      active++;
      const run = queue.shift()!;
      run();
    }
  };

  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolvePromise, rejectPromise) => {
      queue.push(() => {
        fn()
          .then(resolvePromise)
          .catch(rejectPromise)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
