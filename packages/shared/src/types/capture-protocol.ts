/**
 * 取词服务消息协议类型（主进程 ↔ capture utilityProcess）
 *
 * 类型事实源：docs/ipc-contract.md（B-02）v1.1 §2/§3/§5。
 * 本文件只承载类型；协议常量见 @app/shared/constants/capture-protocol，
 * 运行时校验见 @app/shared/utils/capture-protocol。
 * 取词服务禁止引入网络模块（B-01 §3 硬边界 2），shared 内的协议模块必须保持零依赖 electron。
 */
import type { CaptureToMainMessageType, MainToCaptureMessageType } from '../constants/capture-protocol';
import type { PROTOCOL_VERSION } from '../constants/capture-protocol';

// ---------------------------------------------------------------------------
// 消息信封与公共结构（B-02 §2.1/§2.4）
// ---------------------------------------------------------------------------

export type IsoDateTimeString = string;
export type UuidV4 = string;

export interface MessageEnvelope {
  type: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  /** ISO 8601 UTC，毫秒精度 */
  sentAt: IsoDateTimeString;
}

/** 请求消息额外字段：取词服务必须原样回传 */
export type RequestEnvelope = MessageEnvelope & { requestId: UuidV4 };

/** 事件消息额外字段：取词服务内单调递增，主进程按 seq 去重 */
export type EventEnvelope = MessageEnvelope & { seq: number };

/**
 * 配置快照（B-02 §2.4）。revision 单调递增；
 * 取词服务只接受 revision 大于当前值的快照。
 */
export interface CaptureConfigSnapshot {
  revision: number;
  whitelist: string[];
  dotEnabled: boolean;
  fullscreenSuppress: boolean;
  captureTimeoutMs: number;
  dedupeWindowMs: number;
  minEnglishRatio: number;
  maxTextChars: number;
  paragraphReadLimit: number;
  contextMaxChars: number;
}

// ---------------------------------------------------------------------------
// 取词负载（B-02 §5.2，capture_result / dot_clicked 共用）
// ---------------------------------------------------------------------------

