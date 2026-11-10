import { crashPolicySchema, overrideMapSchema } from './override';

import { z } from 'zod';

export const jobStatusSchema = z.enum([
  'pending',
  'active',
  'paused',
  'done',
  'failed',
  'canceled',
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

export const frameRangeModeSchema = z.enum(['scene_default', 'simple', 'custom', 'single_still']);

export type FrameRangeMode = z.infer<typeof frameRangeModeSchema>;

export const simpleRangeSchema = z.object({
  start: z.number(),
  end: z.number(),
  step: z.number().min(1).default(1),
});

export type SimpleRange = z.infer<typeof simpleRangeSchema>;

export const frameRangeConfigSchema = z.object({
  mode: frameRangeModeSchema.default('scene_default'),
  simple: simpleRangeSchema.optional(),
  customExpression: z.string().optional(),
  singleStillFrame: z.number().optional(),
});

export type FrameRangeConfig = z.infer<typeof frameRangeConfigSchema>;

export const failedFrameSchema = z.object({
  frame: z.number(),
  error: z.string(),
  stderrTail: z.string().optional(),
  timestamp: z.number(),
  attemptCount: z.number().default(1),
});

export type FailedFrame = z.infer<typeof failedFrameSchema>;

export const jobSchema = z.object({
  id: z.string(),
  blendPath: z.string(),
  name: z.string(),
  status: jobStatusSchema,
  range: z.object({
    start: z.number(),
    end: z.number(),
    step: z.number(),
  }),
  rangeConfig: frameRangeConfigSchema.optional(),
  crashPolicy: crashPolicySchema.optional(),
  renderMissingOnly: z.boolean().default(false),
  failedFrames: z.array(failedFrameSchema).default([]),
  overrides: overrideMapSchema,
  presets: z.array(z.string()),
  outputDir: z.string().optional(),
  outputPattern: z.string().optional(),
  device: z.string().optional(),
  engine: z.string().optional(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  error: z.string().optional(),
  progress: z.number().default(0),
  lastFrame: z.number().optional(),
  inspect: z.unknown().optional(),
  preRenderHook: z.string().optional(),
});

export type Job = z.infer<typeof jobSchema>;

export const postActionSchema = z.enum([
  'none',
  'sleep',
  'hibernate',
  'shutdown',
  'restart',
  'close_app',
]);

export type PostAction = z.infer<typeof postActionSchema>;

export const soundSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  volume: z.number().min(0).max(100).default(100),
  playOnFailure: z.boolean().default(false),
});

export type SoundSettings = z.infer<typeof soundSettingsSchema>;

export const scheduleConfigSchema = z.object({
  enabled: z.boolean().default(false),
  targetTime: z.string().optional(), // "HH:MM"
  targetTimestamp: z.number().optional(),
  blockSleepWhileWaiting: z.boolean().default(true),
});

export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;

export const queueSettingsSchema = z.object({
  concurrentJobs: z.number().min(1).max(8).default(1),
  stopOnFailure: z.boolean().default(false),
  closeAppOnCompletion: z.boolean().default(false),
  closeAppOnCompletionMode: z.enum(['all', 'last']).default('last'),
  soundOnCompletion: z.boolean().default(true),
  soundOnFailure: z.boolean().default(true),
  soundPath: z.string().optional(),
  powerMode: z.enum(['none', 'preventSleep', 'highPerformance']).default('none'),
  pauseOnBattery: z.boolean().default(false),
  resumeOnAc: z.boolean().default(false),
  maxConcurrentFrames: z.number().min(1).max(16).default(1),
  postAction: postActionSchema.default('none'),
  sound: soundSettingsSchema.default({}),
  schedule: scheduleConfigSchema.optional(),
});

export type QueueSettings = z.infer<typeof queueSettingsSchema>;

export const queueStateSchema = z.object({
  version: z.number(),
  jobs: z.array(jobSchema),
  settings: queueSettingsSchema,
});

export type QueueState = z.infer<typeof queueStateSchema>;
export type PersistedQueueState = QueueState;
