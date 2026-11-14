import { z } from 'zod';
import type { TranslationResult } from '../types/translate';

export const deleteHistoryInputSchema = z.object({
  id: z.string().min(1, '历史记录 ID 不能为空'),
});
export type DeleteHistoryInput = z.infer<typeof deleteHistoryInputSchema>;

export interface TranslationHistoryItem {
  id: string;
  timestamp: number;
  source: 'card' | 'home';
  mode: 'word' | 'sentence';
  text: string;
  context?: string;
  result: TranslationResult;
}
