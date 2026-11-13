import { z } from 'zod';

export const closeBehaviorChoiceSchema = z.enum(['window', 'quit', 'cancel']);
export type CloseBehaviorChoice = z.infer<typeof closeBehaviorChoiceSchema>;
