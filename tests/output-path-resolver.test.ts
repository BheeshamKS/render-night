import { normalizeRawOutputPath, resolveOutputPath } from '../src/core/render/output-path-resolver';
import { detectSequence } from '../src/core/sequence/sequence-detector';

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Cross-OS and relative sequence path resolution (regression)', () => {
  let tmpRoot: string;
  let tapDir: string;
  let blendFile: string;
  let seqDir: string;
  let relRenderDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-path-res-'));
    tapDir = path.join(tmpRoot, 'Bheesham', 'Blender 3D', 'projects', 'The Tap');
    blendFile = path.join(tapDir, 'shot 2.blend');
    seqDir = path.join(tapDir, 'shot 2 animation renders');
    relRenderDir = path.join(tapDir, 'render');

    fs.mkdirSync(seqDir, { recursive: true });
    fs.mkdirSync(relRenderDir, { recursive: true });
    fs.writeFileSync(blendFile, 'BLENDER');
    fs.writeFileSync(path.join(seqDir, '0001.png'), 'png1');
    fs.writeFileSync(path.join(seqDir, '0002.png'), 'png2');
    fs.writeFileSync(path.join(relRenderDir, 'shot_0001.png'), 'png1');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('resolves Blender // relative paths against the .blend directory', async () => {
    const seq = await detectSequence('//render/shot_####.png', blendFile);
    expect(seq).not.toBeNull();
    expect(seq?.totalFrames).toBe(1);
    expect(seq?.filePaths[1]).toBe(path.join(relRenderDir, 'shot_0001.png'));
  });

  it('resolves Windows drive output paths against Linux .blend ancestor paths', async () => {
    const seq = await detectSequence(
      'D:/Bheesham/Blender 3D/projects/The Tap/shot 2 animation renders/',
      blendFile,
    );
    expect(seq).not.toBeNull();
    expect(seq?.directory).toBe(seqDir);
    expect(seq?.totalFrames).toBe(2);
  });

  it('resolves Flatpak /app/blender/D:/... runner saved paths against Linux .blend ancestor paths', async () => {
    const seq = await detectSequence(
      '/app/blender/D:/Bheesham/Blender 3D/projects/The Tap/shot 2 animation renders/_0001',
      blendFile,
    );
    expect(seq).not.toBeNull();
    expect(seq?.directory).toBe(seqDir);
    expect(seq?.totalFrames).toBe(2);
  });

  it('resolveOutputPath handles empty input, fallbackToBlendDir, nested blend dirs, and uncreated subfolders', () => {
    expect(normalizeRawOutputPath('  /app/blender/D:/Bheesham/shot.png ')).toBe(
      'D:/Bheesham/shot.png',
    );
    expect(resolveOutputPath('', blendFile)).toBe(tapDir);

    const missingPath = 'D:/Completely/Missing/Folder/';
    expect(resolveOutputPath(missingPath, blendFile, { fallbackToBlendDir: true })).toBe(tapDir);

    const nestedBlend = path.join(tapDir, 'shots', 'shot3', 'scene.blend');
    fs.mkdirSync(path.dirname(nestedBlend), { recursive: true });
    fs.writeFileSync(nestedBlend, 'BLENDER');

    const uncreatedWinOut = 'D:/Bheesham/Blender 3D/projects/The Tap/new_renders/';
    expect(resolveOutputPath(uncreatedWinOut, nestedBlend)).toBe(
      `${path.join(tapDir, 'new_renders')}${path.sep}`,
    );
  });

  it('render_runner.py resolves foreign Windows paths and trailing-slash frame filenames on Linux', () => {
    const pyCheck = spawnSync('python3', ['--version'], { encoding: 'utf8' });
    if (pyCheck.error || pyCheck.status !== 0) {
      return;
    }

    const runnerScript = path.resolve(__dirname, '../resources/python/render_runner.py');
    const pyCode = [
      'import importlib.util, json, sys',
      'spec = importlib.util.spec_from_file_location("rn_runner", sys.argv[1])',
      'mod = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(mod)',
      'blend = sys.argv[2]',
      'res_dir = mod.resolve_foreign_windows_path("D:/Bheesham/Blender 3D/projects/The Tap/shot 2 animation renders/", blend)',
      'res_flatpak = mod.resolve_foreign_windows_path("/app/blender/D:/Bheesham/Blender 3D/projects/The Tap/shot 2 animation renders/", blend)',
      'res_rel = mod.resolve_foreign_windows_path("//render/shot_####.png", blend)',
      'frame_dir = mod.compute_frame_filepath(res_dir, 1)',
      'frame_hash = mod.compute_frame_filepath(res_rel, 12)',
      'print(json.dumps({"res_dir": res_dir, "res_flatpak": res_flatpak, "res_rel": res_rel, "frame_dir": frame_dir, "frame_hash": frame_hash}))',
    ].join('\n');

    const res = spawnSync('python3', ['-c', pyCode, runnerScript, blendFile], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout.trim()) as {
      res_dir: string;
      res_flatpak: string;
      res_rel: string;
      frame_dir: string;
      frame_hash: string;
    };
    expect(parsed.res_dir).toBe(`${seqDir}${path.sep}`);
    expect(parsed.res_flatpak).toBe(`${seqDir}${path.sep}`);
    expect(parsed.res_rel).toBe(path.join(relRenderDir, 'shot_####.png'));
    expect(parsed.frame_dir).toBe(`${seqDir}${path.sep}0001`);
    expect(parsed.frame_hash).toBe(path.join(relRenderDir, 'shot_0012.png'));
  });
});
