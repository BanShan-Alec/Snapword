import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, type UtilityProcess, utilityProcess } from 'electron';
import {
  CONFIG_UPDATE_TIMEOUT_MS,
  HANDSHAKE_TIMEOUT_MS,
  HEARTBEAT_MISS_LIMIT_MS,
  PROTOCOL_VERSION,
  SHUTDOWN_ACK_TIMEOUT_MS,
} from '@app/shared/constants/capture-protocol';
import type {
  CaptureConfigSnapshot,
  CaptureToMainMessage,
  ConfigUpdateMessage,
  MainToCaptureMessage,
  ServiceStatusMessage,
  ShutdownMessage,
} from '@app/shared/types/capture-protocol';
import { asRequestId, checkEnvelope } from '@app/shared/utils/capture-protocol';
import { getLogManager } from '../../modules/log.module';
import { getTrayManager } from '../../modules/tray.module';
import { createDefaultCaptureConfig } from './capture-config';

/** 取词服务守护状态（captureReady 对应 ready，见 B-02 §3） */
export type CaptureServiceManagerState = 'idle' | 'starting' | 'ready' | 'degraded' | 'stopping';

/** fork 失败 / 5s 未 hello 的重试节奏（B-01 §7 失败表：每 3s 重试，最多 3 次） */
const STARTUP_RETRY_DELAY_MS = 3_000;
const STARTUP_MAX_ATTEMPTS = 3;

/**
 * 取词服务守护（主进程侧）
 *
 * B-01 §5.1/§7 + B-02 §1/§3：utilityProcess.fork(capture-service.cjs) 与消息协议。
 * - 握手：fork 后 5s 内完成 hello → hello_ack → config_ack（B-02 §10）；
 *   hello_ack 的 protocolVersion 由服务侧校验，失败走 config_error（握手失败分支）；
 * - 心跳：service_status 每 5s，12s 未收到视为服务死亡（B-02 §1）；
 * - 失败表（B-01 §7）：fork 失败 / 5s 未 hello / 意外退出 → 3s 后重启，连续 3 次失败
 *   进入 degraded 并托盘提示占位，不再自动重试；
 * - 关闭（B-01 §8 第 3 步）：shutdown → shutdown_ack ≤1s → kill() 兜底。
 *
 * 硬约束（B-01/B-02 §9）：
 * - 本管理器不接触 API Key / 翻译逻辑；
 * - kill() 后必须等 exit 再重新 fork（本类仅在 exit 回调里安排重启），禁止同时存在两个取词服务。
 */
export class CaptureServiceManager {
  private child: UtilityProcess | null = null;
  private state: CaptureServiceManagerState = 'idle';
  private readonly logger = getLogManager().scoped(this);

  /** 当前下发给服务的配置快照（主进程为配置事实源，B-01 §6） */
  private configSnapshot: CaptureConfigSnapshot = createDefaultCaptureConfig();
  /** 握手超时（fork → hello/hello_ack/config_ack ≤5s）与心跳看门狗 */
  private handshakeTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  /** 连续启动失败次数；握手成功（config_ack）后清零 */
  private consecutiveFailures = 0;
  /** 在飞请求（config_update / shutdown）的 requestId → 完成回调 */
  private readonly pendingRequests = new Map<string, (message: CaptureToMainMessage | null) => void>();
  /** 最近一次 service_status 心跳内容（诊断占位，B-02 §5.7） */
  private lastServiceStatus: ServiceStatusMessage | null = null;

  /** capture-service.cjs 与主进程产物 index.cjs 同目录输出（见 packages/main/vite.config.ts） */
  get entryPath(): string {
    return path.join(__dirname, 'capture-service.cjs');
  }

  get isRunning(): boolean {
    return this.child !== null;
  }

  /** captureReady（B-02 §3）：握手完成且配置被服务确认 */
  get isReady(): boolean {
    return this.state === 'ready';
  }

  get currentState(): CaptureServiceManagerState {
    return this.state;
  }

  getLastServiceStatus(): ServiceStatusMessage | null {
    return this.lastServiceStatus;
  }

  /**
   * 启动（fork）取词服务。必须在 app ready 之后调用
   * （electron.d.ts：utilityProcess.fork 只能在 ready 后调用）。
   */
  start(): void {
    if (this.child !== null) {
      return;
    }
    const entry = this.entryPath;
    if (!fs.existsSync(entry)) {
      // 产物缺失等价于 fork 失败，走 B-01 §7 失败表
      this.handleStartupFailure(`capture service entry missing: ${entry}`);
      return;
    }

    this.logger.info(`Forking capture service: ${entry}`);
    let child: UtilityProcess;
    try {
      child = utilityProcess.fork(entry, [], {
        serviceName: 'snapword-capture',
        // stdio 继承到主进程终端，便于 dev 期观察；打包后日志仍走主进程统一落盘
        stdio: 'inherit',
      });
    } catch (error) {
      this.handleStartupFailure(`utilityProcess.fork failed: ${String(error)}`);
      return;
    }

    this.child = child;
    this.state = 'starting';
    this.lastServiceStatus = null;
    child.on('message', (message: unknown) => this.handleMessage(message));
    child.on('exit', (code: number) => this.handleExit(child, code));
    child.on('error', (type: string, location: string) => {
      this.logger.error(`Capture service fatal error (${type}) at ${location}`);
    });

    this.armHandshakeTimer();
    this.armHeartbeatWatchdog();
  }

