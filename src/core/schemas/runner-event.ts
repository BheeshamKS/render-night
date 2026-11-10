import { z } from 'zod';

/**
 * Every structured line emitted by render_runner.py is prefixed with this
 * marker followed by a JSON object on its own line.
 */
export const RN_EVENT_PREFIX = 'RN_EVENT' as const;

export const jobStartEventSchema = z.object({
  type: z.literal('job_start'),
  totalFrames: z.number(),
  frames: z.array(z.number()),
  scene: z.string(),
  camera: z.string().optional(),
  engine: z.string().optional(),
});

export type JobStartEvent = z.infer<typeof jobStartEventSchema>;

export const deviceReportSchema = z.object({
  type: z.literal('device_report'),
  computeDeviceType: z.string(),
  engine: z.string(),
  mode: z.enum(['GPU', 'CPU', 'OPENGL']).or(z.string()),
  devices: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      use: z.boolean(),
    }),
  ),
  requestedGpu: z.boolean(),
  fallbackToCpu: z.boolean(),
  threads: z.number().optional(),
});

export type DeviceReport = z.infer<typeof deviceReportSchema>;

export const overridesReportSchema = z.object({
  type: z.literal('overrides_report'),
  applied: z.array(
    z.object({
      rnaPath: z.string(),
      value: z.unknown(),
    }),
  ),
  skipped: z.array(
    z.object({
      rnaPath: z.string(),
      reason: z.string(),
    }),
  ),
});

export type OverridesReport = z.infer<typeof overridesReportSchema>;

export const frameStartEventSchema = z.object({
  type: z.literal('frame_start'),
  frame: z.number(),
  scene: z.string(),
  frameIndex: z.number().optional(),
  totalFrames: z.number().optional(),
});

export type FrameStartEvent = z.infer<typeof frameStartEventSchema>;

export const frameDoneEventSchema = z.object({
  type: z.literal('frame_done'),
  frame: z.number(),
  scene: z.string(),
  saved: z.string(),
  timeSeconds: z.number().optional(),
  peakMemory: z.string().optional(),
});

export type FrameDoneEvent = z.infer<typeof frameDoneEventSchema>;

export const frameErrorEventSchema = z.object({
  type: z.literal('frame_error'),
  frame: z.number(),
  message: z.string(),
});

export type FrameErrorEvent = z.infer<typeof frameErrorEventSchema>;

export const jobDoneEventSchema = z.object({
  type: z.literal('job_done'),
  completedFrames: z.number(),
  failedFrames: z.number(),
  durationSeconds: z.number().optional(),
});

export type JobDoneEvent = z.infer<typeof jobDoneEventSchema>;

// Legacy / backwards compatible event types
export const frameEndEventSchema = z.object({
  type: z.literal('frame_end'),
  frame: z.number(),
  scene: z.string(),
  saved: z.string().optional(),
  time: z.number().optional(),
});

export type FrameEndEvent = z.infer<typeof frameEndEventSchema>;

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
  jobStartEventSchema,
  deviceReportSchema,
  overridesReportSchema,
  frameStartEventSchema,
  frameDoneEventSchema,
  frameErrorEventSchema,
  jobDoneEventSchema,
  frameEndEventSchema,
  overrideAppliedSchema,
  overrideSkippedSchema,
  errorEventSchema,
]);

export type RunnerEvent = z.infer<typeof runnerEventSchema>;
