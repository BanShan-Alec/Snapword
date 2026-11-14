import { z } from 'zod';

export const CAPTURE_PROTOCOL_VERSION = 1 as const;

/**
 * 屏幕 DIP 矩形坐标 (Device-Independent Pixel)
 */
export const dipRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type DipRect = z.infer<typeof dipRectSchema>;

/**
 * 屏幕 DIP 点坐标 (Device-Independent Pixel)
 */
export const dipPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type DipPoint = z.infer<typeof dipPointSchema>;

/**
 * 取词选区核心数据载荷 (SelectionPayload)
 * 严格遵照 B-02 IPC 协议与 DIP 屏幕坐标系规范
 */
export const selectionPayloadSchema = z.object({
  source: z.enum(['hotkey', 'dot']),
  seq: z.number().int().nonnegative(),
  text: z.string().max(20000),
  textTruncated: z.boolean(),
  rects: z.array(dipRectSchema).max(4096),
  anchor: dipPointSchema,
  pointer: dipPointSchema,
  processName: z.string().max(64),
  processId: z.number().int(),
  windowTitle: z.string().max(200),
  paragraph: z.string().max(2000),
  paragraphError: z.string().nullable(),
  paragraphTruncated: z.boolean(),
  capturedAt: z.string().datetime(),
  elapsedMs: z.number(),
  dpiScale: z.number(),
  coordinateSpace: z.literal('dip'),
  selectionRanges: z.number().int(),
  warnings: z.array(z.string()),
});
export type SelectionPayload = z.infer<typeof selectionPayloadSchema>;

/**
 * 取词配置模型快照
 */
export const captureConfigSchema = z.object({
  whitelist: z.array(z.string()).default(['chrome.exe', 'msedge.exe']),
  dotEnabled: z.boolean().default(true),
  fullscreenSuppress: z.boolean().default(true),
  captureTimeoutMs: z.number().int().positive().default(500),
  dedupeWindowMs: z.number().int().positive().default(300),
  minEnglishRatio: z.number().default(0.3),
  maxTextChars: z.number().int().positive().default(20000),
  paragraphReadLimit: z.number().int().positive().default(2000),
  contextMaxChars: z.number().int().positive().default(300),
});
export type CaptureConfig = z.infer<typeof captureConfigSchema>;
export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = captureConfigSchema.parse({});

/**
 * 取词服务能力集
 */
export const captureCapabilitiesSchema = z.object({
  uia: z.boolean(),
  dot: z.boolean(),
  rangeFromPoint: z.boolean(),
  fullscreenDetection: z.boolean(),
});
export type CaptureCapabilities = z.infer<typeof captureCapabilitiesSchema>;

/**
 * 协议通用 Envelope 基类
 */
export const captureEnvelopeBaseSchema = z.object({
  protocolVersion: z.literal(CAPTURE_PROTOCOL_VERSION),
  sentAt: z.string().datetime(),
});

// 1. hello (服务 -> 主)
export const helloMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('hello'),
  serviceVersion: z.string(),
  addonVersion: z.string(),
  pid: z.number().int(),
  startedAt: z.string().datetime(),
  capabilities: captureCapabilitiesSchema,
});
export type HelloMessage = z.infer<typeof helloMessageSchema>;

// 2. hello_ack (主 -> 服务)
export const helloAckMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('hello_ack'),
  appVersion: z.string(),
  configRevision: z.number().int(),
  config: captureConfigSchema,
});
export type HelloAckMessage = z.infer<typeof helloAckMessageSchema>;

// 3. config_update (主 -> 服务)
export const configUpdateMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('config_update'),
  requestId: z.string(),
  revision: z.number().int(),
  config: captureConfigSchema,
});
export type ConfigUpdateMessage = z.infer<typeof configUpdateMessageSchema>;

// 4. config_ack (服务 -> 主)
export const configAckMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('config_ack'),
  requestId: z.string().optional().default(''),
  revision: z.number().int(),
  appliedAt: z.string().datetime(),
});
export type ConfigAckMessage = z.infer<typeof configAckMessageSchema>;

// 5. config_error (服务 -> 主)
export const configErrorMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('config_error'),
  requestId: z.string().optional().default(''),
  revision: z.number().int(),
  code: z.string(),
  message: z.string().max(500),
});
export type ConfigErrorMessage = z.infer<typeof configErrorMessageSchema>;

// 6. service_status (服务 -> 主，心跳)
export const captureServiceStateSchema = z.enum(['starting', 'ready', 'degraded', 'stopping']);
export type CaptureServiceState = z.infer<typeof captureServiceStateSchema>;

export const serviceStatusMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('service_status'),
  state: captureServiceStateSchema,
  uiaAvailable: z.boolean(),
  hookInstalled: z.boolean(),
  dotVisible: z.boolean(),
  serviceVersion: z.string(),
  addonVersion: z.string(),
  uptimeMs: z.number(),
  lastErrorCode: z.string().nullable(),
});
export type ServiceStatusMessage = z.infer<typeof serviceStatusMessageSchema>;

// 7. capture_current (主 -> 服务)
export const captureCurrentMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('capture_current'),
  requestId: z.string(),
  reason: z.enum(['hotkey', 'diagnose']),
  timeoutMs: z.number().int().positive().default(500),
});
export type CaptureCurrentMessage = z.infer<typeof captureCurrentMessageSchema>;

// 8. capture_result (服务 -> 主)
export const captureResultMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('capture_result'),
  requestId: z.string(),
  payload: selectionPayloadSchema,
});
export type CaptureResultMessage = z.infer<typeof captureResultMessageSchema>;

