import { EventEmitter } from 'node:events';
import { appLifecycle } from '@app/main/lifecycle';
import { app } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { info } = vi.hoisted(() => ({ info: vi.fn<(message: string) => void>() }));

vi.mock('electron', () => {
  return { app: new EventEmitter() };
});

vi.mock('@app/main/modules/log.module', () => {
  return {
    getLogManager: () => ({
      scoped: () => ({ info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }),
  };
});

describe('App quit lifecycle logging', () => {
  beforeEach(() => {
    info.mockClear();
    appLifecycle.isQuitting = false;
  });

  it('keeps the D7 marker on the first attempt and labels later attempts as retries', () => {
    app.emit('before-quit');
    app.emit('before-quit');

    expect(info.mock.calls.map(([message]) => message)).toEqual([
      'App quitting',
      'App quitting retry (attempt 2): previous attempt did not complete',
    ]);
    expect(appLifecycle.isQuitting).toBe(true);
  });
});
