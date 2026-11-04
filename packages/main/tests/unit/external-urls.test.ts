import { ALLOWED_EXTERNAL_URLS } from '@app/shared/constants/security';
import { describe, expect, it } from 'vitest';
import { ExternalUrls, isAllowedExternalUrl } from '../../src/modules/security/external-urls';

describe('external-urls security policy', () => {
  it('blocks every origin while the external-url allowlist is empty (P4 skeleton)', () => {
    // 实例化模块以注入全局白名单
    new ExternalUrls(new Set(ALLOWED_EXTERNAL_URLS));

    // P4 骨架白名单为空集：任何外链 origin 都不允许经 shell.openExternal 打开
    expect(ALLOWED_EXTERNAL_URLS).toHaveLength(0);
    expect(isAllowedExternalUrl('https://github.com/BanShan-Alec')).toBe(false);
    expect(isAllowedExternalUrl('https://example.com')).toBe(false);
    expect(isAllowedExternalUrl('https://malicious-site.org/hack')).toBe(false);

    // 非 http/https 协议一律拦截
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('data:text/html,test')).toBe(false);
    expect(isAllowedExternalUrl('not-a-valid-url')).toBe(false);
  });
});
