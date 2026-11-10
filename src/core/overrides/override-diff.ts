import type { InspectOutput } from '../schemas/inspect';
import type { OverrideMap } from '../schemas/override';

/**
 * Checks whether a property value differs from its inspected default.
 */
export function isPropertyModified(
  _rnaPath: string,
  currentValue: unknown,
  defaultValue: unknown,
): boolean {
  if (currentValue === defaultValue) {
    return false;
  }

  if (currentValue === undefined || currentValue === null) {
    return defaultValue !== undefined && defaultValue !== null;
  }
  if (defaultValue === undefined || defaultValue === null) {
    return true;
  }

  // Handle arrays
  if (Array.isArray(currentValue) && Array.isArray(defaultValue)) {
    if (currentValue.length !== defaultValue.length) {
      return true;
    }
    for (let i = 0; i < currentValue.length; i++) {
      if (currentValue[i] !== defaultValue[i]) {
        return true;
      }
    }
    return false;
  }

  // Handle objects
  if (
    typeof currentValue === 'object' &&
    typeof defaultValue === 'object' &&
    !Array.isArray(currentValue) &&
    !Array.isArray(defaultValue)
  ) {
    const curObj = currentValue as Record<string, unknown>;
    const defObj = defaultValue as Record<string, unknown>;
    const keys = new Set([...Object.keys(curObj), ...Object.keys(defObj)]);
    for (const k of keys) {
      if (curObj[k] !== defObj[k]) {
        return true;
      }
    }
    return false;
  }

  return currentValue !== defaultValue;
}

/**
 * Computes the override diff { [rnaPath]: value } containing ONLY values
 * that differ from the file defaults.
 */
export function computeOverrideDiff(
  currentValues: Record<string, unknown>,
  fileDefaults: Record<string, unknown>,
): OverrideMap {
  const diff: OverrideMap = {};

  for (const [key, value] of Object.entries(currentValues)) {
    if (value !== undefined && isPropertyModified(key, value, fileDefaults[key])) {
      diff[key] = value;
    }
  }

  return diff;
}

/**
 * Normalizes engine name to uppercase canonical identifier.
 */
export function normalizeEngine(engine?: string): string {
  if (!engine) return 'CYCLES';
  const upper = engine.trim().toUpperCase();
  if (upper.includes('EEVEE')) {
    return upper.includes('NEXT') ? 'BLENDER_EEVEE_NEXT' : 'BLENDER_EEVEE';
  }
  if (upper.includes('WORKBENCH')) {
    return 'BLENDER_WORKBENCH';
  }
  if (upper.includes('CYCLES')) {
    return 'CYCLES';
  }
  return upper;
}

/**
 * Determines if an RNA dot-path property is supported/relevant for a given engine.
 */
export function isPropertyRelevantToEngine(rnaPath: string, engine: string): boolean {
  const normEngine = normalizeEngine(engine);

  // Cycles specific properties
  if (rnaPath.startsWith('scene.cycles.')) {
    return normEngine === 'CYCLES';
  }

  // EEVEE specific properties
  if (rnaPath.startsWith('scene.eevee.')) {
    return normEngine === 'BLENDER_EEVEE' || normEngine === 'BLENDER_EEVEE_NEXT';
  }

  // Common properties (scene.render.*, scene.render.image_settings.*, scene.render.ffmpeg.*, scene.view_settings.*, etc.)
  return true;
}

export interface ValidationTarget {
  engine?: string;
  inspectData?: InspectOutput;
  sceneName?: string;
}

export interface SkippedOverride {
  rnaPath: string;
  reason: string;
}

export interface OverrideValidationResult {
  applicable: OverrideMap;
  skipped: SkippedOverride[];
}

/**
 * Validates an override diff against a target job's engine and metadata.
 * Skips properties not supported by target engine or missing in schema.
 */
export function validateOverridesForJob(
  overrides: OverrideMap,
  targetJob: ValidationTarget,
): OverrideValidationResult {
  const applicable: OverrideMap = {};
  const skipped: SkippedOverride[] = [];

  // Determine effective target engine:
  // If the diff overrides scene.render.engine, that becomes the target engine!
  const overriddenEngine = overrides['scene.render.engine'];
  const effectiveEngine =
    typeof overriddenEngine === 'string'
      ? overriddenEngine
      : targetJob.engine ||
        (targetJob.inspectData?.scenes?.find(
          (s) => !targetJob.sceneName || s.name === targetJob.sceneName,
        )?.render?.engine?.value as string | undefined) ||
        'CYCLES';

  const normTargetEngine = normalizeEngine(effectiveEngine);

  for (const [rnaPath, value] of Object.entries(overrides)) {
    if (!isPropertyRelevantToEngine(rnaPath, normTargetEngine)) {
      skipped.push({
        rnaPath,
        reason: `Property "${rnaPath}" is not supported by engine ${effectiveEngine}`,
      });
      continue;
    }

    applicable[rnaPath] = value;
  }

  return { applicable, skipped };
}

/**
 * Returns a filtered copy of the overrides diff containing only properties
 * relevant to the currently active engine.
 */
export function filterOverridesForActiveEngine(
  overrides: OverrideMap,
  engine: string,
): OverrideMap {
  const filtered: OverrideMap = {};
  for (const [path, val] of Object.entries(overrides)) {
    if (isPropertyRelevantToEngine(path, engine)) {
      filtered[path] = val;
    }
  }
  return filtered;
}
