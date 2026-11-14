import { APP_FEATURES, buildSentryTags, SENTRY_TAGS } from '@app/shared/constants/telemetry';
import { describe, expect, it } from 'vitest';

describe('telemetry Feature & Sentry Tag Contracts', () => {
  it('defines valid APP_FEATURES as string constants', () => {
    expect(APP_FEATURES.OTA).toBe('ota');
    expect(APP_FEATURES.WINDOW).toBe('window');
    expect(APP_FEATURES.IPC).toBe('ipc');

    for (const [key, feature] of Object.entries(APP_FEATURES)) {
      expect(key).toBe(key.toUpperCase());
      expect(typeof feature).toBe('string');
      expect(feature.length).toBeGreaterThan(0);
    }
  });

  it('defines standardized SENTRY_TAGS keys', () => {
    expect(SENTRY_TAGS.FEATURE).toBe('feature');
    expect(SENTRY_TAGS.LOGGER).toBe('logger');
    expect(SENTRY_TAGS.STAGE).toBe('ota_stage');
    expect(SENTRY_TAGS.TARGET_VERSION).toBe('target_version');
    expect(SENTRY_TAGS.CURRENT_VERSION).toBe('current_version');
  });

  it('buildSentryTags correctly builds tag map with feature', () => {
    const tags = buildSentryTags(APP_FEATURES.OTA);
    expect(tags).toEqual({
      feature: 'ota',
    });
  });

  it('buildSentryTags merges extra tags (such as logger) and filters undefined/null values', () => {
    const tags = buildSentryTags(APP_FEATURES.OTA, {
      [SENTRY_TAGS.LOGGER]: 'UpdaterService',
      [SENTRY_TAGS.STAGE]: 'checking',
      [SENTRY_TAGS.TARGET_VERSION]: '1.6.0',
      [SENTRY_TAGS.CURRENT_VERSION]: '1.5.0',
      emptyField: undefined,
      nullField: null,
      numericField: 404,
      booleanField: true,
    });

    expect(tags).toEqual({
      feature: 'ota',
      logger: 'UpdaterService',
      ota_stage: 'checking',
      target_version: '1.6.0',
      current_version: '1.5.0',
      numericField: '404',
      booleanField: 'true',
    });
    expect('emptyField' in tags).toBe(false);
    expect('nullField' in tags).toBe(false);
  });
});