// 9. capture_error (服务 -> 主)
export const captureErrorMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('capture_error'),
  requestId: z.string().nullable(),
  seq: z.number().int().optional(),
  code: z.string(),
  message: z.string().max(500),
  processName: z.string().max(64).optional(),
  processId: z.number().int().optional(),
  windowTitle: z.string().max(200).optional(),
  elapsedMs: z.number().optional(),
  retryable: z.boolean(),
});
export type CaptureErrorMessage = z.infer<typeof captureErrorMessageSchema>;

// 10. dot_clicked (服务 -> 主)
export const dotClickedMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('dot_clicked'),
  seq: z.number().int().nonnegative(),
  payload: selectionPayloadSchema,
});
export type DotClickedMessage = z.infer<typeof dotClickedMessageSchema>;

// 11. dot_hidden (服务 -> 主)
export const dotHiddenReasonSchema = z.enum([
  'outside_click',
  'selection_cleared',
  'scroll',
  'app_switch',
  'new_selection',
  'card_opened',
  'disabled',
  'fullscreen',
  'shutdown',
]);
export type DotHiddenReason = z.infer<typeof dotHiddenReasonSchema>;

export const dotHiddenMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('dot_hidden'),
  seq: z.number().int().nonnegative(),
  reason: dotHiddenReasonSchema,
});
export type DotHiddenMessage = z.infer<typeof dotHiddenMessageSchema>;

// 12. foreground_changed (服务 -> 主)
export const foregroundChangedMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('foreground_changed'),
  processName: z.string().max(64),
  processId: z.number().int(),
  windowTitle: z.string().max(200),
  isFullscreen: z.boolean(),
  at: z.string().datetime(),
});
export type ForegroundChangedMessage = z.infer<typeof foregroundChangedMessageSchema>;

// 13. hide_dot (主 -> 服务)
export const hideDotMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('hide_dot'),
  reason: z.string(),
});
export type HideDotMessage = z.infer<typeof hideDotMessageSchema>;

// 14. shutdown (主 -> 服务)
export const shutdownMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('shutdown'),
  requestId: z.string(),
  reason: z.string(),
});
export type ShutdownMessage = z.infer<typeof shutdownMessageSchema>;

// 15. shutdown_ack (服务 -> 主)
export const shutdownAckMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('shutdown_ack'),
  requestId: z.string(),
});
export type ShutdownAckMessage = z.infer<typeof shutdownAckMessageSchema>;

// 16. diagnose (主 -> 服务)
export const diagnoseMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('diagnose'),
  requestId: z.string(),
  timeoutMs: z.number().int().default(2000),
});
export type DiagnoseMessage = z.infer<typeof diagnoseMessageSchema>;

// 17. diagnose_result (服务 -> 主)
export const diagnoseResultMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('diagnose_result'),
  requestId: z.string(),
  uiaAvailable: z.boolean(),
  hookInstalled: z.boolean(),
  dotVisible: z.boolean(),
  foreground: z.object({
    processName: z.string().max(64),
    processId: z.number().int(),
    windowTitle: z.string().max(200),
    isFullscreen: z.boolean(),
  }),
  serviceVersion: z.string(),
  addonVersion: z.string(),
  osVersion: z.string(),
  dpiScale: z.number(),
  warnings: z.array(z.string()),
});
export type DiagnoseResultMessage = z.infer<typeof diagnoseResultMessageSchema>;

// 18. mock_emit_selection (主 -> 服务 / 调试)
export const mockEmitSelectionMessageSchema = captureEnvelopeBaseSchema.extend({
  type: z.literal('mock_emit_selection'),
  requestId: z.string().optional(),
  override: selectionPayloadSchema.partial().optional(),
});
export type MockEmitSelectionMessage = z.infer<typeof mockEmitSelectionMessageSchema>;

/**
 * 服务端发往主进程的消息模型联合 (Service -> Main)
 */
export const captureServiceToMainMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  configAckMessageSchema,
  configErrorMessageSchema,
  serviceStatusMessageSchema,
  captureResultMessageSchema,
  captureErrorMessageSchema,
  dotClickedMessageSchema,
  dotHiddenMessageSchema,
  foregroundChangedMessageSchema,
  shutdownAckMessageSchema,
  diagnoseResultMessageSchema,
]);
export type CaptureServiceToMainMessage = z.infer<typeof captureServiceToMainMessageSchema>;

/**
 * 主进程发往服务进程的消息模型联合 (Main -> Service)
 */
export const mainToCaptureServiceMessageSchema = z.discriminatedUnion('type', [
  helloAckMessageSchema,
  configUpdateMessageSchema,
  captureCurrentMessageSchema,
  hideDotMessageSchema,
  shutdownMessageSchema,
  diagnoseMessageSchema,
  mockEmitSelectionMessageSchema,
]);
export type MainToCaptureServiceMessage = z.infer<typeof mainToCaptureServiceMessageSchema>;

/**
 * 跨进程取词全量消息联合
 */
export const captureMessageSchema = z.union([
  captureServiceToMainMessageSchema,
  mainToCaptureServiceMessageSchema,
]);
export type CaptureMessage = z.infer<typeof captureMessageSchema>;

/**
 * 标准取词错误码 (ipc-contract.md §6)
 */
export const CAPTURE_ERROR_CODES = [
  'NoForegroundWindow',
  'NotWhitelisted',
  'PasswordField',
  'EmptySelection',
  'TextPatternNotSupported',
  'Timeout',
  'Busy',
  'ComError',
  'SelectionChanged',
  'NoBoundingRects',
  'AddonLoadFailed',
  'PayloadTooLarge',
  'InvalidConfig',
  'ProtocolError',
  'ServiceNotReady',
  'ServiceExited',
  'Internal',
] as const;
export type CaptureErrorCode = (typeof CAPTURE_ERROR_CODES)[number];
