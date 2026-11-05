import { getTrayMessages, resolveTrayLocale } from '@app/main/i18n/tray';
import { describe, expect, it } from 'vitest';

describe('tray i18n', () => {
  it('selects Chinese for any zh-* system locale', () => {
    expect(resolveTrayLocale('zh-CN')).toBe('zh-CN');
    expect(resolveTrayLocale('zh-TW')).toBe('zh-CN');
    expect(getTrayMessages('zh-CN')).toMatchObject({
      openMainWindow: '打开主窗口',
      quit: '退出',
    });
  });

  it('selects English for English system locales', () => {
    expect(resolveTrayLocale('en-US')).toBe('en');
    expect(resolveTrayLocale('en-GB')).toBe('en');
    expect(getTrayMessages('en-US')).toMatchObject({
      openMainWindow: 'Open Snapword',
      quit: 'Quit',
    });
  });

  it('falls back to Chinese for empty or unrecognized system locales', () => {
    expect(resolveTrayLocale('')).toBe('zh-CN');
    expect(resolveTrayLocale('fr-FR')).toBe('zh-CN');
    expect(getTrayMessages('')).toMatchObject({
      openMainWindow: '打开主窗口',
      quit: '退出',
    });
  });

  it('localizes capture-service failure notifications', () => {
    expect(getTrayMessages('zh-CN').captureServiceStartupFailed).toContain('取词服务未启动');
    expect(getTrayMessages('zh-CN').captureServiceCrashed).toContain('取词服务异常');
    expect(getTrayMessages('en-US').captureServiceStartupFailed).toContain('failed to start');
    expect(getTrayMessages('en-US').captureServiceCrashed).toContain('keeps crashing');
  });
});
