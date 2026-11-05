import { APP_ENV } from '@app/shared/constants/env';
import type { AppRuntimeEnv } from '@app/shared/types/env';
import { APP_ENV_ARG_PREFIX, packRuntimeEnv, unpackRuntimeEnv } from '@app/shared/utils/env-packer';
import { describe, expect, it } from 'vitest';

describe('env-packer Codec', () => {
  it('correctly packs and unpacks full runtime env roundtrip', () => {
    const original: AppRuntimeEnv = {
      mode: APP_ENV.PRODUCTION,
      appVersion: '1.2.0',
      appName: 'Electron React Template',
      channel: 'stable',
      systemCode: 'ERP-CORE',
    };

    const packed = packRuntimeEnv(original);
    expect(packed).toBeTypeOf('string');
    expect(packed.length).toBeGreaterThan(0);
    // 确保没有明文字段泄露
    expect(packed).not.toContain('production');
    expect(packed).not.toContain('ERP-CORE');
    expect(packed).not.toContain('systemCode');

    const unpacked = unpackRuntimeEnv(packed);
    expect(unpacked).toEqual(original);
  });

  it('handles optional undefined fields correctly', () => {
    const minimal: AppRuntimeEnv = {
      mode: APP_ENV.TEST,
      appVersion: '0.0.1',
      appName: 'test-app',
    };

    const packed = packRuntimeEnv(minimal);
    const unpacked = unpackRuntimeEnv(packed);

    expect(unpacked).toEqual(minimal);
  });

  it('is resilient to added fields without positional shifting', () => {
    const extended = {
      mode: APP_ENV.PRODUCTION,
      appVersion: '2.0.0',
      appName: 'app-with-extra',
      newFeatureFlag: true,
      customMetadata: { cluster: 'us-east-1' },
    } as unknown as AppRuntimeEnv;

    const packed = packRuntimeEnv(extended);
    const unpacked = unpackRuntimeEnv(packed);
    expect(unpacked).toEqual(extended);
  });

  it('handles unicode, non-ASCII and special characters correctly', () => {
    const unicodeEnv: AppRuntimeEnv = {
      mode: APP_ENV.DEVELOPMENT,
      appVersion: '3.1.0-beta.1',
      appName: '企业级桌面客户端 🚀',
      channel: '测试渠道 #01',
      systemCode: 'SYS-中文-001',
    };

    const packed = packRuntimeEnv(unicodeEnv);
    const unpacked = unpackRuntimeEnv(packed);
    expect(unpacked).toEqual(unicodeEnv);
  });

  it('throws error on corrupted or malformed base64 input', () => {
    expect(() => unpackRuntimeEnv('!!!not_base64***')).toThrow();
  });

  it('throws error when base64 content is not valid JSON', () => {
    // Valid Base64URL string of non-JSON text "not a json object"
    const nonJsonB64 = btoa('not a json object')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(() => unpackRuntimeEnv(nonJsonB64)).toThrow();
  });

  it('exposes standard command line argument prefix', () => {
    expect(APP_ENV_ARG_PREFIX).toBe('--app-meta=');
  });
});
