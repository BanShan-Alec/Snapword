import { resolveLocale } from '@app/shared/constants/preferences';
import { describe, expect, it } from 'vitest';

describe('resolveLocale', () => {
  it('explicit modes win over the system locale', () => {
    expect(resolveLocale('zh-CN', 'en-US')).toBe('zh-CN');
    expect(resolveLocale('en-US', 'zh-CN')).toBe('en-US');
  });

  it('maps Chinese system locales to zh-CN', () => {
    expect(resolveLocale('system', 'zh-CN')).toBe('zh-CN');
    expect(resolveLocale('system', 'zh-TW')).toBe('zh-CN');
    expect(resolveLocale('system', 'zh-Hans-CN')).toBe('zh-CN');
  });

  it('maps other system locales to en-US', () => {
    expect(resolveLocale('system', 'en-GB')).toBe('en-US');
    expect(resolveLocale('system', 'fr-FR')).toBe('en-US');
  });

  it('falls back to zh-CN when the system locale is unavailable', () => {
    expect(resolveLocale('system', '')).toBe('zh-CN');
  });
});
