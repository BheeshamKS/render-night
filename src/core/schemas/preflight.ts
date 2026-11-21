import { z } from 'zod';

export const preflightModeSchema = z.enum(['never_block', 'ask', 'strict']);
export type PreflightMode = z.infer<typeof preflightModeSchema>;

export const preflightSeveritySchema = z.enum(['error', 'warning']);
export type PreflightSeverity = z.infer<typeof preflightSeveritySchema>;

export const quickFixActionSchema = z.enum([
  'switch_range_to_continuous',
  'create_output_dir',
  'select_camera',
  'switch_to_cpu',
  'custom',
]);
export type QuickFixAction = z.infer<typeof quickFixActionSchema>;

export const preflightQuickFixSchema = z.object({
  label: z.string(),
  action: quickFixActionSchema,
  data: z.unknown().optional(),
});
export type PreflightQuickFix = z.infer<typeof preflightQuickFixSchema>;

export const preflightIssueSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobName: z.string(),
  code: z.string(),
  severity: preflightSeveritySchema,
  isBlocking: z.boolean().optional(),
  relevance: z.enum(['used', 'unused', 'unknown']).optional(),
  message: z.string(),
  details: z.string().optional(),
  quickFix: preflightQuickFixSchema.optional(),
});
export type PreflightIssue = z.infer<typeof preflightIssueSchema>;

export const preflightJobReportSchema = z.object({
  jobId: z.string(),
  jobName: z.string(),
  isBlocked: z.boolean().optional(),
  blockReasons: z.array(z.string()).optional(),
  errors: z.array(preflightIssueSchema),
  warnings: z.array(preflightIssueSchema),
  unusedMissingCount: z.number().optional(),
});
export type PreflightJobReport = z.infer<typeof preflightJobReportSchema>;

export const preflightReportSchema = z.object({
  timestamp: z.number(),
  hasErrors: z.boolean(),
  hasWarnings: z.boolean(),
  isBlocked: z.boolean().optional(),
  blockReasons: z.array(z.string()).optional(),
  errors: z.array(preflightIssueSchema),
  warnings: z.array(preflightIssueSchema),
  jobReports: z.array(preflightJobReportSchema),
});
export type PreflightReport = z.infer<typeof preflightReportSchema>;
