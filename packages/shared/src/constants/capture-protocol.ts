/**
 * 取词服务协议常量（B-02 IPC 契约 v1.1）
 *
 * 主进程 ↔ capture utilityProcess 双方共用的单一事实源；
 * 类型定义见 @app/shared/types/capture-protocol，校验函数见 @app/shared/utils/capture-protocol。
 * 文档事实源：docs/ipc-contract.md（B-02）§1/§2。
 */

/** 协议版本：每条消息必带；不匹配时按 B-02 §2.1 处理（主进程 kill，服务走 config_error） */
export const PROTOCOL_VERSION = 1;

/** 单条消息上限（序列化后），超限拒绝并记 PayloadTooLarge（B-02 §1） */
export const MAX_MESSAGE_BYTES = 1024 * 1024;

/** 单条消息内字段上限（B-02 §2.3） */
export const MAX_TEXT_CHARS = 20_000;
export const MAX_PARAGRAPH_CHARS = 2_000;
export const MAX_WINDOW_TITLE_CHARS = 200;
export const MAX_PROCESS_NAME_CHARS = 64;
export const MAX_ERROR_MESSAGE_CHARS = 500;

/** 心跳与超时（B-02 §1/§8） */
export const SERVICE_STATUS_INTERVAL_MS = 5_000;
export const HEARTBEAT_MISS_LIMIT_MS = 12_000;
export const HANDSHAKE_TIMEOUT_MS = 5_000;
export const SHUTDOWN_ACK_TIMEOUT_MS = 1_000;

/** config_update 请求超时（B-02 §8：1s，自动重试 1 次） */
export const CONFIG_UPDATE_TIMEOUT_MS = 1_000;

/** 消息方向白名单（B-02 §4 消息目录）：双方解析后必须校验 type（B-02 §9） */
export const MAIN_TO_CAPTURE_MESSAGE_TYPES = [
  'hello_ack',
  'config_update',
  'capture_current',
  'diagnose',
  'hide_dot',
  'shutdown',
  'error',
] as const;

export const CAPTURE_TO_MAIN_MESSAGE_TYPES = [
  'hello',
  'config_ack',
  'config_error',
  'capture_result',
  'capture_error',
  'dot_clicked',
  'dot_hidden',
  'foreground_changed',
  'service_status',
  'diagnose_result',
  'shutdown_ack',
  'error',
] as const;

export type MainToCaptureMessageType = (typeof MAIN_TO_CAPTURE_MESSAGE_TYPES)[number];
export type CaptureToMainMessageType = (typeof CAPTURE_TO_MAIN_MESSAGE_TYPES)[number];
