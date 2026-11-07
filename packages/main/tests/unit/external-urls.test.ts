import { PROJECT_DOCS_URL } from '@app/shared/constants/docs';
import { ALLOWED_EXTERNAL_URLS } from '@app/shared/constants/security';
import { describe, expect, it } from 'vitest';
import { ExternalUrls, isAllowedExternalUrl } from '../../src/modules/security/external-urls';

describe('external-urls security policy', () => {
  it('allows URLs from allowed origins in ALLOWED_EXTERNAL_URLS', () => {
    // 实例化模块以注入全局白名单
    new ExternalUrls(new Set(ALLOWED_EXTERNAL_URLS));

    // 项目文档站白名单
    expect(isAllowedExternalUrl(PROJECT_DOCS_URL)).toBe(true);

    // 已有的 GitHub / Vite / React 白名单
    expect(isAllowedExternalUrl('https://github.com/BanShan-Alec')).toBe(true);
    expect(isAllowedExternalUrl('https://vite.dev/guide/')).toBe(true);
    expect(isAllowedExternalUrl('https://react.dev/reference/react')).toBe(true);

    // 未在白名单内的域名拦截
    expect(isAllowedExternalUrl('https://example.com')).toBe(false);
    expect(isAllowedExternalUrl('https://malicious-site.org/hack')).toBe(false);

    // 非 http/https 协议一律拦截
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('data:text/html,test')).toBe(false);
    expect(isAllowedExternalUrl('not-a-valid-url')).toBe(false);
  });
});
