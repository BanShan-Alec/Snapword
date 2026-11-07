import { AppError } from '@app/main/errors/AppError';
import { classifyUpdaterError } from '@app/main/services/updater-classify';
import { ErrorCode } from '@app/shared/constants/error-codes';
import { describe, expect, it } from 'vitest';

describe('classifyUpdaterError', () => {
  it('adopts the code of a tagged AppError (timeout rejection)', () => {
    const timeout = new AppError(
      '检查更新请求超时（15 秒），请检查网络连接后重试',
      ErrorCode.UPDATER_NETWORK_ERROR,
    );
    expect(classifyUpdaterError(timeout, ErrorCode.UPDATER_CHECK_FAILED)).toBe(
      ErrorCode.UPDATER_NETWORK_ERROR,
    );
  });

  it('classifies electron-updater network failures by net::ERR_ message prefix', () => {
    const err = new Error('Error: net::ERR_CONNECTION_TIMED_OUT');
    expect(classifyUpdaterError(err, ErrorCode.UPDATER_CHECK_FAILED)).toBe(
      ErrorCode.UPDATER_NETWORK_ERROR,
    );
    expect(classifyUpdaterError(err, ErrorCode.UPDATER_DOWNLOAD_FAILED)).toBe(
      ErrorCode.UPDATER_NETWORK_ERROR,
    );
  });

  it('falls back to the stage code for unclassified errors', () => {
    expect(
      classifyUpdaterError(new Error('ENOENT: no such file'), ErrorCode.UPDATER_CHECK_FAILED),
    ).toBe(ErrorCode.UPDATER_CHECK_FAILED);
    expect(
      classifyUpdaterError(
        new Error('sha256 checksum mismatch'),
        ErrorCode.UPDATER_DOWNLOAD_FAILED,
      ),
    ).toBe(ErrorCode.UPDATER_DOWNLOAD_FAILED);
  });

  it('handles non-Error throwables via fallback', () => {
    expect(classifyUpdaterError('raw string failure', ErrorCode.UPDATER_CHECK_FAILED)).toBe(
      ErrorCode.UPDATER_CHECK_FAILED,
    );
    expect(classifyUpdaterError(undefined, ErrorCode.UPDATER_DOWNLOAD_FAILED)).toBe(
      ErrorCode.UPDATER_DOWNLOAD_FAILED,
    );
  });
});