export interface ScreenRect {
  /** 屏幕 DIP（device-independent pixel），坐标契约见 B-02 §2.2 */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface CaptureResultPayload {
  source: 'dot' | 'hotkey';
  seq: number;
  text: string;
  textTruncated: boolean;
  rects: ScreenRect[];
  anchor: ScreenPoint;
  pointer: ScreenPoint;
  processName: string;
  processId: number;
  windowTitle: string;
  paragraph: string;
  paragraphError: string | null;
  paragraphTruncated: boolean;
  capturedAt: IsoDateTimeString;
  elapsedMs: number;
  dpiScale: number;
  coordinateSpace: 'dip';
  selectionRanges: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 消息目录（B-02 §4/§5）：主进程 → 取词服务
// ---------------------------------------------------------------------------

export interface HelloAckMessage extends MessageEnvelope {
  type: 'hello_ack';
  appVersion: string;
  configRevision: number;
  config: Omit<CaptureConfigSnapshot, 'revision'>;
}

export interface ConfigUpdateMessage extends RequestEnvelope {
  type: 'config_update';
  config: CaptureConfigSnapshot;
}

export interface CaptureCurrentMessage extends RequestEnvelope {
  type: 'capture_current';
  reason: 'hotkey' | 'diagnose';
  timeoutMs: number;
}

export interface DiagnoseMessage extends RequestEnvelope {
  type: 'diagnose';
  timeoutMs: number;
}

export interface HideDotMessage extends MessageEnvelope {
  type: 'hide_dot';
  reason: 'card_opened' | 'app_switch' | 'shutdown' | 'manual';
}

export interface ShutdownMessage extends RequestEnvelope {
  type: 'shutdown';
  reason: 'app_quit';
}

/** 主进程 → 取词服务 的全部消息（type 白名单见 constants） */
export type MainToCaptureMessage =
  | HelloAckMessage
  | ConfigUpdateMessage
  | CaptureCurrentMessage
  | DiagnoseMessage
  | HideDotMessage
  | ShutdownMessage;

/** 编译期检查：MainToCaptureMessage 与 type 白名单一一对应 */
type AssertMainToCaptureTypes = MainToCaptureMessage['type'] extends MainToCaptureMessageType
  ? MainToCaptureMessageType extends MainToCaptureMessage['type']
    ? true
    : never
  : never;
const _assertMainToCaptureTypes: AssertMainToCaptureTypes = true;
void _assertMainToCaptureTypes;

// ---------------------------------------------------------------------------
// 消息目录（B-02 §4/§5）：取词服务 → 主进程
// ---------------------------------------------------------------------------

export interface HelloMessage extends MessageEnvelope {
  type: 'hello';
  serviceVersion: string;
  addonVersion: string;
  pid: number;
  startedAt: IsoDateTimeString;
  capabilities: {
    uia: boolean;
    dot: boolean;
    rangeFromPoint: boolean;
    fullscreenDetection: boolean;
  };
}

export interface ConfigAckMessage extends MessageEnvelope {
  type: 'config_ack';
  requestId: UuidV4;
  revision: number;
  appliedAt: IsoDateTimeString;
}

export interface ConfigErrorMessage extends MessageEnvelope {
  type: 'config_error';
  requestId: UuidV4;
  revision: number;
  code: 'InvalidConfig';
  /** 不得包含选中原文（B-02 §2.3） */
  message: string;
}

export interface CaptureResultMessage extends MessageEnvelope {
  type: 'capture_result';
  requestId: UuidV4;
  payload: CaptureResultPayload;
}

export interface CaptureErrorMessage extends MessageEnvelope {
  type: 'capture_error';
  /** 事件型错误（如圆点候选失败）时可为 null */
  requestId: UuidV4 | null;
  seq: number | null;
  code: CaptureErrorCode;
  message: string;
  processName: string;
  processId: number;
  windowTitle: string;
  elapsedMs: number;
  retryable: boolean;
}

export interface DotClickedMessage extends EventEnvelope {
  type: 'dot_clicked';
  /** 顶层 seq 与 payload.seq 必须一致（B-02 §5.3） */
  payload: CaptureResultPayload;
}

export type DotHiddenReason =
  | 'outside_click'
  | 'selection_cleared'
  | 'scroll'
  | 'app_switch'
  | 'new_selection'
  | 'card_opened'
  | 'disabled'
  | 'fullscreen'
  | 'shutdown';

export interface DotHiddenMessage extends EventEnvelope {
  type: 'dot_hidden';
  reason: DotHiddenReason;
}

export interface ForegroundInfo {
  processName: string;
  processId: number;
  windowTitle: string;
  isFullscreen: boolean;
}

export interface ForegroundChangedMessage extends MessageEnvelope {
  type: 'foreground_changed';
  processName: string;
  processId: number;
  windowTitle: string;
  isFullscreen: boolean;
  at: IsoDateTimeString;
}

export type ServiceState = 'starting' | 'ready' | 'degraded' | 'stopping';

export interface ServiceStatusMessage extends MessageEnvelope {
  type: 'service_status';
  state: ServiceState;
  uiaAvailable: boolean;
  hookInstalled: boolean;
  dotVisible: boolean;
  serviceVersion: string;
  addonVersion: string;
  uptimeMs: number;
  lastErrorCode: string | null;
}

export interface DiagnoseResultMessage extends MessageEnvelope {
  type: 'diagnose_result';
  requestId: UuidV4;
  uiaAvailable: boolean;
  hookInstalled: boolean;
  dotVisible: boolean;
  foreground: ForegroundInfo | null;
  serviceVersion: string;
  addonVersion: string;
  osVersion: string;
  dpiScale: number;
  warnings: string[];
}

export interface ShutdownAckMessage extends MessageEnvelope {
  type: 'shutdown_ack';
  requestId: UuidV4;
}

export interface ErrorMessage extends MessageEnvelope {
  type: 'error';
  /** 不得包含 text / paragraph（B-02 §9） */
  code: CaptureErrorCode;
  message: string;
}

/** 取词服务 → 主进程 的全部消息（type 白名单见 constants） */
export type CaptureToMainMessage =
  | HelloMessage
  | ConfigAckMessage
  | ConfigErrorMessage
  | CaptureResultMessage
  | CaptureErrorMessage
  | DotClickedMessage
  | DotHiddenMessage
  | ForegroundChangedMessage
  | ServiceStatusMessage
  | DiagnoseResultMessage
  | ShutdownAckMessage
  | ErrorMessage;

/** 编译期检查：CaptureToMainMessage 与 type 白名单一一对应 */
type AssertCaptureToMainTypes = CaptureToMainMessage['type'] extends CaptureToMainMessageType
  ? CaptureToMainMessageType extends CaptureToMainMessage['type']
    ? true
    : never
  : never;
const _assertCaptureToMainTypes: AssertCaptureToMainTypes = true;
void _assertCaptureToMainTypes;

// ---------------------------------------------------------------------------
// 错误码（B-02 §6 中取词服务可能上报的子集；主进程侧码表后续由 B-06 汇总）
// ---------------------------------------------------------------------------

export type CaptureErrorCode =
  | 'NoForegroundWindow'
  | 'NotWhitelisted'
  | 'PasswordField'
  | 'EmptySelection'
  | 'TextPatternNotSupported'
  | 'Timeout'
  | 'Busy'
  | 'ComError'
  | 'SelectionChanged'
  | 'NoBoundingRects'
  | 'AddonLoadFailed'
  | 'PayloadTooLarge'
  | 'InvalidConfig'
  | 'ProtocolError'
  | 'Internal';
