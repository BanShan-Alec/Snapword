import { z } from 'zod';

export const calculateInputSchema = z.object({
  a: z.number(),
  b: z.number(),
  op: z.enum(['add', 'subtract', 'multiply', 'divide']),
});

export type CalculateInput = z.infer<typeof calculateInputSchema>;
