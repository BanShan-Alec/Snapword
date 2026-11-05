import {
  CAPTURE_TO_MAIN_MESSAGE_TYPES,
  MAIN_TO_CAPTURE_MESSAGE_TYPES,
  MAX_ERROR_MESSAGE_CHARS,
  PROTOCOL_VERSION,
} from '@app/shared/constants/capture-protocol';
import type { CaptureConfigSnapshot } from '@app/shared/types/capture-protocol';
import {
  asRecord,
  asRequestId,
  checkEnvelope,
  clampErrorMessage,
  validateCaptureConfig,
} from '@app/shared/utils/capture-protocol';
import { describe, expect, it } from 'vitest';

function validConfig(): CaptureConfigSnapshot {
  return {
    revision: 0,
    whitelist: ['chrome.exe', 'msedge.exe'],
    dotEnabled: true,
    fullscreenSuppress: true,
    captureTimeoutMs: 500,
    dedupeWindowMs: 300,
    minEnglishRatio: 0.3,
    maxTextChars: 20_000,
    paragraphReadLimit: 2_000,
    contextMaxChars: 300,
  };
}

describe('capture-protocol checkEnvelope', () => {
  it('accepts a known message with matching protocolVersion', () => {
    expect(
      checkEnvelope(
        { type: 'hello', protocolVersion: PROTOCOL_VERSION, sentAt: new Date().toISOString() },
        'capture-to-main',
      ),
    ).toEqual({ type: 'hello' });
    expect(
      checkEnvelope(
        { type: 'hello_ack', protocolVersion: PROTOCOL_VERSION, sentAt: '' },
        'main-to-capture',
      ),
    ).toEqual({ type: 'hello_ack' });
  });

  it('rejects protocolVersion mismatch and unknown types', () => {
    expect(checkEnvelope({ type: 'hello', protocolVersion: 2 }, 'capture-to-main')).toBeNull();
    expect(checkEnvelope({ type: 'hello', protocolVersion: 1 }, 'main-to-capture')).toBeNull();
    expect(
      checkEnvelope({ type: 'not_a_message', protocolVersion: 1 }, 'capture-to-main'),
    ).toBeNull();
    expect(checkEnvelope(null, 'capture-to-main')).toBeNull();
    expect(checkEnvelope([], 'capture-to-main')).toBeNull();
  });

  it('keeps the two direction whitelists disjoint except shared error names', () => {
    const overlap = CAPTURE_TO_MAIN_MESSAGE_TYPES.filter((type) =>
      (MAIN_TO_CAPTURE_MESSAGE_TYPES as readonly string[]).includes(type),
    );
    // B-02 §4：error 是唯一双向消息，其余 type 必须单向
    expect(overlap).toEqual(['error']);
  });
});

describe('capture-protocol config validation', () => {
  it('accepts the contract default snapshot', () => {
    expect(validateCaptureConfig(validConfig())).toBeNull();
  });

  it('rejects invalid field types and ranges with InvalidConfig reasons', () => {
    expect(validateCaptureConfig(null)).toBe('config must be an object');
    expect(validateCaptureConfig({ ...validConfig(), whitelist: 'chrome.exe' })).toBe(
      'whitelist must be an array of process names',
    );
    expect(validateCaptureConfig({ ...validConfig(), captureTimeoutMs: 0 })).toBe(
      'captureTimeoutMs must be an integer between 50 and 5000',
    );
    expect(validateCaptureConfig({ ...validConfig(), revision: -1 })).toBe(
      'revision must be a non-negative integer',
    );
  });
});

describe('capture-protocol helpers', () => {
  it('asRecord only accepts plain objects', () => {
    expect(asRecord({ type: 'hello' })).toEqual({ type: 'hello' });
    expect(asRecord(null)).toBeNull();
    expect(asRecord([])).toBeNull();
    expect(asRecord('hello')).toBeNull();
  });

  it('asRequestId accepts non-empty strings only', () => {
    expect(asRequestId('6f1c')).toBe('6f1c');
    expect(asRequestId('')).toBeNull();
    expect(asRequestId(null)).toBeNull();
  });

  it('clampErrorMessage enforces the 500 char limit', () => {
    const long = 'x'.repeat(MAX_ERROR_MESSAGE_CHARS + 50);
    expect(clampErrorMessage(long)).toHaveLength(MAX_ERROR_MESSAGE_CHARS);
    expect(clampErrorMessage('short')).toBe('short');
  });
});
