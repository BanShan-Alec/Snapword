import { EventEmitter } from 'node:events';
import { AppError } from '@app/main/errors/AppError';
import { UpdaterService } from '@app/main/services/updater.service';
import { ErrorCode } from '@app/shared/constants/error-codes';
import type { AppUpdater } from 'electron-updater';
import { describe, expect, it, vi } from 'vitest';

function createMockUpdater(overrides?: {
  checkForUpdates?: () => Promise<unknown>;
  downloadUpdate?: () => Promise<unknown>;
}): AppUpdater {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    checkForUpdates: overrides?.checkForUpdates ?? vi.fn().mockResolvedValue(null),
    downloadUpdate: overrides?.downloadUpdate ?? vi.fn().mockResolvedValue([]),
  }) as unknown as AppUpdater;
}

describe('UpdaterService error classification through public API', () => {
  it('adopts the code of a tagged AppError on check failure', async () => {
    const timeout = new AppError(
      '检查更新请求超时（15 秒），请检查网络连接后重试',
      ErrorCode.UPDATER_NETWORK_ERROR,
    );
    const mockUpdater = createMockUpdater({
      checkForUpdates: vi.fn().mockRejectedValue(timeout),
    });

    const service = new UpdaterService(mockUpdater);

    await expect(service.check()).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ErrorCode.UPDATER_NETWORK_ERROR);
      return true;
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('error');
    expect(snapshot.code).toBe(ErrorCode.UPDATER_NETWORK_ERROR);
  });

  it('classifies electron-updater network failures by net::ERR_ prefix', async () => {
    const netErr = new Error('Error: net::ERR_CONNECTION_TIMED_OUT');
    const mockUpdater = createMockUpdater({
      checkForUpdates: vi.fn().mockRejectedValue(netErr),
    });

    const service = new UpdaterService(mockUpdater);

    await expect(service.check()).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ErrorCode.UPDATER_NETWORK_ERROR);
      return true;
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('error');
    expect(snapshot.code).toBe(ErrorCode.UPDATER_NETWORK_ERROR);
  });

  it('falls back to UPDATER_CHECK_FAILED for unclassified check errors', async () => {
    const unclassified = new Error('ENOENT: no such file');
    const mockUpdater = createMockUpdater({
      checkForUpdates: vi.fn().mockRejectedValue(unclassified),
    });

    const service = new UpdaterService(mockUpdater);

    await expect(service.check()).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ErrorCode.UPDATER_CHECK_FAILED);
      return true;
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('error');
    expect(snapshot.code).toBe(ErrorCode.UPDATER_CHECK_FAILED);
  });

  it('handles non-Error throwables via fallback code', async () => {
    const mockUpdater = createMockUpdater({
      checkForUpdates: vi.fn().mockRejectedValue('raw string failure'),
    });

    const service = new UpdaterService(mockUpdater);

    await expect(service.check()).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ErrorCode.UPDATER_CHECK_FAILED);
      return true;
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('error');
    expect(snapshot.code).toBe(ErrorCode.UPDATER_CHECK_FAILED);
  });

  it('classifies download failures through download() interface', async () => {
    const downloadErr = new Error('sha256 checksum mismatch');
    const mockUpdater = createMockUpdater({
      downloadUpdate: vi.fn().mockRejectedValue(downloadErr),
    });

    const service = new UpdaterService(mockUpdater);
    service.mockEmit({ type: 'available', version: '2.0.0' });

    await expect(service.download()).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ErrorCode.UPDATER_DOWNLOAD_FAILED);
      return true;
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('error');
    expect(snapshot.code).toBe(ErrorCode.UPDATER_DOWNLOAD_FAILED);
  });
});
