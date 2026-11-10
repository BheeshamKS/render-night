import { z } from 'zod';

/**
 * Every structured line emitted by render_runner.py is prefixed with this
 * marker followed by a JSON object on its own line.
 */
export const RN_EVENT_PREFIX = 'RN_EVENT' as const;

export const frameStartEventSchema = z.object({
  type: z.literal('frame_start'),
  frame: z.number(),
  scene: z.string(),
});

export type FrameStartEvent = z.infer<typeof frameStartEventSchema>;

export const frameEndEventSchema = z.object({
  type: z.literal('frame_end'),
  frame: z.number(),
  scene: z.string(),
  saved: z.string().optional(),
  time: z.number().optional(),
});

export type FrameEndEvent = z.infer<typeof frameEndEventSchema>;

export const deviceReportSchema = z.object({
  type: z.literal('device_report'),
  devices: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      use: z.boolean(),
    }),
  ),
});

export type DeviceReport = z.infer<typeof deviceReportSchema>;

export const overrideAppliedSchema = z.object({
  type: z.literal('override_applied'),
  rnaPath: z.string(),
  value: z.unknown(),
});

export type OverrideApplied = z.infer<typeof overrideAppliedSchema>;

export const overrideSkippedSchema = z.object({
  type: z.literal('override_skipped'),
  rnaPath: z.string(),
  reason: z.string(),
});

export type OverrideSkipped = z.infer<typeof overrideSkippedSchema>;

export const errorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  frame: z.number().optional(),
  fatal: z.boolean().default(false),
});

export type ErrorEvent = z.infer<typeof errorEventSchema>;

export const runnerEventSchema = z.discriminatedUnion('type', [
  frameStartEventSchema,
  frameEndEventSchema,
  deviceReportSchema,
  overrideAppliedSchema,
  overrideSkippedSchema,
  errorEventSchema,
]);

export type RunnerEvent = z.infer<typeof runnerEventSchema>;
