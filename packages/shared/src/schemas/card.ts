import { z } from 'zod';

export const cardResizeInputSchema = z.object({
  height: z.number().int().positive(),
});
export type CardResizeInput = z.infer<typeof cardResizeInputSchema>;

export const cardPinInputSchema = z.object({
  pin: z.boolean(),
});
export type CardPinInput = z.infer<typeof cardPinInputSchema>;

export const cardCopyInputSchema = z.object({
  text: z.string(),
});
export type CardCopyInput = z.infer<typeof cardCopyInputSchema>;
