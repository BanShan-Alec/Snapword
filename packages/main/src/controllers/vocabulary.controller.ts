import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import {
  deleteWordInputSchema,
  getByWordSchema,
  type ListWordsResult,
  listWordsInputSchema,
  type SaveWordResult,
  saveWordInputSchema,
  undoDeleteInputSchema,
  type VocabularyRecordDto,
} from '@app/shared/schemas/vocabulary';
import type { Result } from '@app/shared/types/result';
import { vocabularyService } from '../services/vocabulary.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerVocabularyControllers(): void {
  handleTraced(
    IPC_CHANNELS.VOCABULARY_SAVE,
    async (_event, rawInput: unknown): Promise<Result<SaveWordResult>> => {
      const parseResult = saveWordInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const res = vocabularyService.saveWord(parseResult.data);
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.VOCABULARY_LIST,
    async (_event, rawInput: unknown): Promise<Result<ListWordsResult>> => {
      const parseResult = listWordsInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const res = vocabularyService.listWords(parseResult.data);
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.VOCABULARY_GET_BY_WORD,
    async (_event, rawInput: unknown): Promise<Result<VocabularyRecordDto | null>> => {
      const parseResult = getByWordSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const record = vocabularyService.getByWord(parseResult.data.word);
        return successResult(record);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(IPC_CHANNELS.VOCABULARY_COUNT, async (): Promise<Result<{ count: number }>> => {
    try {
      const res = vocabularyService.getCount();
      return successResult(res);
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(
    IPC_CHANNELS.VOCABULARY_DELETE,
    async (
      _event,
      rawInput: unknown,
    ): Promise<Result<{ batchId: string; affectedCount: number }>> => {
      const parseResult = deleteWordInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const res = vocabularyService.deleteWord(parseResult.data.id);
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.VOCABULARY_UNDO_DELETE,
    async (_event, rawInput: unknown): Promise<Result<{ restoredCount: number }>> => {
      const parseResult = undoDeleteInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const res = vocabularyService.undoDelete(parseResult.data.batchId);
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.VOCABULARY_CLEAR,
    async (): Promise<Result<{ batchId: string; affectedCount: number }>> => {
      try {
        const res = vocabularyService.clearAll();
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.VOCABULARY_EXPORT_CSV,
    async (): Promise<Result<{ csv: string; count: number }>> => {
      try {
        const res = vocabularyService.exportCsv();
        return successResult(res);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );
}
