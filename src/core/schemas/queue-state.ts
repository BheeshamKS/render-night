import { overrideMapSchema } from './override';

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
});

export type Job = z.infer<typeof jobSchema>;

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
});

export type QueueSettings = z.infer<typeof queueSettingsSchema>;

export const queueStateSchema = z.object({
  version: z.number(),
  jobs: z.array(jobSchema),
  settings: queueSettingsSchema,
});

export type QueueState = z.infer<typeof queueStateSchema>;
