import { ErrorCode } from '@app/shared/constants/error-codes';
import type { Result } from '@app/shared/types/result';
import { AppError } from '../errors/AppError';

export function failResult(error: string, code: string = ErrorCode.INTERNAL_ERROR): Result<never> {
  return { success: false, error, code };
}

export function successResult<T>(data: T): Result<T> {
  return { success: true, data };
}

export function catchToResult(err: unknown): Result<never> {
  if (err instanceof AppError) {
    return { success: false, error: err.message, code: err.code };
  }
  if (err instanceof Error) {
    return { success: false, error: err.message, code: ErrorCode.INTERNAL_ERROR };
  }
  return { success: false, error: String(err), code: ErrorCode.INTERNAL_ERROR };
}
