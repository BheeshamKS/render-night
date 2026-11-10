import { z } from 'zod';

/**
 * Overrides are stored as a DIFF against file defaults, never as full values.
 * Each key is a dot-separated RNA path (e.g. "scene.render.resolution_x").
 */
export const overrideMapSchema = z.record(z.string(), z.unknown());

export type OverrideMap = z.infer<typeof overrideMapSchema>;

export const overridePayloadSchema = z.object({
  blendPath: z.string(),
  overrides: overrideMapSchema,
  scene: z.string().optional(),
  device: z.string().optional(),
  outputDir: z.string().optional(),
  outputPattern: z.string().optional(),
  range: z
    .object({
      start: z.number(),
      end: z.number(),
      step: z.number(),
    })
    .optional(),
});

export type OverridePayload = z.infer<typeof overridePayloadSchema>;

export const devicePreferencesSchema = z.object({
  deviceType: z.string().optional(),
  enableGpu: z.boolean().default(true),
  selectedDevices: z.array(z.string()).optional(),
});

export type DevicePreferences = z.infer<typeof devicePreferencesSchema>;

export const crashPolicySchema = z.object({
  maxRetries: z.number().min(0).default(2),
  fallbackToCpu: z.boolean().default(true),
  skipOnFailure: z.boolean().default(true),
  maxConsecutiveCrashes: z.number().min(1).default(3),
});

export type CrashPolicy = z.infer<typeof crashPolicySchema>;

export const crashConfigSchema = z.object({
  frame: z.number().optional(),
  frames: z.array(z.number()).optional(),
  crashGpu: z.boolean().default(true),
  crashCpu: z.boolean().default(true),
});

export type CrashConfig = z.infer<typeof crashConfigSchema>;

export const runnerPayloadSchema = z.object({
  blendPath: z.string(),
  scene: z.string().optional(),
  camera: z.string().optional(),
  viewLayers: z.array(z.string()).optional(),
  overrides: overrideMapSchema.default({}),
  frames: z.array(z.number()),
  outputPattern: z.string(),
  outputDir: z.string(),
  controlFile: z.string(),
  devicePreferences: devicePreferencesSchema.optional(),
  threads: z.number().optional(),
  crashPolicy: crashPolicySchema.optional(),
  crashConfig: crashConfigSchema.optional(),
  renderMissingOnly: z.boolean().optional(),
  preRenderHook: z.string().optional(),
});

export type RunnerPayload = z.infer<typeof runnerPayloadSchema>;

export const controlCommandSchema = z.object({
  command: z.enum(['continue', 'pause', 'stop']),
  timestamp: z.number().optional(),
});

export type ControlCommand = z.infer<typeof controlCommandSchema>;
