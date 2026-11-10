import { overrideMapSchema } from './override';

import { z } from 'zod';

export const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  overrides: overrideMapSchema,
  device: z.string().optional(),
  engine: z.string().optional(),
  outputDir: z.string().optional(),
  outputPattern: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Preset = z.infer<typeof presetSchema>;
