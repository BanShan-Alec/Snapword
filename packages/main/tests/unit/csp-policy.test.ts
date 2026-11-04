import { describe, expect, it } from 'vitest';
import { buildCspPolicy, shouldInjectCsp } from '../../src/modules/security/csp-policy';

const DOCS_ORIGIN = 'https://docs.example.com';

describe('CSP policy', () => {
  it('allows the docs origin in frame-src in production', () => {
    const policy = buildCspPolicy({ isDev: false, apiOrigin: null, docsOrigin: DOCS_ORIGIN });

    expect(policy).toContain(`frame-src ${DOCS_ORIGIN};`);
    expect(policy).not.toContain('unsafe-eval');
  });

  it('keeps unsafe-eval and broad https in development', () => {
    const policy = buildCspPolicy({ isDev: true, apiOrigin: null, docsOrigin: DOCS_ORIGIN });

    expect(policy).toContain('unsafe-eval');
    expect(policy).toContain('https:');
  });

  it('adds the API origin to connect-src when configured', () => {
    const policy = buildCspPolicy({
      isDev: false,
      apiOrigin: 'https://api.example.com',
      docsOrigin: DOCS_ORIGIN,
    });

    expect(policy).toContain("connect-src 'self' https://api.example.com;");
  });
});

describe('CSP injection scope', () => {
  it('only injects into the main frame', () => {
    expect(shouldInjectCsp('mainFrame')).toBe(true);
    expect(shouldInjectCsp('subFrame')).toBe(false);
    expect(shouldInjectCsp('script')).toBe(false);
    expect(shouldInjectCsp(undefined)).toBe(false);
  });
});
