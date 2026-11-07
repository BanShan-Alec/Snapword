import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '@app/main/modules/config.module';
import * as logModule from '@app/main/modules/log.module';
import { DEFAULT_CONFIG } from '@app/shared/schemas/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ConfigStore', () => {
  let dataDir: string;
  let scopedWarn: ReturnType<typeof vi.fn>;
  let scopedError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-store-test-'));
    // LogManager 构造含 electron-log 副作用，单测中拦截为纯 stub
    scopedWarn = vi.fn();
    scopedError = vi.fn();
    vi.spyOn(logModule, 'getLogManager').mockReturnValue({
      scoped: () => ({
        warn: scopedWarn,
        info: vi.fn(),
        error: scopedError,
        debug: vi.fn(),
      }),
    } as unknown as logModule.LogManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const writeConfigFile = (content: string): void => {
    fs.writeFileSync(path.join(dataDir, 'config.json'), content, 'utf-8');
  };

  const readConfigFile = (): string => fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8');

  it('returns defaults when config file does not exist', () => {
    const store = new ConfigStore(dataDir);
    expect(store.getAll()).toEqual(DEFAULT_CONFIG);
  });

  it('loads valid values and fills missing keys from zod defaults', () => {
    writeConfigFile(JSON.stringify({ theme: 'dark' }));
    const store = new ConfigStore(dataDir);
    expect(store.get('theme')).toBe('dark');
    expect(store.get('language')).toBe(DEFAULT_CONFIG.language);
    expect(store.get('minimizeToTray')).toBe(true);
    expect(store.get('closeBehaviorConfirmed')).toBe(false);
  });

  it('falls back to defaults entirely when any field is invalid', () => {
    writeConfigFile(JSON.stringify({ theme: 'dark', language: 'en-US', serverCounter: 1.5 }));
    const store = new ConfigStore(dataDir);
    expect(store.getAll()).toEqual(DEFAULT_CONFIG);
    // 重置必须打 error 日志并写明触发原因
    expect(scopedError).toHaveBeenCalledOnce();
    expect(scopedError.mock.calls[0][0]).toContain('schema validation');
    // 检验失败即重置：默认值立即写回覆盖坏文件
    expect(JSON.parse(readConfigFile())).toEqual(DEFAULT_CONFIG);
  });

  it('resets corrupted JSON file to defaults', () => {
    writeConfigFile('{ not valid json !!');
    const store = new ConfigStore(dataDir);
    expect(store.getAll()).toEqual(DEFAULT_CONFIG);
    expect(scopedError).toHaveBeenCalledOnce();
    expect(scopedError.mock.calls[0][0]).toContain('not valid JSON');
    expect(JSON.parse(readConfigFile())).toEqual(DEFAULT_CONFIG);
    store.set({ theme: 'dark' });
    expect(JSON.parse(readConfigFile())).toEqual({
      ...DEFAULT_CONFIG,
      theme: 'dark',
    });
  });

  it('rejects invalid set() input without mutating state or disk', () => {
    const store = new ConfigStore(dataDir);
    store.set({ theme: 'dark' });
    const rejected = store.set({ serverCounter: 1.5 });
    expect(rejected).toEqual({ ...DEFAULT_CONFIG, theme: 'dark' });
    expect(store.get('theme')).toBe('dark');
    expect(scopedWarn).toHaveBeenCalled();
    expect(JSON.parse(readConfigFile())).toEqual({
      ...DEFAULT_CONFIG,
      theme: 'dark',
    });
  });

  it('persists set() to disk and survives reload', () => {
    const store = new ConfigStore(dataDir);
    store.set({ theme: 'dark', serverCounter: 42 });
    const reloaded = new ConfigStore(dataDir);
    expect(reloaded.get('theme')).toBe('dark');
    expect(reloaded.get('serverCounter')).toBe(42);
  });

  it('reset() writes defaults back to disk', () => {
    const store = new ConfigStore(dataDir);
    store.set({ theme: 'dark' });
    store.reset();
    expect(store.getAll()).toEqual(DEFAULT_CONFIG);
    expect(JSON.parse(readConfigFile())).toEqual(DEFAULT_CONFIG);
  });

  it('replaces whole file on write, wiping stale keys', () => {
    writeConfigFile(JSON.stringify({ theme: 'dark', legacyKey: 'x' }));
    const store = new ConfigStore(dataDir);
    store.set({ minimizeToTray: false });
    const onDisk = JSON.parse(readConfigFile());
    expect(onDisk).toEqual({
      ...DEFAULT_CONFIG,
      theme: 'dark',
      minimizeToTray: false,
    });
    expect('legacyKey' in onDisk).toBe(false);
  });

  it('isolates customDir instances from each other', () => {
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-store-test-'));
    try {
      const storeA = new ConfigStore(dataDir);
      storeA.set({ theme: 'dark' });
      const storeB = new ConfigStore(otherDir);
      expect(storeB.getAll()).toEqual(DEFAULT_CONFIG);
    } finally {
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });
});
