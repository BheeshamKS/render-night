import { crashPolicySchema } from './override';
import { postActionSchema } from './queue-state';

import { z } from 'zod';

export const cliRangeSchema = z.union([
  z.string(),
  z.object({
    start: z.number().int(),
    end: z.number().int(),
    step: z.number().int().min(1).default(1),
  }),
]);

export const cliJobSchema = z.object({
  id: z.string().optional(),
  blendPath: z.string().min(1, 'blendPath is required'),
  scene: z.string().optional(),
  camera: z.string().optional(),
  range: cliRangeSchema.optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
  presets: z.array(z.string()).optional(),
  outputPattern: z.string().optional(),
  priority: z.number().int().optional(),
  threads: z.number().int().min(0).optional(),
  renderMissingOnly: z.boolean().optional(),
  preRenderHook: z.string().optional(),
  crashPolicy: crashPolicySchema.optional(),
  stitchToMp4: z.boolean().optional(),
});

export const cliQueueSchema = z.object({
  blender: z.string().optional(),
  postAction: postActionSchema.optional(),
  jobs: z.array(cliJobSchema).min(1, 'At least one job is required in jobs array'),
});

export type CliJobInput = z.infer<typeof cliJobSchema>;
export type CliQueueInput = z.infer<typeof cliQueueSchema>;

export function validateCliQueue(data: unknown): CliQueueInput {
  return cliQueueSchema.parse(data);
}
