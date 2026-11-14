import type { SentenceTranslationResult, WordTranslationResult } from '../schemas/translate';

export type TranslationResult =
  | { mode: 'word'; data: WordTranslationResult }
  | { mode: 'sentence'; data: SentenceTranslationResult };

export interface TranslationChunkEvent {
  requestId: string;
  chunk: string;
}

export interface TranslationFinishEvent {
  requestId: string;
  result: TranslationResult;
}

export interface TranslationErrorEvent {
  requestId: string;
  error: string;
  code?: string;
}