  /**
   * 退出流程第 3 步（B-01 §8）：shutdown → shutdown_ack ≤1s → kill() 兜底。
   * before-quit 同步调用；等待与 kill 在定时器/事件回调中完成，不阻塞退出。
   */
  stop(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    if (child === null) {
      this.state = 'idle';
      return;
    }
    this.state = 'stopping';
    this.clearHandshakeTimer();
    this.clearHeartbeatWatchdog();
    this.logger.info('Stopping capture service: shutdown → shutdown_ack ≤1s → kill fallback');

    const request: ShutdownMessage = {
      type: 'shutdown',
      protocolVersion: PROTOCOL_VERSION,
      sentAt: new Date().toISOString(),
      requestId: randomUUID(),
      reason: 'app_quit',
    };
    void this.sendRequest(request, SHUTDOWN_ACK_TIMEOUT_MS).then((ack) => {
      if (ack === null && this.child === child) {
        this.logger.warn('shutdown_ack not received within 1s, killing capture service');
        child.kill();
      }
    });
  }

  /**
   * 下发配置快照（B-02 §2.4/§4 config_update）：revision 单调递增，
   * 1s 超时自动重试 1 次；config_error 时保留旧配置并返回原因。
   */
  async updateConfig(next: Omit<CaptureConfigSnapshot, 'revision'>): Promise<{ ok: boolean; reason?: string }> {
    const revision = this.configSnapshot.revision + 1;
    let lastReason = 'timeout';

    // B-02 §8：config_update 超时 1s，自动重试 1 次
    for (let attempt = 0; attempt < 2; attempt++) {
      const request: ConfigUpdateMessage = {
        type: 'config_update',
        protocolVersion: PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: randomUUID(),
        config: { ...next, revision },
      };
      const reply = await this.sendRequest(request, CONFIG_UPDATE_TIMEOUT_MS);
      if (reply !== null && reply.type === 'config_ack') {
        this.configSnapshot = { ...next, revision };
        this.logger.info(`Capture config applied (revision=${revision})`);
        return { ok: true };
      }
      if (reply !== null && reply.type === 'config_error') {
        // config_error：设置页内联错误；旧配置继续（B-02 §4），不重试
        lastReason = reply.message;
        break;
      }
      lastReason = 'timeout';
    }

    this.logger.warn(`Capture config update failed, keeping revision=${this.configSnapshot.revision}: ${lastReason}`);
    return { ok: false, reason: lastReason };
  }

  // -------------------------------------------------------------------------
  // 消息处理（B-02 §9：先校验信封再分发）
  // -------------------------------------------------------------------------

  private handleMessage(message: unknown): void {
    const envelope = checkEnvelope(message, 'capture-to-main');
    if (envelope === null) {
      // B-02 §2.1：protocolVersion 不匹配 / §9：type 不在白名单 → kill 并提示诊断；
      // 确定性失败经失败表重试 3 次后进入 degraded，不会无限重启。
      this.logger.warn('Capture service message rejected (envelope/type/version), killing service');
      this.killChild('ProtocolError');
      return;
    }

    const typed = message as CaptureToMainMessage;
    switch (typed.type) {
      case 'hello': {
        if (typeof typed.serviceVersion !== 'string' || typeof typed.pid !== 'number') {
          this.killChild('ProtocolError');
          return;
        }
        this.logger.info(`Capture service hello (v${typed.serviceVersion}, pid=${typed.pid})`);
        // B-02 §3.2：hello_ack 携带 appVersion + 当前配置快照（revision 单列于 configRevision）
        const { revision, ...configWithoutRevision } = this.configSnapshot;
        const helloAck: MainToCaptureMessage = {
          type: 'hello_ack',
          protocolVersion: PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          appVersion: app.getVersion(),
          configRevision: revision,
          config: configWithoutRevision,
        };
        this.post(helloAck);
        return;
      }
      case 'config_ack': {
        // 握手完成（B-02 §10）：fork 后 5s 内 hello/hello_ack/config_ack
        this.clearHandshakeTimer();
        this.state = 'ready';
        this.consecutiveFailures = 0;
        this.logger.info(`Capture service ready (config revision=${typed.revision})`);
        return;
      }
      case 'config_error': {
        const requestId = asRequestId(typed.requestId);
        if (this.state === 'starting') {
          // 握手期被拒（含服务侧 protocolVersion 校验失败）：按握手失败处理
          this.logger.warn(`Capture handshake rejected: ${typed.message}`);
          this.killChild(typed.code);
          return;
        }
        if (requestId !== null) {
          this.resolvePending(requestId, typed);
        }
        return;
      }
      case 'service_status': {
        this.lastServiceStatus = typed;
        this.armHeartbeatWatchdog();
        return;
      }
      case 'shutdown_ack': {
        const requestId = asRequestId(typed.requestId);
        if (requestId !== null) {
          this.resolvePending(requestId, typed);
        }
        return;
      }
      case 'error': {
        this.logger.warn(`Capture service reported error: ${typed.code} ${typed.message}`);
        return;
      }
      default: {
        // capture_result / capture_error / dot_clicked / dot_hidden / foreground_changed /
        // diagnose_result：P5 取词主链路消费；本步仅记录到达
        this.logger.debug(`Capture message received (handler pending): ${typed.type}`);
      }
    }
  }

