import { resolveLocale } from '@app/shared/constants/preferences';
import { describe, expect, it } from 'vitest';

describe('resolveLocale', () => {
  it('explicit modes win over the system locale', () => {
    expect(resolveLocale('zh-CN', 'en-US')).toBe('zh-CN');
    expect(resolveLocale('en', 'zh-CN')).toBe('en');
  });

  it('maps Chinese system locales to zh-CN', () => {
    expect(resolveLocale('system', 'zh-CN')).toBe('zh-CN');
    expect(resolveLocale('system', 'zh-TW')).toBe('zh-CN');
    expect(resolveLocale('system', 'zh-Hans-CN')).toBe('zh-CN');
  });

  it('maps English system locales to en', () => {
    expect(resolveLocale('system', 'en-GB')).toBe('en');
    expect(resolveLocale('system', 'en-US')).toBe('en');
  });

  it('falls back to zh-CN (FR-49) for unrecognized system locales', () => {
    expect(resolveLocale('system', 'fr-FR')).toBe('zh-CN');
    expect(resolveLocale('system', '')).toBe('zh-CN');
  });
});
