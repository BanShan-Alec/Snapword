import type {} from 'electron';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import {
  MAIN_TO_CAPTURE_MESSAGE_TYPES,
  PROTOCOL_VERSION,
  SERVICE_STATUS_INTERVAL_MS,
} from '@app/shared/constants/capture-protocol';
import type {
  CaptureConfigSnapshot,
  CaptureErrorCode,
  CaptureToMainMessage,
  ConfigUpdateMessage,
  HelloAckMessage,
  MainToCaptureMessage,
  ServiceState,
  ShutdownMessage,
} from '@app/shared/types/capture-protocol';
import {
  asRecord,
  asRequestId,
  checkEnvelope,
  clampErrorMessage,
  validateCaptureConfig,
} from '@app/shared/utils/capture-protocol';

/**
 * 取词服务入口（utilityProcess 子进程侧，独立 bundle capture-service.cjs）
 *
 * P4 骨架范围（B-02 §1/§3/§5）：进程骨架 + 握手 + 心跳 + 关闭。
 * - 加载后立即发送 hello（addon 未接入，capabilities 全 false 占位）；
 *   随后等待 hello_ack，应用配置快照并回 config_ack / config_error；
 * - 每 5s 发送 service_status 心跳（占位数据，addon 落地后填真实状态）；
 * - 收到 shutdown 回 shutdown_ack 后退出（B-02 §1：关闭流程）。
 * hello_ack 的 protocolVersion 校验失败走 config_error（本 ask 拍板，见 handshake 处理）。
 *
 * 硬边界（B-01 §3）：本进程禁止引入 http/https/net/tls/dns 等网络模块，
 * 禁止接收 API Key / Base URL / 翻译结果；允许的依赖只有 node 内置模块与 @app/shared 协议模块。
 * Native Addon（uia-probe.node）加载、钩子与圆点管理留给下一步（B-01 §4/§5.1）。
 */

/** 取词服务 bundle 版本（B-02 §3.1 hello.serviceVersion） */
const SERVICE_VERSION = '0.1.0';
/** addon 未接入时的占位版本（B-02 §5.7；addon 落地后替换为真实 addon 版本） */
const ADDON_VERSION_PLACEHOLDER = 'not-loaded';

const parentPort = process.parentPort;

if (!parentPort) {
  // 不在 utilityProcess 环境中运行（误用 node 直接执行）：立即退出，避免空转
  process.exit(1);
}

const startedAtMs = Date.now();
const startedAt = new Date(startedAtMs).toISOString();

/** 当前生效的配置快照；null 表示尚未通过 hello_ack 应用任何配置 */
let currentConfig: CaptureConfigSnapshot | null = null;
/** 最近一次内部错误码，随 service_status 上报 */
let lastErrorCode: string | null = null;
/** shutdown 之后停止处理新消息与心跳 */
let shuttingDown = false;

function nowIso(): string {
  return new Date().toISOString();
}

function send(message: CaptureToMainMessage): void {
  parentPort.postMessage(message);
}

function serviceState(): ServiceState {
  if (shuttingDown) {
    return 'stopping';
  }
  return currentConfig === null ? 'starting' : 'ready';
}

/** service_status 心跳（B-02 §5.7）。P4 占位：addon 未接入，状态字段如实报 false */
function sendServiceStatus(): void {
  send({
    type: 'service_status',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    state: serviceState(),
    uiaAvailable: false,
    hookInstalled: false,
    dotVisible: false,
    serviceVersion: SERVICE_VERSION,
    addonVersion: ADDON_VERSION_PLACEHOLDER,
    uptimeMs: Date.now() - startedAtMs,
    lastErrorCode,
  });
}

function sendError(code: CaptureErrorCode, message: string): void {
  lastErrorCode = code;
  send({
    type: 'error',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    code,
    message: clampErrorMessage(message),
  });
}

/**
 * config_error（B-02 §3.3/§6 InvalidConfig）。
 * config_error 必带 requestId；事件型失败（如 hello_ack 阶段）没有可回传的请求 id，
 * 由本服务生成一个 UUID 占位，主进程在握手失败分支按失败表处理。
 */
function sendConfigError(requestId: string | null, revision: number, reason: string): void {
  lastErrorCode = 'InvalidConfig';
  send({
    type: 'config_error',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    requestId: requestId ?? randomUUID(),
    revision,
    code: 'InvalidConfig',
    message: clampErrorMessage(reason),
  });
}

/** hello（B-02 §3.1）：addon 未接入，capabilities 如实全 false */
function sendHello(): void {
  send({
    type: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    serviceVersion: SERVICE_VERSION,
    addonVersion: ADDON_VERSION_PLACEHOLDER,
    pid: process.pid,
    startedAt,
    capabilities: {
      uia: false,
      dot: false,
      rangeFromPoint: false,
      fullscreenDetection: false,
    },
  });
}

/** hello_ack（B-02 §3.2）→ 应用配置快照 → config_ack / config_error */
function handleHelloAck(message: HelloAckMessage): void {
  // 重复 hello_ack 属协议错误：配置已应用，不接受二次握手
  if (currentConfig !== null) {
    sendError('ProtocolError', 'duplicate hello_ack after handshake completed');
    return;
  }

  const config: CaptureConfigSnapshot = {
    ...message.config,
    revision: message.configRevision,
  };
  const invalidReason = validateCaptureConfig(config);
  if (invalidReason !== null) {
    sendConfigError(null, config.revision, invalidReason);
    return;
  }

  currentConfig = config;
  send({
    type: 'config_ack',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    requestId: randomUUID(),
    revision: currentConfig.revision,
    appliedAt: nowIso(),
  });
}

