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
