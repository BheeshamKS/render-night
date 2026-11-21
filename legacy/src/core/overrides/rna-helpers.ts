import type {
  InspectOutput,
  InspectScene,
  RnaEnumItem,
  RnaPropertyMeta,
  RnaStruct,
} from '../schemas/inspect';

/**
 * Returns the active render engine for a job, respecting any override.
 */
export function getActiveEngine(job: {
  overrides?: Record<string, unknown>;
  scenes?: InspectScene[];
  selectedScene?: string;
}): string {
  if (job.overrides && typeof job.overrides['scene.render.engine'] === 'string') {
    return job.overrides['scene.render.engine'] as string;
  }
  const scene = job.scenes?.find((s) => s.name === job.selectedScene) || job.scenes?.[0];
  const engineVal = scene?.render?.engine?.value;
  if (typeof engineVal === 'string') {
    return engineVal;
  }
  return 'CYCLES';
}

/**
 * Maps an RNA dot path to the corresponding struct and property identifier.
 */
export function parseRnaPath(rnaPath: string): {
  structKey:
    | 'render'
    | 'imageSettings'
    | 'ffmpeg'
    | 'cycles'
    | 'eevee'
    | 'viewSettings'
    | 'displaySettings'
    | 'other';
  propName: string;
} {
  const parts = rnaPath.split('.');
  if (parts[0] === 'scene') {
    if (parts[1] === 'render') {
      if (parts[2] === 'image_settings' && parts[3]) {
        return { structKey: 'imageSettings', propName: parts[3] };
      }
      if (parts[2] === 'ffmpeg' && parts[3]) {
        return { structKey: 'ffmpeg', propName: parts[3] };
      }
      if (parts[2]) {
        return { structKey: 'render', propName: parts[2] };
      }
    }
    if (parts[1] === 'cycles' && parts[2]) {
      return { structKey: 'cycles', propName: parts[2] };
    }
    if (parts[1] === 'eevee' && parts[2]) {
      return { structKey: 'eevee', propName: parts[2] };
    }
    if (parts[1] === 'view_settings' && parts[2]) {
      return { structKey: 'viewSettings', propName: parts[2] };
    }
    if (parts[1] === 'display_settings' && parts[2]) {
      return { structKey: 'displaySettings', propName: parts[2] };
    }
  }

  return { structKey: 'other', propName: parts[parts.length - 1] };
}

/**
 * Gets the default value for an RNA path from inspected scene metadata.
 */
export function getRnaDefaultValue(scene: InspectScene | undefined, rnaPath: string): unknown {
  if (!scene) return undefined;

  // Direct special properties on InspectScene
  if (rnaPath === 'scene.render.resolution_x') return scene.resolutionX;
  if (rnaPath === 'scene.render.resolution_y') return scene.resolutionY;
  if (rnaPath === 'scene.render.resolution_percentage') return scene.resolutionPercentage ?? 100;
  if (rnaPath === 'scene.render.fps') return scene.fps;
  if (rnaPath === 'scene.render.fps_base') return scene.fpsBase ?? 1.0;

  const { structKey, propName } = parseRnaPath(rnaPath);
  if (structKey !== 'other') {
    const struct = scene[structKey] as RnaStruct | undefined;
    if (struct && struct[propName]) {
      return struct[propName].value;
    }
  }

  return undefined;
}

/**
 * Gets RNA metadata (min, max, enumItems, description, name) for a given RNA path.
 */
export function getRnaPropertyMeta(
  scene: InspectScene | undefined,
  rnaPath: string,
  inspectData?: InspectOutput,
): RnaPropertyMeta | undefined {
  if (!scene) return undefined;

  const { structKey, propName } = parseRnaPath(rnaPath);
  if (structKey !== 'other') {
    const struct = scene[structKey] as RnaStruct | undefined;
    if (struct && struct[propName]) {
      const meta = { ...struct[propName] };
      // Fallback enum items from top-level inspection if missing
      if (meta.type === 'ENUM' && (!meta.enumItems || meta.enumItems.length === 0) && inspectData) {
        if (rnaPath === 'scene.render.engine') meta.enumItems = inspectData.engineItems;
        else if (rnaPath === 'scene.render.image_settings.file_format')
          meta.enumItems = inspectData.formatItems;
        else if (rnaPath === 'scene.cycles.device') meta.enumItems = inspectData.deviceItems;
        else if (rnaPath === 'scene.view_settings.view_transform')
          meta.enumItems = inspectData.viewTransformItems;
        else if (rnaPath === 'scene.view_settings.look') meta.enumItems = inspectData.lookItems;
      }
      return meta;
    }
  }

  // Fallbacks for direct scene fields
  if (rnaPath === 'scene.render.resolution_x') {
    return { value: scene.resolutionX, type: 'INT', min: 1, max: 65536, name: 'Resolution X' };
  }
  if (rnaPath === 'scene.render.resolution_y') {
    return { value: scene.resolutionY, type: 'INT', min: 1, max: 65536, name: 'Resolution Y' };
  }
  if (rnaPath === 'scene.render.resolution_percentage') {
    return {
      value: scene.resolutionPercentage ?? 100,
      type: 'INT',
      min: 1,
      max: 1000,
      name: 'Resolution %',
    };
  }
  if (rnaPath === 'scene.render.fps') {
    return { value: scene.fps, type: 'INT', min: 1, max: 1000, name: 'Frame Rate' };
  }

  return undefined;
}

/**
 * Returns available enum options for a property, providing safe Blender standard fallbacks.
 */
export function getEnumOptions(
  meta: RnaPropertyMeta | undefined,
  fallbackItems: RnaEnumItem[] = [],
): RnaEnumItem[] {
  if (meta?.enumItems && meta.enumItems.length > 0) {
    return meta.enumItems;
  }
  return fallbackItems;
}
