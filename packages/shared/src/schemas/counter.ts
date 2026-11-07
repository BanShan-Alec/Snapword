import { z } from 'zod';

export const stepInputSchema = z.object({
  step: z.number().int().min(1).max(100).default(1),
});

export type StepInput = z.infer<typeof stepInputSchema>;
