import { PresetStore } from '../src/core/presets/preset-store';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('PresetStore', () => {
  let tmpDir: string;
  let presetFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-presets-test-'));
    presetFilePath = path.join(tmpDir, 'presets.json');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loads empty list when file does not exist', async () => {
    const store = new PresetStore(presetFilePath);
    const presets = await store.loadPresets();
    expect(presets).toEqual([]);
  });

  it('saves and loads a new preset', async () => {
    const store = new PresetStore(presetFilePath);
    const saved = await store.savePreset({
      name: '1080p / 256 samples / PNG 16-bit',
      overrides: {
        'scene.render.resolution_x': 1920,
        'scene.render.resolution_y': 1080,
        'scene.cycles.samples': 256,
        'scene.render.image_settings.file_format': 'PNG',
        'scene.render.image_settings.color_depth': '16',
      },
      engine: 'CYCLES',
    });

    expect(saved.id).toBeDefined();
    expect(saved.name).toBe('1080p / 256 samples / PNG 16-bit');
    expect(saved.overrides['scene.cycles.samples']).toBe(256);
    expect(saved.createdAt).toBeGreaterThan(0);

    // Reload in a fresh store instance to verify persistence
    const reloadedStore = new PresetStore(presetFilePath);
    const loaded = await reloadedStore.loadPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('1080p / 256 samples / PNG 16-bit');
    expect(loaded[0].overrides).toEqual(saved.overrides);
  });

  it('updates an existing preset when id is provided', async () => {
    const store = new PresetStore(presetFilePath);
    const first = await store.savePreset({
      name: 'Draft Render',
      overrides: { 'scene.cycles.samples': 32 },
    });

    const updated = await store.savePreset({
      id: first.id,
      name: 'Draft Render (Fast)',
      overrides: { 'scene.cycles.samples': 16 },
    });

    expect(updated.id).toBe(first.id);
    expect(updated.name).toBe('Draft Render (Fast)');
    expect(updated.overrides['scene.cycles.samples']).toBe(16);

    const all = await store.loadPresets();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Draft Render (Fast)');
  });

  it('renames a preset', async () => {
    const store = new PresetStore(presetFilePath);
    const item = await store.savePreset({
      name: 'Old Name',
      overrides: { 'scene.render.resolution_x': 1280 },
    });

    const renamed = await store.renamePreset(item.id, 'New Name');
    expect(renamed).not.toBeNull();
    expect(renamed?.name).toBe('New Name');

    const all = await store.loadPresets();
    expect(all[0].name).toBe('New Name');
  });

  it('deletes a preset', async () => {
    const store = new PresetStore(presetFilePath);
    const item1 = await store.savePreset({
      name: 'Preset 1',
      overrides: {},
    });
    const item2 = await store.savePreset({
      name: 'Preset 2',
      overrides: {},
    });

    expect(await store.loadPresets()).toHaveLength(2);

    const deleted = await store.deletePreset(item1.id);
    expect(deleted).toBe(true);

    const remaining = await store.loadPresets();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(item2.id);
  });

  it('exports and imports presets JSON', async () => {
    const store1 = new PresetStore(presetFilePath);
    await store1.savePreset({
      name: '4K Production',
      overrides: {
        'scene.render.resolution_x': 3840,
        'scene.render.resolution_y': 2160,
      },
    });

    const jsonStr = await store1.exportPresetsJson();
    expect(jsonStr).toContain('4K Production');
    expect(jsonStr).toContain('3840');

    // Import into a separate store
    const store2Path = path.join(tmpDir, 'presets2.json');
    const store2 = new PresetStore(store2Path);
    const result = await store2.importPresetsJson(jsonStr);

    expect(result.imported).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.imported[0].name).toBe('4K Production');

    const store2Presets = await store2.loadPresets();
    expect(store2Presets).toHaveLength(1);
    expect(store2Presets[0].name).toBe('4K Production');
  });
});
