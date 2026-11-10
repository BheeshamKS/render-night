import {
  computeOverrideDiff,
  filterOverridesForActiveEngine,
  isPropertyModified,
  isPropertyRelevantToEngine,
  validateOverridesForJob,
} from '../src/core/overrides/override-diff';

import { describe, expect, it } from 'vitest';

describe('Override Diff & Compatibility Validator', () => {
  describe('isPropertyModified', () => {
    it('detects primitive changes', () => {
      expect(isPropertyModified('scene.render.resolution_x', 1920, 1920)).toBe(false);
      expect(isPropertyModified('scene.render.resolution_x', 1920, 3840)).toBe(true);
      expect(isPropertyModified('scene.render.engine', 'CYCLES', 'CYCLES')).toBe(false);
      expect(isPropertyModified('scene.render.engine', 'BLENDER_EEVEE_NEXT', 'CYCLES')).toBe(true);
      expect(isPropertyModified('scene.render.film_transparent', true, true)).toBe(false);
      expect(isPropertyModified('scene.render.film_transparent', true, false)).toBe(true);
    });

    it('detects array/list equality correctly', () => {
      expect(isPropertyModified('devices', ['GPU_0'], ['GPU_0'])).toBe(false);
      expect(isPropertyModified('devices', ['GPU_0'], ['GPU_1'])).toBe(true);
    });

    it('handles null and undefined', () => {
      expect(isPropertyModified('camera', undefined, undefined)).toBe(false);
      expect(isPropertyModified('camera', 'Camera', undefined)).toBe(true);
      expect(isPropertyModified('camera', null, null)).toBe(false);
      expect(isPropertyModified('camera', 'Camera', null)).toBe(true);
    });
  });

  describe('computeOverrideDiff', () => {
    it('returns empty object when values match defaults', () => {
      const current = {
        'scene.render.resolution_x': 1920,
        'scene.render.resolution_y': 1080,
      };
      const defaults = {
        'scene.render.resolution_x': 1920,
        'scene.render.resolution_y': 1080,
      };
      expect(computeOverrideDiff(current, defaults)).toEqual({});
    });

    it('extracts only modified properties', () => {
      const current = {
        'scene.render.resolution_x': 1920,
        'scene.render.resolution_y': 1080,
        'scene.cycles.samples': 256,
        'scene.render.image_settings.color_depth': '16',
      };
      const defaults = {
        'scene.render.resolution_x': 1280,
        'scene.render.resolution_y': 1080,
        'scene.cycles.samples': 128,
        'scene.render.image_settings.color_depth': '8',
      };

      const diff = computeOverrideDiff(current, defaults);
      expect(diff).toEqual({
        'scene.render.resolution_x': 1920,
        'scene.cycles.samples': 256,
        'scene.render.image_settings.color_depth': '16',
      });
      expect(diff['scene.render.resolution_y']).toBeUndefined();
    });
  });

  describe('isPropertyRelevantToEngine', () => {
    it('allows common render and output properties for any engine', () => {
      expect(isPropertyRelevantToEngine('scene.render.resolution_x', 'CYCLES')).toBe(true);
      expect(isPropertyRelevantToEngine('scene.render.resolution_x', 'BLENDER_EEVEE_NEXT')).toBe(
        true,
      );
      expect(
        isPropertyRelevantToEngine('scene.render.image_settings.file_format', 'BLENDER_WORKBENCH'),
      ).toBe(true);
      expect(isPropertyRelevantToEngine('scene.view_settings.view_transform', 'CYCLES')).toBe(true);
    });

    it('restricts cycles properties to Cycles engine', () => {
      expect(isPropertyRelevantToEngine('scene.cycles.samples', 'CYCLES')).toBe(true);
      expect(isPropertyRelevantToEngine('scene.cycles.samples', 'BLENDER_EEVEE_NEXT')).toBe(false);
      expect(isPropertyRelevantToEngine('scene.cycles.adaptive_threshold', 'BLENDER_EEVEE')).toBe(
        false,
      );
      expect(isPropertyRelevantToEngine('scene.cycles.denoiser', 'BLENDER_WORKBENCH')).toBe(false);
    });

    it('restricts eevee properties to EEVEE engines', () => {
      expect(
        isPropertyRelevantToEngine('scene.eevee.taa_render_samples', 'BLENDER_EEVEE_NEXT'),
      ).toBe(true);
      expect(isPropertyRelevantToEngine('scene.eevee.taa_render_samples', 'BLENDER_EEVEE')).toBe(
        true,
      );
      expect(isPropertyRelevantToEngine('scene.eevee.taa_render_samples', 'CYCLES')).toBe(false);
      expect(isPropertyRelevantToEngine('scene.eevee.use_bloom', 'CYCLES')).toBe(false);
    });
  });

  describe('validateOverridesForJob', () => {
    it('applies all compatible overrides to a Cycles job', () => {
      const overrides = {
        'scene.render.resolution_x': 1920,
        'scene.render.resolution_y': 1080,
        'scene.cycles.samples': 256,
        'scene.render.image_settings.color_depth': '16',
      };

      const result = validateOverridesForJob(overrides, { engine: 'CYCLES' });
      expect(result.applicable).toEqual(overrides);
      expect(result.skipped).toEqual([]);
    });

    it('skips Cycles properties when targeting an EEVEE job', () => {
      const overrides = {
        'scene.render.resolution_x': 1920,
        'scene.cycles.samples': 256,
        'scene.render.image_settings.color_depth': '16',
      };

      const result = validateOverridesForJob(overrides, { engine: 'BLENDER_EEVEE_NEXT' });
      expect(result.applicable).toEqual({
        'scene.render.resolution_x': 1920,
        'scene.render.image_settings.color_depth': '16',
      });
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].rnaPath).toBe('scene.cycles.samples');
      expect(result.skipped[0].reason).toContain('BLENDER_EEVEE_NEXT');
    });

    it('respects engine override within the diff itself', () => {
      const overrides = {
        'scene.render.engine': 'CYCLES',
        'scene.cycles.samples': 512,
      };

      // Even if target job was initially EEVEE, the diff changes engine to CYCLES, so cycles.samples is valid!
      const result = validateOverridesForJob(overrides, { engine: 'BLENDER_EEVEE_NEXT' });
      expect(result.applicable).toEqual(overrides);
      expect(result.skipped).toEqual([]);
    });
  });

  describe('filterOverridesForActiveEngine', () => {
    it('hides irrelevant properties without mutating original diff', () => {
      const fullDiff = {
        'scene.render.resolution_x': 1920,
        'scene.cycles.samples': 256,
        'scene.eevee.taa_render_samples': 64,
      };

      const cyclesFiltered = filterOverridesForActiveEngine(fullDiff, 'CYCLES');
      expect(cyclesFiltered).toEqual({
        'scene.render.resolution_x': 1920,
        'scene.cycles.samples': 256,
      });

      const eeveeFiltered = filterOverridesForActiveEngine(fullDiff, 'BLENDER_EEVEE_NEXT');
      expect(eeveeFiltered).toEqual({
        'scene.render.resolution_x': 1920,
        'scene.eevee.taa_render_samples': 64,
      });

      // Original diff untouched
      expect(Object.keys(fullDiff)).toHaveLength(3);
    });
  });
});
