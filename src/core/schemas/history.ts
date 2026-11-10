import { z } from 'zod';

export const historyResultSchema = z.enum(['completed', 'failed', 'canceled']);

export type HistoryResult = z.infer<typeof historyResultSchema>;

export const historyEntrySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  filePath: z.string(),
  fileName: z.string(),
  project: z.string().optional(),
  scene: z.string(),
  camera: z.string(),
  frameCount: z.number().min(0),
  totalTimeSeconds: z.number().min(0),
  averageFrameTimeSeconds: z.number().min(0),
  engine: z.string(),
  device: z.string(), // Actual compute device reported by runner
  result: historyResultSchema,
  failedFrames: z.array(z.number()).default([]),
  outputPath: z.string(),
  timestamp: z.number(),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const historyListSchema = z.array(historyEntrySchema);

export type HistoryList = z.infer<typeof historyListSchema>;
