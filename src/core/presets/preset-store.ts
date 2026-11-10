import { readJsonFile, writeAtomicJson } from '../persistence/atomic-file';
import type { OverrideMap } from '../schemas/override';
import { presetSchema, type Preset } from '../schemas/preset';

import { z } from 'zod';

import { randomUUID } from 'node:crypto';

export const presetListSchema = z.array(presetSchema);

export interface SavePresetInput {
  id?: string;
  name: string;
  description?: string;
  overrides: OverrideMap;
  engine?: string;
  device?: string;
  outputDir?: string;
  outputPattern?: string;
}

export interface ImportPresetsResult {
  imported: Preset[];
  skipped: number;
  errors: string[];
}

export class PresetStore {
  private filePath: string;
  private cache: Preset[] | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Load presets from disk, returning cached data if available.
   */
  async loadPresets(forceReload = false): Promise<Preset[]> {
    if (this.cache !== null && !forceReload) {
      return [...this.cache];
    }

    const raw = await readJsonFile<unknown>(this.filePath);
    if (!raw) {
      this.cache = [];
      return [];
    }

    const parsed = presetListSchema.safeParse(raw);
    if (parsed.success) {
      this.cache = parsed.data;
      return [...this.cache];
    }

    // Attempt to recover single object if someone saved a single preset
    const single = presetSchema.safeParse(raw);
    if (single.success) {
      this.cache = [single.data];
      return [...this.cache];
    }

    this.cache = [];
    return [];
  }

  /**
   * Save a preset. If id is provided and exists, it updates it. Otherwise creates new.
   */
  async savePreset(input: SavePresetInput): Promise<Preset> {
    const list = await this.loadPresets();
    const now = Date.now();

    const existingIndex = input.id ? list.findIndex((p) => p.id === input.id) : -1;

    let targetPreset: Preset;
    if (existingIndex >= 0) {
      const existing = list[existingIndex];
      targetPreset = {
        ...existing,
        name: input.name,
        description: input.description ?? existing.description,
        overrides: { ...input.overrides },
        engine: input.engine ?? existing.engine,
        device: input.device ?? existing.device,
        outputDir: input.outputDir ?? existing.outputDir,
        outputPattern: input.outputPattern ?? existing.outputPattern,
        updatedAt: now,
      };
      list[existingIndex] = targetPreset;
    } else {
      targetPreset = {
        id: input.id || randomUUID(),
        name: input.name,
        description: input.description,
        overrides: { ...input.overrides },
        engine: input.engine,
        device: input.device,
        outputDir: input.outputDir,
        outputPattern: input.outputPattern,
        createdAt: now,
        updatedAt: now,
      };
      list.push(targetPreset);
    }

    await writeAtomicJson(this.filePath, list);
    this.cache = list;
    return targetPreset;
  }

  /**
   * Rename an existing preset by ID.
   */
  async renamePreset(id: string, newName: string): Promise<Preset | null> {
    const list = await this.loadPresets();
    const target = list.find((p) => p.id === id);
    if (!target) return null;

    target.name = newName;
    target.updatedAt = Date.now();

    await writeAtomicJson(this.filePath, list);
    this.cache = list;
    return target;
  }

  /**
   * Delete a preset by ID.
   */
  async deletePreset(id: string): Promise<boolean> {
    const list = await this.loadPresets();
    const index = list.findIndex((p) => p.id === id);
    if (index === -1) return false;

    list.splice(index, 1);
    await writeAtomicJson(this.filePath, list);
    this.cache = list;
    return true;
  }

  /**
   * Export all presets or selected preset IDs as formatted JSON string.
   */
  async exportPresetsJson(ids?: string[]): Promise<string> {
    const list = await this.loadPresets();
    const toExport = ids && ids.length > 0 ? list.filter((p) => ids.includes(p.id)) : list;
    return JSON.stringify(toExport, null, 2);
  }

  /**
   * Import presets from a JSON string.
   */
  async importPresetsJson(jsonStr: string): Promise<ImportPresetsResult> {
    const result: ImportPresetsResult = {
      imported: [],
      skipped: 0,
      errors: [],
    };

    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(jsonStr);
    } catch (err) {
      result.errors.push(`Invalid JSON format: ${(err as Error).message}`);
      return result;
    }

    const items = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw];
    const currentList = await this.loadPresets();
    const now = Date.now();

    for (const item of items) {
      const parsed = presetSchema.safeParse(item);
      if (!parsed.success) {
        result.errors.push(
          `Invalid preset data: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
        );
        result.skipped++;
        continue;
      }

      const presetData = parsed.data;
      // Ensure unique ID if conflict exists with different name
      const existing = currentList.find((p) => p.id === presetData.id);
      const newId = existing ? randomUUID() : presetData.id;

      const newPreset: Preset = {
        ...presetData,
        id: newId,
        createdAt: presetData.createdAt || now,
        updatedAt: now,
      };

      currentList.push(newPreset);
      result.imported.push(newPreset);
    }

    if (result.imported.length > 0) {
      await writeAtomicJson(this.filePath, currentList);
      this.cache = currentList;
    }

    return result;
  }
}
