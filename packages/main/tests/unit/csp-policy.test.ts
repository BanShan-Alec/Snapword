import { describe, expect, it } from 'vitest';
import { buildCspPolicy, shouldInjectCsp } from '../../src/modules/security/csp-policy';

describe('CSP policy', () => {
  it('tightens the policy in production without unsafe-eval', () => {
    const policy = buildCspPolicy({ isDev: false, apiOrigin: null });

    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('frame-src');
  });

  it('keeps unsafe-eval and broad https in development', () => {
    const policy = buildCspPolicy({ isDev: true, apiOrigin: null });

    expect(policy).toContain('unsafe-eval');
    expect(policy).toContain('https:');
  });

  it('adds the API origin to connect-src when configured', () => {
    const policy = buildCspPolicy({
      isDev: false,
      apiOrigin: 'https://api.example.com',
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
