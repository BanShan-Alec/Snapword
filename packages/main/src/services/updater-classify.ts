import type { ErrorCodeType } from '@app/shared/constants/error-codes';
import { ErrorCode } from '@app/shared/constants/error-codes';
import { AppError } from '../errors/AppError';

/**
 * updater 失败语义分类：AppError 直接采纳其 code（15s 超时 rejection 在创建处已打标
 * UPDATER_NETWORK_ERROR，无需字符串识别）；electron-updater 抛出的网络层错误按
 * message 特征（net::ERR_*）归为网络类；其余落调用方按阶段给定的兜底码。
 */
export function classifyUpdaterError(err: unknown, fallback: ErrorCodeType): ErrorCodeType {
  if (err instanceof AppError) {
    return err.code as ErrorCodeType;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('net::ERR_')) {
    return ErrorCode.UPDATER_NETWORK_ERROR;
  }
  return fallback;
}
