import crypto from 'node:crypto';
import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { abortTranslationInputSchema, translationInputSchema } from '@app/shared/schemas/translate';
import type { Result } from '@app/shared/types/result';
import type {
  TranslationChunkEvent,
  TranslationErrorEvent,
  TranslationFinishEvent,
} from '@app/shared/types/translate';
import { AppError } from '../errors/AppError';
import { getLogManager } from '../modules/log.module';
import { translationHistoryService } from '../services/history.service';
import { translationService } from '../services/translation.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { failResult, successResult } from './utils';

// 维护进行中的请求与 AbortController，便于中途取消
interface ActiveRequestRecord {
  controller: AbortController;
  source?: 'card' | 'home';
}
const activeRequests = new Map<string, ActiveRequestRecord>();

export function abortTranslationsBySource(source: 'card' | 'home'): void {
  for (const [requestId, record] of activeRequests.entries()) {
    if (record.source === source) {
      record.controller.abort();
      activeRequests.delete(requestId);
    }
  }
}

export function abortAllTranslations(): void {
  for (const [requestId, record] of activeRequests.entries()) {
    record.controller.abort();
    activeRequests.delete(requestId);
  }
}

export function registerTranslationControllers(): void {
  handleTraced(
    IPC_CHANNELS.TRANSLATION_TRANSLATE,
    async (event, rawInput: unknown): Promise<Result<{ requestId: string }>> => {
      const parseResult = translationInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }

      const input = parseResult.data;
      const requestId = input.requestId || crypto.randomUUID();
      const abortController = new AbortController();
      activeRequests.set(requestId, {
        controller: abortController,
        source: input.source,
      });

      const sender = event.sender;

      // 异步执行流式翻译并在完成/错误时通知前端与统计耗时
      (async () => {
        const startTime = performance.now();
        let firstChunkTime: number | null = null;

        try {
          const result = await translationService.translate(input, {
            signal: abortController.signal,
            onChunk: (chunk: string) => {
              if (firstChunkTime === null) {
                firstChunkTime = performance.now() - startTime;
              }
              // 句子模式流式推送到前端；单词模式在完成时一次性渲染结构化结果
              if (input.mode === 'sentence' && !sender.isDestroyed()) {
                const chunkEvent: TranslationChunkEvent = { requestId, chunk };
                sender.send(IPC_CHANNELS.TRANSLATION_EVENT_CHUNK, chunkEvent);
              }
            },
          });

          const totalTime = performance.now() - startTime;
          const ttfbStr =
            firstChunkTime !== null ? (firstChunkTime as number).toFixed(0) : totalTime.toFixed(0);
          getLogManager()
            .scoped('TranslationController')
            .info(
              `Translation completed: id=${requestId}, mode=${result.mode}, total=${totalTime.toFixed(0)}ms, ttfb=${ttfbStr}ms`,
            );

          // 记录至内存共享最近 20 条翻译历史 (RM-04 / IA-14/15/26/27)
          translationHistoryService.addRecord({
            id: requestId,
            timestamp: Date.now(),
            source: input.source ?? 'home',
            mode: result.mode,
            text: input.text,
            context: input.context,
            result,
          });

          if (!sender.isDestroyed()) {
            const finishEvent: TranslationFinishEvent = { requestId, result };
            sender.send(IPC_CHANNELS.TRANSLATION_EVENT_FINISH, finishEvent);
          }
        } catch (err: unknown) {
          const totalTime = performance.now() - startTime;
          const errorMsg = err instanceof Error ? err.message : String(err);
          getLogManager()
            .scoped('TranslationController')
            .warn(
              `Translation failed: id=${requestId}, mode=${input.mode}, elapsed=${totalTime.toFixed(0)}ms, error=${errorMsg}`,
            );

          if (!sender.isDestroyed()) {
            const errorCode = err instanceof AppError ? err.code : ErrorCode.INTERNAL_ERROR;
            const errorEvent: TranslationErrorEvent = {
              requestId,
              error: errorMsg,
              code: errorCode,
            };
            sender.send(IPC_CHANNELS.TRANSLATION_EVENT_ERROR, errorEvent);
          }
        } finally {
          activeRequests.delete(requestId);
        }
      })();

      return successResult({ requestId });
    },
  );

  handleTraced(
    IPC_CHANNELS.TRANSLATION_ABORT,
    async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      const parseResult = abortTranslationInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }

      const { requestId } = parseResult.data;
      const record = activeRequests.get(requestId);
      if (record) {
        record.controller.abort();
        activeRequests.delete(requestId);
      }

      return successResult({ success: true });
    },
  );
}
