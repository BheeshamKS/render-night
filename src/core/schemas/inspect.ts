import { z } from 'zod';

/**
 * Schema for a single render device reported by Blender's Cycles/EEVEE device enum.
 */
export const deviceSchema = z.object({
  name: z.string(),
  type: z.string(),
  use: z.boolean(),
});

export type Device = z.infer<typeof deviceSchema>;

/**
 * Schema for a scene entry inside an inspected .blend file.
 */
export const sceneSchema = z.object({
  name: z.string(),
  frameStart: z.number(),
  frameEnd: z.number(),
  frameStep: z.number(),
  resolutionX: z.number(),
  resolutionY: z.number(),
  resolutionPercentage: z.number(),
  useFilmTransparent: z.boolean(),
  useSimplify: z.boolean(),
  simplifySubdivision: z.number(),
  simplifyRenderSamples: z.number(),
});

export type Scene = z.infer<typeof sceneSchema>;

/**
 * Schema for the render-image settings block.
 */
export const imageSettingsSchema = z.object({
  fileFormat: z.string(),
  colorMode: z.string(),
  quality: z.number(),
  codec: z.string(),
  compression: z.number(),
  outputDir: z.string(),
  fileName: z.string(),
  usePreview: z.boolean(),
  useFileExtension: z.boolean(),
  isFloat: z.boolean(),
  viewAsRender: z.boolean(),
});

export type ImageSettings = z.infer<typeof imageSettingsSchema>;

/**
 * Schema for the view/display settings block.
 */
export const viewSettingsSchema = z.object({
  viewTransform: z.string(),
  look: z.string(),
  exposure: z.number(),
  gamma: z.number(),
  useFalseColor: z.boolean(),
  displayDevice: z.string(),
  lookBlend: z.string(),
  useStereo3d: z.boolean(),
});

export type ViewSettings = z.infer<typeof viewSettingsSchema>;

/**
 * Schema for Cycles-specific render settings.
 */
export const cyclesSettingsSchema = z.object({
  device: z.string(),
  samples: z.number(),
  useDenoising: z.boolean(),
  denoiser: z.string(),
  useAdaptiveSampling: z.boolean(),
  adaptiveThreshold: z.number(),
  adaptiveMinSamples: z.number(),
  maxBounces: z.number(),
  diffuseBounces: z.number(),
  glossyBounces: z.number(),
  transmissionBounces: z.number(),
  transparentMaxBounces: z.number(),
  causticsReflective: z.boolean(),
  causticsRefractive: z.boolean(),
  blurGlossy: z.string(),
  fastGI: z.boolean(),
  usePersistentData: z.boolean(),
  tiling: z.object({
    enabled: z.boolean(),
    size: z.number(),
  }),
});

export type CyclesSettings = z.infer<typeof cyclesSettingsSchema>;

/**
 * Schema for EEVEE-specific render settings.
 */
export const eeveeSettingsSchema = z.object({
  taaRenderSamples: z.number(),
  useGtao: z.boolean(),
  gtaoDistance: z.number(),
  gtaoFactor: z.number(),
  useSsr: z.boolean(),
  ssrMaxRoughness: z.number(),
  ssrRayCount: z.number(),
  ssrSteps: z.number(),
  useBloom: z.boolean(),
  bloomIntensity: z.number(),
  bloomRadius: z.number(),
  useSoftShadows: z.boolean(),
  useRaytracing: z.boolean(),
  shadowRayCount: z.number(),
  useShadows: z.boolean(),
});

export type EeveeSettings = z.infer<typeof eeveeSettingsSchema>;

/**
 * Schema for the full output of `inspect_blend.py`.
 */
export const inspectOutputSchema = z.object({
  schemaVersion: z.number(),
  blenderVersion: z.string(),
  blendPath: z.string(),
  blendName: z.string(),
  scenes: z.array(sceneSchema),
  activeScene: z.string(),
  imageSettings: imageSettingsSchema,
  viewSettings: viewSettingsSchema,
  cyclesSettings: cyclesSettingsSchema.nullable(),
  eeveeSettings: eeveeSettingsSchema.nullable(),
  devices: z.array(deviceSchema),
  engine: z.string(),
  engineItems: z.array(z.tuple([z.string(), z.string()])),
  formatItems: z.array(z.tuple([z.string(), z.string()])),
  codecItems: z.array(z.tuple([z.string(), z.string()])),
  viewTransformItems: z.array(z.tuple([z.string(), z.string()])),
  lookItems: z.array(z.tuple([z.string(), z.string()])),
  deviceItems: z.array(z.tuple([z.string(), z.string()])),
  engineNextItems: z.array(z.tuple([z.string(), z.string()])).optional(),
});

export type InspectOutput = z.infer<typeof inspectOutputSchema>;
