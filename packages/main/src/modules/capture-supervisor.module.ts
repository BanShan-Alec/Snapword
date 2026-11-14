import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import {
  CAPTURE_PROTOCOL_VERSION,
  type CaptureConfig,
  type CaptureMessage,
  type CaptureServiceState,
  DEFAULT_CAPTURE_CONFIG,
  type SelectionPayload,
  type ServiceStatusMessage,
} from '@app/shared/schemas/capture';
import { app, type ForkOptions, utilityProcess } from 'electron';
import type { AppModule } from '../AppModule';
import { appLifecycle } from '../lifecycle';
import type { ModuleContext } from '../ModuleContext';
import { getLogManager } from './log.module';

export interface UtilityProcessLike {
  pid?: number;
  postMessage(message: unknown): void;
  kill(): boolean;
  // biome-ignore lint/suspicious/noExplicitAny: event handler signature
  on(event: 'message', listener: (message: any) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'spawn', listener: () => void): this;
  // biome-ignore lint/suspicious/noExplicitAny: event handler signature
  removeListener(event: string, listener: (...args: any[]) => void): this;
}

export type UtilityProcessForkFn = (
  modulePath: string,
  args?: string[],
  options?: ForkOptions,
) => UtilityProcessLike;

export interface CaptureSupervisorOptions {
  servicePath?: string;
  forkFn?: UtilityProcessForkFn;
  handshakeTimeoutMs?: number;
  heartbeatCheckIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxRestarts?: number;
  backoffDelays?: number[];
  shutdownTimeoutMs?: number;
  config?: CaptureConfig;
}

interface PendingRequest {
  resolve: (payload: SelectionPayload) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * CaptureSupervisorModule
 * 取词子进程高可用生命周期管理器与 IPC 守护进程 (Slice-01)
 */
export class CaptureSupervisorModule implements AppModule {
  private readonly options: Required<CaptureSupervisorOptions>;
  private readonly logger = getLogManager().scoped('CaptureSupervisor');
  private readonly emitter = new EventEmitter();

  private child: UtilityProcessLike | null = null;
  private captureReady = false;
  private serviceState: CaptureServiceState = 'starting';
  private restartCount = 0;
  private lastHeartbeatAt = 0;
  private configRevision = 1;

  private isStopping = false;
  private isShutdownComplete = false;
  private shutdownResolve: (() => void) | null = null;

  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatCheckTimer: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(options?: CaptureSupervisorOptions) {
    this.options = {
      servicePath: options?.servicePath ?? '',
      forkFn:
        options?.forkFn ??
        ((m, a, o) => utilityProcess.fork(m, a ?? [], o ?? {}) as unknown as UtilityProcessLike),
      handshakeTimeoutMs: options?.handshakeTimeoutMs ?? 5000,
      heartbeatCheckIntervalMs: options?.heartbeatCheckIntervalMs ?? 5000,
      heartbeatTimeoutMs: options?.heartbeatTimeoutMs ?? 12000,
      maxRestarts: options?.maxRestarts ?? 3,
      backoffDelays: options?.backoffDelays ?? [1000, 2000, 4000],
      shutdownTimeoutMs: options?.shutdownTimeoutMs ?? 1000,
      config: options?.config ?? { ...DEFAULT_CAPTURE_CONFIG },
    };
  }

  public enable({ app: electronApp }: ModuleContext): void {
    if (typeof electronApp?.on === 'function') {
      electronApp.on('before-quit', (event) => {
        if (this.child && !this.isShutdownComplete) {
          if (!this.isStopping) {
            event.preventDefault();
            this.isStopping = true;
            void this.shutdown().finally(() => {
              this.isShutdownComplete = true;
              electronApp.quit();
            });
          } else {
            event.preventDefault();
          }
        }
      });
    }

    if (electronApp?.whenReady) {
      electronApp.whenReady().then(() => {
        if (!appLifecycle.isQuitting) {
          this.start();
        }
      });
    } else {
      this.start();
    }
  }

  public isReady(): boolean {
    return this.captureReady;
  }

