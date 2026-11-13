import { ErrorCode } from '@app/shared/constants/error-codes';
import type { SpanContext, TracedIpcPayload } from '@app/shared/types/telemetry';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import { getLogManager } from '../modules/log.module';
import { getWindowName } from '../modules/window/window-registry';
import { getTracer } from './tracer';

export type TracedHandler<T = unknown, R = unknown> = (
  event: IpcMainInvokeEvent,
  data: T,
  windowName?: string,
) => Promise<R> | R;

/**
 * 判断入参是否符合 TracedIpcPayload 包装规范
 */
export function isTracedIpcPayload<T = unknown>(value: unknown): value is TracedIpcPayload<T> {
  return (
    typeof value === 'object' && value !== null && '__trace_carrier' in value && 'data' in value
  );
}

/**
 * 包装 ipcMain.handle，实现请求链路追踪与上下文自动透传。
 * 规范：所有业务 IPC 通道必须经由本函数注册；
 * 架构豁免：DIAGNOSTICS_LOG（日志落盘底层管道）除外，避免每行日志落盘产生 span 导致遥测递归自噪。
 */
export function handleTraced<T = unknown, R = unknown>(
  channel: string,
  handler: TracedHandler<T, R>,
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, rawInput: unknown): Promise<R> => {
    const tracer = getTracer();
    let data: T;
    let parentContext: SpanContext | undefined;
    let recordSuccess = true;

    if (isTracedIpcPayload<T>(rawInput)) {
      data = rawInput.data;
      recordSuccess = rawInput.callOptions?.recordSuccess !== false;
      if (rawInput.__trace_carrier) {
        parentContext = tracer.extract(
          rawInput.__trace_carrier as Record<string, string | undefined>,
        );
      }
    } else {
      // 兼容非包装调用的降级处理
      data = rawInput as T;
    }

    const senderWin = event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const windowId = senderWin?.id;
    const windowName = senderWin ? getWindowName(senderWin) : undefined;

    return tracer.startActiveSpan(
      `ipc.receive:${channel}`,
      {
        parentContext,
        recordSuccess,
        attributes: {
          'ipc.channel': channel,
          'rpc.system': 'electron-ipc',
          ...(windowId !== undefined ? { 'window.id': windowId } : {}),
          ...(windowName ? { 'window.name': windowName } : {}),
        },
      },
      async (span) => {
        const winTag = windowName ? `[${windowName}] ` : windowId ? `[win#${windowId}] ` : '';
        // 成功记录关闭时，跳过轮询的调试行；失败仍由下面的错误日志记录。
        if (recordSuccess) getLogManager().scoped('IPC').debug(`${winTag}Handling ${channel}`);
        const startedAt = performance.now();
        try {
          const result = await handler(event, data, windowName);
          const durationMs = performance.now() - startedAt;
          const cost = `${durationMs.toFixed(1)}ms`;

          // 若业务返回了 Result 结构体，可辅助记录业务结果状态并注入 traceId
          if (
            result &&
            typeof result === 'object' &&
            'success' in result &&
            typeof (result as { success: unknown }).success === 'boolean'
          ) {
            const res = result as {
              success: boolean;
              error?: string;
              code?: string;
              traceId?: string;
            };
            // 采用浅克隆注入 traceId，避免直接修改业务返回对象造成潜在副作用
            const enrichedResult = {
              ...res,
              traceId: span.context.traceId,
            };

            span.setAttributes({
              'app.result_success': enrichedResult.success,
              ...(enrichedResult.code ? { 'app.result_code': enrichedResult.code } : {}),
            });

            if (!enrichedResult.success) {
              if (enrichedResult.error) {
                span.addEvent('business_error', {
                  'error.message': enrichedResult.error,
                  ...(enrichedResult.code ? { 'error.code': enrichedResult.code } : {}),
                });
              }
              const isInternalError =
                !enrichedResult.code || enrichedResult.code === ErrorCode.INTERNAL_ERROR;
              const logMsg = `${winTag}${channel} failed (${cost}): ${enrichedResult.error ?? 'Unknown error'}${enrichedResult.code ? ` [code: ${enrichedResult.code}]` : ''}`;
              // 业务失败统一设置 span 状态为 ERROR，以便监控看板如实体现
              span.setStatus('ERROR');
              if (isInternalError) {
                getLogManager().scoped('IPC').error(logMsg);
              } else {
                getLogManager().scoped('IPC').warn(logMsg);
              }
            }
            return enrichedResult as unknown as R;
          }
          return result;
        } catch (err) {
          const durationMs = performance.now() - startedAt;
          const cost = `${durationMs.toFixed(1)}ms`;
          span.setStatus('ERROR');
          getLogManager()
            .scoped('IPC')
            .error(`${winTag}${channel} threw uncaught error (${cost}):`, err);
          throw err;
        }
      },
    );
  });
}
