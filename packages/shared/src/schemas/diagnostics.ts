import { z } from 'zod';

export const logInputSchema = z.object({
  level: z.enum(['info', 'warn', 'error', 'debug']).default('info'),
  message: z.string(),
  args: z.array(z.unknown()).optional(),
});

export type LogInput = z.infer<typeof logInputSchema>;

export const performActionInputSchema = z.object({
  action: z.enum(['toggleDevTools', 'openUrl']),
  url: z.string().url().optional(),
});

export type PerformActionInput = z.infer<typeof performActionInputSchema>;
