import { z } from 'zod';

export const vocabularySenseSchema = z.object({
  pos: z.string().min(1),
  def: z.string().min(1),
  example: z.string().optional(),
});
export type VocabularySense = z.infer<typeof vocabularySenseSchema>;

export const saveWordInputSchema = z.object({
  word: z.string().min(1, '单词不能为空').max(120, '单词超出长度限制'),
  phoneticUs: z.string().max(120).optional(),
  phoneticUk: z.string().max(120).nullable().optional(),
  contextSense: z.string().max(1000).nullable().optional(),
  contextSnippet: z.string().max(300).nullable().optional(),
  senses: z.array(vocabularySenseSchema).min(1, '至少包含一个释义').max(5, '释义最多 5 条'),
  sourceTitle: z.string().max(300).nullable().optional(),
  sourceDomain: z.string().max(255).nullable().optional(),
  tags: z.array(z.string().max(32)).max(5).optional(),
  originDevice: z.string().optional(),
});
export type SaveWordInput = z.infer<typeof saveWordInputSchema>;

export const listWordsInputSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['time', 'alpha']).optional(),
});
export type ListWordsInput = z.infer<typeof listWordsInputSchema>;

export const deleteWordInputSchema = z.object({
  id: z.union([z.number().int(), z.array(z.number().int())]),
});
export type DeleteWordInput = z.infer<typeof deleteWordInputSchema>;

export const undoDeleteInputSchema = z.object({
  batchId: z.string().min(1, '撤销批次 ID 不能为空'),
});
export type UndoDeleteInput = z.infer<typeof undoDeleteInputSchema>;

export interface VocabularyRecordDto {
  id: number;
  word: string;
  wordNorm: string;
  phoneticUs: string;
  phoneticUk: string | null;
  contextSense: string | null;
  contextSnippet: string | null;
  senses: VocabularySense[];
  sourceTitle: string | null;
  sourceDomain: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  rev: number;
  deletedAt: string | null;
  deletedBatch: string | null;
  originDevice: string;
}

export interface ListWordsResult {
  items: VocabularyRecordDto[];
  total: number;
}

export interface SaveWordResult {
  record: VocabularyRecordDto;
  isNew: boolean;
}