  private handleExit(child: UtilityProcess, code: number): void {
    if (this.child !== child) {
      return; // 旧实例的迟到事件
    }
    this.child = null;
    this.clearHandshakeTimer();
    this.clearHeartbeatWatchdog();
    this.rejectAllPending();

    if (this.state === 'stopping') {
      this.state = 'idle';
      this.logger.info('Capture service exited after shutdown');
      return;
    }
    // B-01 §9.1：意外退出 → 3s 内重新 fork；连续失败走失败表
    this.handleStartupFailure(`capture service exited unexpectedly (code=${code})`);
  }

  // -------------------------------------------------------------------------
  // 失败表（B-01 §7）：fork 失败 / 5s 未 hello / 心跳死亡 → 3s 重试，最多 3 次
  // -------------------------------------------------------------------------

  private handleStartupFailure(reason: string): void {
    if (this.state === 'stopping') {
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= STARTUP_MAX_ATTEMPTS) {
      // B-01 §7：连续 3 次失败进入 degraded，不再自动重试；托盘提示占位
      this.state = 'degraded';
      this.logger.error(
        `Capture service degraded after ${this.consecutiveFailures} failed attempts: ${reason}`,
      );
      getTrayManager().notifyCaptureServiceIssue('取词服务未启动（已自动重试 3 次）');
      return;
    }
    this.state = 'idle';
    this.logger.warn(
      `Capture service startup failed (attempt ${this.consecutiveFailures}/${STARTUP_MAX_ATTEMPTS}): ${reason}; retry in ${STARTUP_RETRY_DELAY_MS}ms`,
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start();
    }, STARTUP_RETRY_DELAY_MS);
  }

  /** B-02 §2.1/§6：协议错误 → 终止服务；exit 回调里按失败表重启 */
  private killChild(reason: string): void {
    this.clearHandshakeTimer();
    this.clearHeartbeatWatchdog();
    const child = this.child;
    if (child === null) {
      return;
    }
    this.logger.warn(`Killing capture service: ${reason}`);
    child.kill();
  }

  // -------------------------------------------------------------------------
  // 定时器
  // -------------------------------------------------------------------------

  private armHandshakeTimer(): void {
    this.clearHandshakeTimer();
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null;
      if (this.state === 'starting') {
        // B-02 §1/§8：fork 后 5s 内必须完成握手，否则 kill 并重启
        this.logger.warn('Capture handshake not completed within 5s, killing service');
        this.killChild('handshake timeout');
      }
    }, HANDSHAKE_TIMEOUT_MS);
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer !== null) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  private armHeartbeatWatchdog(): void {
    this.clearHeartbeatWatchdog();
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      if (this.child !== null) {
        // B-02 §1：12s 未收到 service_status 视为服务死亡
        this.logger.warn('Capture service heartbeat missing for 12s, killing service');
        this.killChild('heartbeat timeout');
      }
    }, HEARTBEAT_MISS_LIMIT_MS);
  }

  private clearHeartbeatWatchdog(): void {
    if (this.heartbeatTimer !== null) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // 发送与请求登记
  // -------------------------------------------------------------------------

  private post(message: MainToCaptureMessage): void {
    this.child?.postMessage(message);
  }

  /** 带超时的请求-响应：超时/进程退出以 null 结算（B-02 §8 超时矩阵） */
  private sendRequest(
    request: ConfigUpdateMessage | ShutdownMessage,
    timeoutMs: number,
  ): Promise<CaptureToMainMessage | null> {
    return new Promise((resolve) => {
      if (this.child === null) {
        resolve(null);
        return;
      }
      const settle = (reply: CaptureToMainMessage | null) => {
        clearTimeout(timer);
        this.pendingRequests.delete(request.requestId);
        resolve(reply);
      };
      const timer = setTimeout(() => settle(null), timeoutMs);
      this.pendingRequests.set(request.requestId, settle);
      this.post(request);
    });
  }

  private resolvePending(requestId: string, reply: CaptureToMainMessage): void {
    const settle = this.pendingRequests.get(requestId);
    if (settle) {
      settle(reply);
    }
  }

  private rejectAllPending(): void {
    for (const settle of this.pendingRequests.values()) {
      settle(null);
    }
    this.pendingRequests.clear();
  }
}

let singletonCaptureServiceManager: CaptureServiceManager | null = null;

export function getCaptureServiceManager(): CaptureServiceManager {
  if (!singletonCaptureServiceManager) {
    singletonCaptureServiceManager = new CaptureServiceManager();
  }
  return singletonCaptureServiceManager;
}
