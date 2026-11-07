import { EventEmitter } from 'node:events';
import { ContentSecurityPolicyModule } from '@app/main/modules/security/csp';
import { PROJECT_DOCS_ORIGIN } from '@app/shared/constants/docs';
import { session } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  return {
    app: {
      isPackaged: false,
      getPath: vi.fn(() => ''),
      getName: vi.fn(() => 'test-app'),
      getVersion: vi.fn(() => '1.0.0'),
      isReady: vi.fn(() => true),
    },
    session: {
      defaultSession: {
        webRequest: {
          onHeadersReceived: vi.fn(),
        },
      },
    },
  };
});

type HeadersReceivedDetails = {
  responseHeaders: Record<string, string | string[]>;
  resourceType?: string;
};

describe('ContentSecurityPolicyModule', () => {
  let mockApp: EventEmitter;
  let onHeadersReceivedSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApp = new EventEmitter();
    onHeadersReceivedSpy = session.defaultSession.webRequest
      .onHeadersReceived as unknown as ReturnType<typeof vi.fn>;
    onHeadersReceivedSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers onHeadersReceived when app is ready', () => {
    const cspModule = new ContentSecurityPolicyModule();
    cspModule.enable({
      app: mockApp as unknown as Electron.App,
    } as unknown as import('@app/main/ModuleContext').ModuleContext);

    expect(onHeadersReceivedSpy).not.toHaveBeenCalled();

    mockApp.emit('ready');

    expect(onHeadersReceivedSpy).toHaveBeenCalledTimes(1);
  });

  it('applies tightened CSP header on intercepted responses in production mode', () => {
    const originalProd = import.meta.env.PROD;
    try {
      (import.meta.env as { PROD: boolean }).PROD = true;
      const cspModule = new ContentSecurityPolicyModule();
      cspModule.enable({
        app: mockApp as unknown as Electron.App,
      } as unknown as import('@app/main/ModuleContext').ModuleContext);

      mockApp.emit('ready');

      const listener = onHeadersReceivedSpy.mock.calls[0][0] as (
        details: HeadersReceivedDetails,
        callback: (response: { responseHeaders: Record<string, string | string[]> }) => void,
      ) => void;

      let callbackResult: { responseHeaders: Record<string, string | string[]> } | undefined;
      listener({ responseHeaders: {}, resourceType: 'mainFrame' }, (res) => {
        callbackResult = res;
      });

      expect(callbackResult).toBeDefined();
      const cspHeaders = callbackResult?.responseHeaders['Content-Security-Policy'];
      expect(cspHeaders).toBeDefined();
      expect(Array.isArray(cspHeaders)).toBe(true);

      const activePolicy = (cspHeaders as string[])[0];
      expect(activePolicy).toBe(
        `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src ${PROJECT_DOCS_ORIGIN};`,
      );
      expect(activePolicy).toContain("script-src 'self' 'unsafe-inline'");
      expect(activePolicy).not.toContain("'unsafe-eval'");
      expect(activePolicy).not.toContain('ws:');
    } finally {
      (import.meta.env as { PROD: boolean }).PROD = originalProd;
    }
  });

  it('does not inject CSP into subframes', () => {
    const cspModule = new ContentSecurityPolicyModule();
    cspModule.enable({
      app: mockApp as unknown as Electron.App,
    } as unknown as import('@app/main/ModuleContext').ModuleContext);

    mockApp.emit('ready');

    const listener = onHeadersReceivedSpy.mock.calls[0][0] as (
      details: HeadersReceivedDetails,
      callback: (response: { responseHeaders: Record<string, string | string[]> }) => void,
    ) => void;

    let callbackResult: { responseHeaders: Record<string, string | string[]> } | undefined;
    listener({ responseHeaders: {}, resourceType: 'subFrame' }, (res) => {
      callbackResult = res;
    });

    expect(callbackResult).toBeDefined();
    expect(callbackResult?.responseHeaders['Content-Security-Policy']).toBeUndefined();
  });

  it('dynamically injects valid API_BASE_URL origin into production connect-src', () => {
    const originalProd = import.meta.env.PROD;
    const originalApiBaseUrl = process.env.APP_API_BASE_URL;
    try {
      (import.meta.env as { PROD: boolean }).PROD = true;
      process.env.APP_API_BASE_URL = 'https://api.example.com/v1';

      const cspModule = new ContentSecurityPolicyModule();
      cspModule.enable({
        app: mockApp as unknown as Electron.App,
      } as unknown as import('@app/main/ModuleContext').ModuleContext);

      mockApp.emit('ready');

      const listener = onHeadersReceivedSpy.mock.calls[0][0] as (
        details: HeadersReceivedDetails,
        callback: (response: { responseHeaders: Record<string, string | string[]> }) => void,
      ) => void;

      let callbackResult: { responseHeaders: Record<string, string | string[]> } | undefined;
      listener({ responseHeaders: {}, resourceType: 'mainFrame' }, (res) => {
        callbackResult = res;
      });

      const cspHeaders = callbackResult?.responseHeaders['Content-Security-Policy'];
      const activePolicy = (cspHeaders as string[])[0];
      expect(activePolicy).toContain("connect-src 'self' https://api.example.com;");
    } finally {
      (import.meta.env as { PROD: boolean }).PROD = originalProd;
      if (originalApiBaseUrl !== undefined) {
        process.env.APP_API_BASE_URL = originalApiBaseUrl;
      } else {
        delete process.env.APP_API_BASE_URL;
      }
    }
  });

  it('applies dev CSP header with unsafe-eval and ws in development mode', () => {
    const originalProd = import.meta.env.PROD;
    try {
      (import.meta.env as { PROD: boolean }).PROD = false;
      const cspModule = new ContentSecurityPolicyModule();
      cspModule.enable({
        app: mockApp as unknown as Electron.App,
      } as unknown as import('@app/main/ModuleContext').ModuleContext);

      mockApp.emit('ready');

      const listener = onHeadersReceivedSpy.mock.calls[0][0] as (
        details: HeadersReceivedDetails,
        callback: (response: { responseHeaders: Record<string, string | string[]> }) => void,
      ) => void;

      let callbackResult: { responseHeaders: Record<string, string | string[]> } | undefined;
      listener({ responseHeaders: {}, resourceType: 'mainFrame' }, (res) => {
        callbackResult = res;
      });

      expect(callbackResult).toBeDefined();
      const cspHeaders = callbackResult?.responseHeaders['Content-Security-Policy'];
      expect(cspHeaders).toBeDefined();
      const activePolicy = (cspHeaders as string[])[0];
      expect(activePolicy).toBe(
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http: ws:;",
      );
      expect(activePolicy).toContain("'unsafe-eval'");
      expect(activePolicy).toContain('https:');
      expect(activePolicy).toContain('ws:');
    } finally {
      (import.meta.env as { PROD: boolean }).PROD = originalProd;
    }
  });

  it('preserves and appends to existing Content-Security-Policy headers', () => {
    const cspModule = new ContentSecurityPolicyModule();
    cspModule.enable({
      app: mockApp as unknown as Electron.App,
    } as unknown as import('@app/main/ModuleContext').ModuleContext);

    mockApp.emit('ready');

    const listener = onHeadersReceivedSpy.mock.calls[0][0] as (
      details: HeadersReceivedDetails,
      callback: (response: { responseHeaders: Record<string, string | string[]> }) => void,
    ) => void;

    let callbackResult: { responseHeaders: Record<string, string | string[]> } | undefined;
    listener(
      {
        responseHeaders: { 'content-security-policy': 'existing-header' },
        resourceType: 'mainFrame',
      },
      (res) => {
        callbackResult = res;
      },
    );

    expect(callbackResult).toBeDefined();
    const headers = callbackResult?.responseHeaders['content-security-policy'];
    expect(Array.isArray(headers)).toBe(true);
    expect(headers).toContain('existing-header');
    expect((headers as string[]).length).toBe(2);
  });
});
