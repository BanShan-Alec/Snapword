import { z } from 'zod';

export const cardPinInputSchema = z.object({
  pin: z.boolean(),
});
export type CardPinInput = z.infer<typeof cardPinInputSchema>;

export const cardCopyInputSchema = z.object({
  text: z.string(),
});
export type CardCopyInput = z.infer<typeof cardCopyInputSchema>;
