import { z } from 'zod';

/**
 * An item in an RNA enum property (e.g. engine, file format, view transform).
 */
export const rnaEnumItemSchema = z.object({
  identifier: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export type RnaEnumItem = z.infer<typeof rnaEnumItemSchema>;

/**
 * RNA property metadata introspected from Blender bpy.types.
 */
export const rnaPropertyMetaSchema = z.object({
  value: z.unknown(),
  type: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  enumItems: z.array(rnaEnumItemSchema).optional(),
});

export type RnaPropertyMeta = z.infer<typeof rnaPropertyMetaSchema>;

/**
 * A dictionary of property name -> RNA property metadata.
 */
export const rnaStructSchema = z.record(z.string(), rnaPropertyMetaSchema);

export type RnaStruct = z.infer<typeof rnaStructSchema>;

/**
 * A single scene in the .blend file.
 */
export const inspectSceneSchema = z.object({
  name: z.string(),
  activeCamera: z.string().nullable().optional(),
  cameras: z.array(z.string()).default([]),
  viewLayers: z.array(z.string()).default([]),
  frameStart: z.number(),
  frameEnd: z.number(),
  frameStep: z.number().default(1),
  fps: z.number().default(24),
  fpsBase: z.number().default(1),
  resolutionX: z.number(),
  resolutionY: z.number(),
  resolutionPercentage: z.number().default(100),
  render: rnaStructSchema.default({}),
  imageSettings: rnaStructSchema.default({}),
  ffmpeg: rnaStructSchema.default({}),
  cycles: rnaStructSchema.default({}),
  eevee: rnaStructSchema.default({}),
  viewSettings: rnaStructSchema.default({}),
  displaySettings: rnaStructSchema.default({}),
});

export type InspectScene = z.infer<typeof inspectSceneSchema>;

/**
 * Missing external file path reported by Blender inspector.
 */
export const missingFileSchema = z.object({
  path: z.string(),
  type: z.enum(['image', 'library', 'sound']),
  datablock: z.string().optional(),
});

export type MissingFile = z.infer<typeof missingFileSchema>;

/**
 * Render compute device available to Cycles.
 */
export const cyclesDeviceSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string(),
  use: z.boolean().default(true),
});

export type CyclesDevice = z.infer<typeof cyclesDeviceSchema>;

/**
 * Full output emitted by inspect_blend.py.
 */
export const inspectOutputSchema = z.object({
  schemaVersion: z.number().default(1),
  blenderVersion: z.string(),
  savedWithVersion: z.string(),
  blendPath: z.string(),
  activeScene: z.string(),
  scenes: z.array(inspectSceneSchema),
  missingFiles: z.array(missingFileSchema).default([]),
  cyclesDevices: z.array(cyclesDeviceSchema).default([]),
  engineItems: z.array(rnaEnumItemSchema).default([]),
  formatItems: z.array(rnaEnumItemSchema).default([]),
  codecItems: z.array(rnaEnumItemSchema).default([]),
  viewTransformItems: z.array(rnaEnumItemSchema).default([]),
  lookItems: z.array(rnaEnumItemSchema).default([]),
  deviceItems: z.array(rnaEnumItemSchema).default([]),
});

export type InspectOutput = z.infer<typeof inspectOutputSchema>;
