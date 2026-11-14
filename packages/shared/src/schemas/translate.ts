import { z } from 'zod';

export const translationInputSchema = z.object({
  requestId: z.string().min(1).optional(),
  mode: z.enum(['word', 'sentence']),
  text: z.string().min(1, '待翻译文本不能为空').max(20000, '待翻译文本超出长度限制'),
  context: z.string().max(2000).optional(),
});
export type TranslationInput = z.infer<typeof translationInputSchema>;

export const abortTranslationInputSchema = z.object({
  requestId: z.string().min(1, '请求 ID 不能为空'),
});
export type AbortTranslationInput = z.infer<typeof abortTranslationInputSchema>;

export const wordSenseSchema = z.object({
  pos: z.string().min(1),
  def: z.string().min(1),
  example: z.string().min(1),
});
export type WordSense = z.infer<typeof wordSenseSchema>;

export const wordTranslationResultSchema = z.object({
  word: z.string().min(1),
  phonetic_us: z.string(),
  phonetic_uk: z.string().nullable(),
  context_sense: z.string().nullable(),
  context_snippet: z.string().nullable(),
  senses: z.array(wordSenseSchema).min(1).max(5),
  context_missing: z.boolean().optional(),
  example_missing: z.boolean().optional(),
});
export type WordTranslationResult = z.infer<typeof wordTranslationResultSchema>;

export const sentenceTranslationResultSchema = z.object({
  text: z.string(),
  untranslated: z.boolean().optional(),
  length_anomaly: z.boolean().optional(),
  placeholder_extra: z.boolean().optional(),
  placeholder_malformed: z.boolean().optional(),
  placeholder_mismatch: z.boolean().optional(),
});
export type SentenceTranslationResult = z.infer<typeof sentenceTranslationResultSchema>;