/** config_update（B-02 §2.4）：只接受 revision 更大的有效快照 */
function handleConfigUpdate(message: ConfigUpdateMessage): void {
  const requestId = asRequestId(message.requestId);
  if (requestId === null) {
    sendError('ProtocolError', 'config_update missing requestId');
    return;
  }

  const config = message.config;
  const invalidReason = validateCaptureConfig(config);
  if (invalidReason !== null) {
    // B-02 §2.4：无效配置返回 config_error，保持旧配置
    sendConfigError(requestId, config?.revision ?? (currentConfig?.revision ?? 0), invalidReason);
    return;
  }
  if (currentConfig !== null && config.revision <= currentConfig.revision) {
    sendConfigError(
      requestId,
      config.revision,
      `stale config revision ${config.revision} (current ${currentConfig.revision})`,
    );
    return;
  }

  currentConfig = config;
  send({
    type: 'config_ack',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    requestId,
    revision: config.revision,
    appliedAt: nowIso(),
  });
}

/** shutdown（B-02 §5.9/§8）：回 shutdown_ack 后退出，1s 未达主进程则被 kill() */
function handleShutdown(message: ShutdownMessage): void {
  const requestId = asRequestId(message.requestId);
  if (requestId === null) {
    sendError('ProtocolError', 'shutdown missing requestId');
    return;
  }
  shuttingDown = true;
  stopStatusTimer();
  send({
    type: 'shutdown_ack',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    requestId,
  });
  // postMessage 为异步投递：延迟一拍退出，避免 shutdown_ack 还没出门就被 process.exit 丢弃
  setTimeout(() => process.exit(0), 50);
}

/** diagnose（B-02 §5.8）：addon 未接入，返回占位诊断 */
function handleDiagnose(message: Record<string, unknown>): void {
  const requestId = asRequestId(message.requestId);
  if (requestId === null) {
    sendError('ProtocolError', 'diagnose missing requestId');
    return;
  }
  send({
    type: 'diagnose_result',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    requestId,
    uiaAvailable: false,
    hookInstalled: false,
    dotVisible: false,
    foreground: null,
    serviceVersion: SERVICE_VERSION,
    addonVersion: ADDON_VERSION_PLACEHOLDER,
    osVersion: `${os.type()} ${os.release()}`,
    dpiScale: 1,
    warnings: ['native addon not loaded (P4 skeleton)'],
  });
}

/** capture_current（B-02 §5.1）：addon 未接入，按错误码表上报 AddonLoadFailed */
function handleCaptureCurrent(message: Record<string, unknown>): void {
  const requestId = asRequestId(message.requestId);
  send({
    type: 'capture_error',
    protocolVersion: PROTOCOL_VERSION,
    sentAt: nowIso(),
    requestId,
    seq: null,
    code: 'AddonLoadFailed',
    message: 'capture addon not loaded (P4 skeleton)',
    processName: '',
    processId: 0,
    windowTitle: '',
    elapsedMs: 0,
    retryable: false,
  });
}

let statusTimer: NodeJS.Timeout | null = null;

function startStatusTimer(): void {
  if (statusTimer === null) {
    statusTimer = setInterval(sendServiceStatus, SERVICE_STATUS_INTERVAL_MS);
  }
}

function stopStatusTimer(): void {
  if (statusTimer !== null) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

parentPort.on('message', (event: Electron.MessageEvent) => {
  if (shuttingDown) {
    return;
  }
  const message: unknown = event.data;

  // B-02 §9：type 白名单 + protocolVersion 校验先行
  const envelope = checkEnvelope(message, 'main-to-capture');
  if (envelope === null) {
    const record = asRecord(message);
    const type = typeof record?.type === 'string' ? record.type : 'unknown';
    const versionMismatch = record !== null && record.protocolVersion !== PROTOCOL_VERSION;

    if (versionMismatch && type === 'hello_ack') {
      // 本 ask 拍板：hello_ack 的 protocolVersion 校验失败走 config_error（握手第三腿失败）
      const revision = typeof record?.configRevision === 'number' ? record.configRevision : 0;
      sendConfigError(null, revision, `protocolVersion mismatch (expected ${PROTOCOL_VERSION})`);
      return;
    }
    if (versionMismatch && asRequestId(record?.requestId) !== null) {
      // 带 requestId 的请求：以 config_error 回应（响应目录里唯一面向"校验失败"的回复）
      sendConfigError(
        asRequestId(record?.requestId),
        currentConfig?.revision ?? 0,
        `protocolVersion mismatch (expected ${PROTOCOL_VERSION})`,
      );
      return;
    }
    sendError('ProtocolError', `message rejected: type=${type} in [${MAIN_TO_CAPTURE_MESSAGE_TYPES.join(', ')}]`);
    return;
  }

  // checkEnvelope 已保证 type 属于主→服务白名单
  const typed = message as MainToCaptureMessage;
  switch (typed.type) {
    case 'hello_ack':
      handleHelloAck(typed);
      break;
    case 'config_update':
      handleConfigUpdate(typed);
      break;
    case 'shutdown':
      handleShutdown(typed);
      break;
    case 'hide_dot':
      // 圆点由 Native Addon 拥有（B-01 §3）；addon 未接入前忽略
      break;
    case 'capture_current':
      handleCaptureCurrent(typed as unknown as Record<string, unknown>);
      break;
    case 'diagnose':
      handleDiagnose(typed as unknown as Record<string, unknown>);
      break;
  }
});

// 加载即握手：hello 先行，心跳随后按 5s 周期占位发送（B-02 §1/§3）
sendHello();
sendServiceStatus();
startStatusTimer();
