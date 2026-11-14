import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type {
  ListWordsInput,
  ListWordsResult,
  SaveWordInput,
  SaveWordResult,
} from '@app/shared/schemas/vocabulary';
import { normalizeWord, type VocabularyRecord, VocabularyRepository } from '../db/repository';
import { broadcast } from '../modules/window/window-registry';
import { formatVocabularyCsv } from './vocabulary-csv';

export class VocabularyService {
  constructor(private readonly repository: VocabularyRepository = new VocabularyRepository()) {}

  saveWord(input: SaveWordInput): SaveWordResult {
    const normalizedInput = {
      ...input,
      senses: input.senses.map((s) => ({
        pos: s.pos,
        def: s.def,
        example: s.example ?? '',
      })),
    };
    const result = this.repository.upsertWord(normalizedInput);
    const count = this.repository.countWords();
    this.broadcastChanged({
      action: 'save',
      word: result.record.word,
      isNew: result.isNew,
      count,
    });
    return result;
  }

  listWords(input?: ListWordsInput): ListWordsResult {
    const items = this.repository.getWords({
      limit: input?.limit,
      offset: input?.offset,
      tag: input?.tag,
      search: input?.search,
      sort: input?.sort,
    });
    const total = this.repository.countWords({
      tag: input?.tag,
      search: input?.search,
    });
    return { items, total };
  }

  getByWord(word: string): VocabularyRecord | null {
    if (!word?.trim()) return null;
    return this.repository.getWordByNorm(normalizeWord(word));
  }

  getCount(): { count: number } {
    return { count: this.repository.countWords() };
  }

  deleteWord(id: number | number[]): { batchId: string; affectedCount: number } {
    const res = this.repository.softDeleteWord(id);
    const count = this.repository.countWords();
    this.broadcastChanged({
      action: 'delete',
      batchId: res.batchId,
      affectedCount: res.affectedCount,
      count,
    });
    return res;
  }

  undoDelete(batchId: string): { restoredCount: number } {
    const res = this.repository.undoBatch(batchId);
    const count = this.repository.countWords();
    this.broadcastChanged({
      action: 'undo',
      batchId,
      restoredCount: res.restoredCount,
      count,
    });
    return res;
  }

  clearAll(): { batchId: string; affectedCount: number } {
    const res = this.repository.softDeleteAll();
    const count = this.repository.countWords();
    this.broadcastChanged({
      action: 'clear',
      batchId: res.batchId,
      affectedCount: res.affectedCount,
      count,
    });
    return res;
  }

  exportCsv(): { csv: string; count: number } {
    const words = this.repository.getAllLiveWords();
    const csv = formatVocabularyCsv(words);
    return { csv, count: words.length };
  }

  private broadcastChanged(payload: unknown): void {
    try {
      broadcast(IPC_CHANNELS.VOCABULARY_EVENT_CHANGED, payload);
    } catch {
      // 容错在单元测试或无窗口环境运行
    }
  }
}

export const vocabularyService = new VocabularyService();
