/**
 * 取词服务协议运行时校验（B-02 §9）
 *
 * 主进程与取词服务在解析每条消息后都必须校验（B-02 §9）：
 * type 在白名单、protocolVersion 匹配、必填字段类型/长度。
 * 本模块为双方共用的纯函数，禁止依赖 electron / node 内置模块以外的运行时。
 */
import {
  CAPTURE_TO_MAIN_MESSAGE_TYPES,
  type CaptureToMainMessageType,
  MAIN_TO_CAPTURE_MESSAGE_TYPES,
  MAX_ERROR_MESSAGE_CHARS,
  MAX_PARAGRAPH_CHARS,
  MAX_PROCESS_NAME_CHARS,
  MAX_TEXT_CHARS,
  type MainToCaptureMessageType,
  PROTOCOL_VERSION,
} from '../constants/capture-protocol';

/** 收到一段 structured clone 数据时，先还原为可检索的 Record */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function isMainToCaptureType(type: string): type is MainToCaptureMessageType {
  return (MAIN_TO_CAPTURE_MESSAGE_TYPES as readonly string[]).includes(type);
}

export function isCaptureToMainType(type: string): type is CaptureToMainMessageType {
  return (CAPTURE_TO_MAIN_MESSAGE_TYPES as readonly string[]).includes(type);
}

/**
 * 信封预检（B-02 §9）：type 在白名单且 protocolVersion 匹配。
 * 返回 null 表示通过；否则返回失败原因（用于日志，不含业务文本）。
 */
export function checkEnvelope(
  message: unknown,
  direction: 'main-to-capture' | 'capture-to-main',
): {
  type: string;
} | null {
  const record = asRecord(message);
  if (!record) {
    return null;
  }
  const { type, protocolVersion } = record;
  if (typeof type !== 'string') {
    return null;
  }
  if (protocolVersion !== PROTOCOL_VERSION) {
    return null;
  }
  const known =
    direction === 'main-to-capture' ? isMainToCaptureType(type) : isCaptureToMainType(type);
  if (!known) {
    return null;
  }
  return { type };
}

/** requestId 校验（B-02 §2.1：请求必须携带，服务原样回传） */
export function asRequestId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 错误消息钳制（B-02 §2.3：message ≤500 字符，不得包含选中原文——由调用方保证） */
export function clampErrorMessage(message: string): string {
  return message.length <= MAX_ERROR_MESSAGE_CHARS
    ? message
    : message.slice(0, MAX_ERROR_MESSAGE_CHARS);
}

function isIntBetween(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * 配置快照校验（B-02 §2.4）。返回 null 表示有效；否则返回 InvalidConfig 的原因描述。
 * 只做类型/范围校验，不校验业务语义。
 */
export function validateCaptureConfig(config: unknown): string | null {
  if (asRecord(config) === null) {
    return 'config must be an object';
  }
  const c = config as Record<string, unknown>;

  if (!Array.isArray(c.whitelist)) {
    return 'whitelist must be an array of process names';
  }
  for (const item of c.whitelist) {
    if (typeof item !== 'string' || item.length === 0) {
      return 'whitelist must contain non-empty process names';
    }
    if (item.length > MAX_PROCESS_NAME_CHARS) {
      return `whitelist entry must not exceed ${MAX_PROCESS_NAME_CHARS} chars`;
    }
  }

  if (typeof c.dotEnabled !== 'boolean') {
    return 'dotEnabled must be a boolean';
  }
  if (typeof c.fullscreenSuppress !== 'boolean') {
    return 'fullscreenSuppress must be a boolean';
  }

  if (!isIntBetween(c.captureTimeoutMs, 50, 5_000)) {
    return 'captureTimeoutMs must be an integer between 50 and 5000';
  }
  if (!isIntBetween(c.dedupeWindowMs, 0, 5_000)) {
    return 'dedupeWindowMs must be an integer between 0 and 5000';
  }
  if (
    typeof c.minEnglishRatio !== 'number' ||
    !(c.minEnglishRatio >= 0 && c.minEnglishRatio <= 1)
  ) {
    return 'minEnglishRatio must be a number between 0 and 1';
  }
  if (!isIntBetween(c.maxTextChars, 1, MAX_TEXT_CHARS)) {
    return `maxTextChars must be an integer between 1 and ${MAX_TEXT_CHARS}`;
  }
  if (!isIntBetween(c.paragraphReadLimit, 1, MAX_PARAGRAPH_CHARS)) {
    return `paragraphReadLimit must be an integer between 1 and ${MAX_PARAGRAPH_CHARS}`;
  }
  if (!isIntBetween(c.contextMaxChars, 0, 10_000)) {
    return 'contextMaxChars must be an integer between 0 and 10000';
  }
  if (!isIntBetween(c.revision, 0, Number.MAX_SAFE_INTEGER)) {
    return 'revision must be a non-negative integer';
  }
  return null;
}