  public getState(): CaptureServiceState {
    return this.serviceState;
  }

  public getRestartCount(): number {
    return this.restartCount;
  }

  public getChild(): UtilityProcessLike | null {
    return this.child;
  }

  public getLastHeartbeatAt(): number {
    return this.lastHeartbeatAt;
  }

  /**
   * 启动 utilityProcess 取词服务
   */
  public start(): void {
    if (this.child || this.isStopping || appLifecycle.isQuitting) {
      return;
    }

    const servicePath = this.resolveServicePath();
    this.logger.info(`Starting capture utilityProcess from: ${servicePath}`);

    try {
      this.child = this.options.forkFn(servicePath, [], {
        serviceName: 'snapword-capture',
        stdio: 'inherit',
      });
    } catch (err) {
      this.logger.error('Failed to fork capture utilityProcess:', err);
      this.handleProcessCrash(-1, 'ForkFailed');
      return;
    }

    this.captureReady = false;
    this.serviceState = 'starting';

    this.child.on('message', (msg: unknown) => {
      this.handleChildMessage(msg);
    });

    this.child.on('exit', (code: number) => {
      this.handleChildExit(code);
    });

    this.child.on('error', (err: Error) => {
      this.logger.error('Capture utilityProcess encountered error:', err);
    });

    // 握手 5s 超时守卫 (B-02 §1 & §8)
    this.handshakeTimer = setTimeout(() => {
      if (this.serviceState === 'starting') {
        this.logger.warn('Capture service handshake timed out after 5000ms');
        this.killChild();
        this.handleProcessCrash(-1, 'HandshakeTimeout');
      }
    }, this.options.handshakeTimeoutMs);
  }

  /**
   * 平敏关闭取词守护进程（1 秒超时强杀，B-02 §1 & §8）
   */
  public async shutdown(): Promise<void> {
    this.isStopping = true;
    this.clearAllTimers();

    if (!this.child) {
      this.serviceState = 'stopping';
      return;
    }

    const currentChild = this.child;
    const requestId = crypto.randomUUID();

    try {
      const ackPromise = new Promise<void>((resolve) => {
        this.shutdownResolve = resolve;
      });

      this.postToChild({
        type: 'shutdown',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId,
        reason: 'app_quit',
      });

      await Promise.race([
        ackPromise,
        new Promise<void>((resolve) => setTimeout(resolve, this.options.shutdownTimeoutMs)),
      ]);
    } catch {
      // 容错处理
    } finally {
      this.shutdownResolve = null;
      try {
        currentChild.kill();
      } catch {
        // 子进程可能已退出
      }
      if (this.child === currentChild) {
        this.child = null;
      }
      this.captureReady = false;
      this.serviceState = 'stopping';
      this.rejectAllPendingRequests(new Error('ServiceStopped'));
    }
  }

  /**
   * 手动触发当前前台实时取词探测
   */
  public async captureCurrent(
    reason: 'hotkey' | 'diagnose' = 'hotkey',
    timeoutMs = 500,
  ): Promise<SelectionPayload> {
    if (!this.captureReady || !this.child) {
      throw new Error('ServiceNotReady');
    }

    const requestId = crypto.randomUUID();
    return new Promise<SelectionPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Timeout'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      this.postToChild({
        type: 'capture_current',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId,
        reason,
        timeoutMs,
      });
    });
  }

  /**
   * 发送消息给取词子进程
   */
  public postToChild(message: unknown): void {
    if (this.child) {
      try {
        this.child.postMessage(message);
      } catch (err) {
        this.logger.warn('Failed to post message to capture child:', err);
      }
    }
  }

  /**
   * 重置重启退避计数（服务长期稳定后由主进程恢复健康状态）
   */
  public resetRestartCount(): void {
    this.restartCount = 0;
  }

  // 事件监听封装
  public on(event: 'dot_clicked', listener: (payload: SelectionPayload) => void): this;
  public on(event: 'capture_result', listener: (payload: SelectionPayload) => void): this;
  public on(event: 'status', listener: (status: ServiceStatusMessage) => void): this;
  public on(
    event: 'degraded',
    listener: (info: { restartCount: number; reason: string }) => void,
  ): this;
  public on(event: 'ready', listener: () => void): this;
  // biome-ignore lint/suspicious/noExplicitAny: EventEmitter event map
  public on(event: string, listener: (...args: any[]) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  // biome-ignore lint/suspicious/noExplicitAny: EventEmitter event map
  public off(event: string, listener: (...args: any[]) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  /**
   * 解析 capture-service.cjs 路径
   */
  private resolveServicePath(): string {
    if (this.options.servicePath) {
      return this.options.servicePath;
    }

    if (app?.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar', 'dist', 'capture-service.cjs');
    }

    // 开发与测试阶段：指向 main/dist/capture-service.cjs 或相对于当前目录
    return path.join(__dirname, 'capture-service.cjs');
  }

  /**
   * 处理子进程发来的 IPC 消息
   */
  private handleChildMessage(rawMsg: unknown): void {
    if (!rawMsg || typeof rawMsg !== 'object' || !('type' in rawMsg)) {
      return;
    }

    const msg = rawMsg as CaptureMessage;

    // 协议版本校验 (B-02 §2.1 & §9)
    if (msg.protocolVersion !== CAPTURE_PROTOCOL_VERSION) {
      this.logger.error(
        `Capture protocol version mismatch (expected ${CAPTURE_PROTOCOL_VERSION}, got ${msg.protocolVersion}). Killing child.`,
      );
      this.killChild();
      this.handleProcessCrash(-1, 'ProtocolVersionMismatch');
      return;
    }

    switch (msg.type) {
      case 'hello': {
        // 步骤 2：收到 hello，清除握手超时计时器并回复 hello_ack
        if (this.handshakeTimer) {
          clearTimeout(this.handshakeTimer);
          this.handshakeTimer = null;
        }

        const currentConfig = this.options.config;
        this.postToChild({
          type: 'hello_ack',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          appVersion: app?.getVersion ? app.getVersion() : '1.0.0',
          configRevision: this.configRevision,
          config: currentConfig,
        });
        break;
      }

      case 'config_ack': {
        // 步骤 3：收到 config_ack，标记 captureReady 并启动 12s 心跳监控
        this.captureReady = true;
        this.serviceState = 'ready';
        this.lastHeartbeatAt = Date.now();

        this.startHeartbeatMonitor();
        this.scheduleStableReset();

        this.emitter.emit('ready');
        this.logger.info('Capture service handshake completed and ready');
        break;
      }

      case 'service_status': {
        // 收到心跳状态
        this.lastHeartbeatAt = Date.now();
        this.serviceState = msg.state;
        this.emitter.emit('status', msg);
        break;
      }

      case 'capture_result': {
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.requestId);
          pending.resolve(msg.payload);
        }
        this.emitter.emit('capture_result', msg.payload);
        break;
      }

      case 'capture_error': {
        if (msg.requestId) {
          const pending = this.pendingRequests.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(msg.requestId);
            pending.reject(new Error(msg.code || 'CaptureFailed'));
          }
        }
        break;
      }

      case 'dot_clicked': {
        this.emitter.emit('dot_clicked', msg.payload);
        // 主进程收到 dot_clicked 后立即发 hide_dot (B-02 §7)
        this.postToChild({
          type: 'hide_dot',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          reason: 'card_opened',
        });
        break;
      }

      case 'shutdown_ack': {
        if (this.shutdownResolve) {
          this.shutdownResolve();
          this.shutdownResolve = null;
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * 处理子进程意外退出
   */
  private handleChildExit(code: number): void {
    if (!this.child) {
      // 已被 killChild() 或 shutdown() 处理，忽略冗余 exit 回调
      return;
    }

    this.logger.warn(`Capture utilityProcess exited with code: ${code}`);
    this.child = null;
    this.captureReady = false;
    this.clearAllTimers();
    this.rejectAllPendingRequests(new Error('ServiceExited'));

    if (this.isStopping || appLifecycle.isQuitting) {
      this.serviceState = 'stopping';
      return;
    }

    this.handleProcessCrash(code, 'ProcessExit');
  }

  /**
   * 启动 12 秒心跳缺失巡检
   */
  private startHeartbeatMonitor(): void {
    if (this.heartbeatCheckTimer) {
      clearInterval(this.heartbeatCheckTimer);
    }

    this.heartbeatCheckTimer = setInterval(() => {
      if (this.isStopping || appLifecycle.isQuitting || !this.captureReady) {
        return;
      }

      const elapsed = Date.now() - this.lastHeartbeatAt;
      if (elapsed > this.options.heartbeatTimeoutMs) {
        this.logger.error(
          `Capture service heartbeat missing for ${elapsed}ms (> ${this.options.heartbeatTimeoutMs}ms). Terminating dead process.`,
        );
        this.killChild();
        this.handleProcessCrash(-1, 'HeartbeatTimeout');
      }
    }, this.options.heartbeatCheckIntervalMs);
  }

  /**
   * 异常崩溃处理与指数退避自动重启 (1s, 2s, 4s)
   */
  private handleProcessCrash(code: number, reason: string): void {
    if (this.isStopping || appLifecycle.isQuitting) {
      return;
    }

    this.captureReady = false;
    this.clearAllTimers();
    this.restartCount += 1;

    if (this.restartCount <= 2) {
      // 前 2 次静默重启
      const delay = this.options.backoffDelays[this.restartCount - 1] ?? 1000;
      this.logger.warn(
        `Capture process exited (code: ${code}, reason: ${reason}). Scheduling silent restart #${this.restartCount} in ${delay}ms`,
      );
      this.serviceState = 'starting';

      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.start();
      }, delay);
    } else if (this.restartCount === 3) {
      // 第 3 次报警并降级
      const delay = this.options.backoffDelays[2] ?? 4000;
      this.serviceState = 'degraded';
      this.logger.error(
        `Capture process crashed repeatedly (attempt #${this.restartCount}, reason: ${reason}). Degraded mode entered; scheduling final restart in ${delay}ms`,
      );
      this.emitter.emit('degraded', { restartCount: this.restartCount, reason });

      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.start();
      }, delay);
    } else {
      // 超过 3 次重启，停止死循环重试
      this.serviceState = 'degraded';
      this.logger.error(
        `Capture process crashed ${this.restartCount} times. Automatic restart halted to prevent infinite loops.`,
      );
      this.emitter.emit('degraded', { restartCount: this.restartCount, reason });
    }
  }

  /**
   * 强杀当前子进程
   */
  private killChild(): void {
    if (this.child) {
      const current = this.child;
      this.child = null;
      try {
        current.kill();
      } catch {
        // ignore
      }
    }
    this.captureReady = false;
  }

  /**
   * 稳定运行一段时间后重置重启退避计数
   */
  private scheduleStableReset(): void {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
    }
    // 连续稳定运行 30 秒后重置崩溃计数
    this.stableTimer = setTimeout(() => {
      if (this.captureReady && this.serviceState === 'ready') {
        this.resetRestartCount();
      }
    }, 30000);
  }

  private clearAllTimers(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    if (this.heartbeatCheckTimer) {
      clearInterval(this.heartbeatCheckTimer);
      this.heartbeatCheckTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
  }

  private rejectAllPendingRequests(err: Error): void {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pendingRequests.delete(requestId);
    }
  }
}

let singletonCaptureSupervisor: CaptureSupervisorModule | null = null;

export function getCaptureSupervisorModule(): CaptureSupervisorModule {
  if (!singletonCaptureSupervisor) {
    singletonCaptureSupervisor = new CaptureSupervisorModule();
  }
  return singletonCaptureSupervisor;
}

export function createCaptureSupervisorModule(
  options?: CaptureSupervisorOptions,
): CaptureSupervisorModule {
  if (!singletonCaptureSupervisor) {
    singletonCaptureSupervisor = new CaptureSupervisorModule(options);
  }
  return singletonCaptureSupervisor;
}
