import {
  CAPTURE_PROTOCOL_VERSION,
  type CaptureConfig,
  type CaptureErrorCode,
  type CaptureMessage,
  type CaptureServiceState,
  captureConfigSchema,
  DEFAULT_CAPTURE_CONFIG,
  type DotHiddenReason,
  type SelectionPayload,
} from '@app/shared/schemas/capture';
import { MockSelectionEmitter } from './mock-selection-emitter';
import {
  type INativeAddon,
  loadNativeAddon,
  type NativeDotEvent,
  type NativeProbeResult,
} from './native-addon';

export interface MessagePortLike {
  postMessage(message: unknown): void;
  // biome-ignore lint/suspicious/noExplicitAny: Support both Electron ParentPort and EventEmitter
  on(event: 'message', listener: (event: any) => void): this | void;
  // biome-ignore lint/suspicious/noExplicitAny: Support cleanup
  off?(event: 'message', listener: (event: any) => void): this | void;
  // biome-ignore lint/suspicious/noExplicitAny: Support cleanup
  removeListener?(event: string, listener: (...args: any[]) => void): this | void;
}

export interface CaptureServiceOptions {
  port?: MessagePortLike;
  exitOnShutdown?: boolean;
  heartbeatIntervalMs?: number;
  handshakeTimeoutMs?: number;
  addon?: INativeAddon;
  forceMock?: boolean;
}

/**
 * 取词守护进程实现 (CaptureService)
 * 运行在独立的 Electron utilityProcess 中，通过 parentPort 与主进程通信
 * 集成 Rust UIA 原生选区探针与 Win32 原生免激活分层圆点窗口 (Slice-06)
 */
export class CaptureService {
  private readonly port: MessagePortLike | null;
  private readonly mockEmitter: MockSelectionEmitter;
  private readonly addon: INativeAddon;
  private readonly exitOnShutdown: boolean;
  private readonly heartbeatIntervalMs: number;
  private readonly handshakeTimeoutMs: number;

  private state: CaptureServiceState = 'starting';
  private config: CaptureConfig = { ...DEFAULT_CAPTURE_CONFIG };
  private configRevision = 0;
  private startedAt: string;
  private startTime: number;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  // biome-ignore lint/suspicious/noExplicitAny: Listener type varies by runtime
  private messageListener: ((event: any) => void) | null = null;

  constructor(options?: CaptureServiceOptions) {
    this.port =
      options?.port ??
      (typeof process !== 'undefined' && process.parentPort
        ? (process.parentPort as unknown as MessagePortLike)
        : null);
    this.mockEmitter = new MockSelectionEmitter();
    this.addon = options?.addon ?? loadNativeAddon({ forceMock: options?.forceMock });
    this.exitOnShutdown = options?.exitOnShutdown ?? true;
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 5000;
    this.handshakeTimeoutMs = options?.handshakeTimeoutMs ?? 5000;
    this.startedAt = new Date().toISOString();
    this.startTime = performance.now();
  }

  public getState(): CaptureServiceState {
    return this.state;
  }

  public getConfig(): CaptureConfig {
    return this.config;
  }

  public getConfigRevision(): number {
    return this.configRevision;
  }

  public getMockEmitter(): MockSelectionEmitter {
    return this.mockEmitter;
  }

  public getAddon(): INativeAddon {
    return this.addon;
  }

  /**
   * 启动取词守护服务
   */
  public start(): void {
    if (!this.port) {
      this.state = 'degraded';
      return;
    }

    this.state = 'starting';
    this.startedAt = new Date().toISOString();
    this.startTime = performance.now();

    // 绑定消息接收器
    // biome-ignore lint/suspicious/noExplicitAny: Message wrapper
    this.messageListener = (event: any) => {
      const data = event && typeof event === 'object' && 'data' in event ? event.data : event;
      this.handleMessage(data as CaptureMessage);
    };
    this.port.on('message', this.messageListener);

    // 挂载原生圆点事件监听
    if (this.config.dotEnabled) {
      try {
        this.addon.startDot((evt: NativeDotEvent) => {
          this.handleDotEvent(evt);
        });
      } catch (err) {
        console.warn('[capture-service] Failed to start native dot window:', err);
      }
    }

    const diag = this.addon.diagnose();

    // 步骤 1：主动向主进程发送 hello 握手包 (B-02 §3.1)
    this.postMessage({
      type: 'hello',
      protocolVersion: CAPTURE_PROTOCOL_VERSION,
      sentAt: new Date().toISOString(),
      serviceVersion: '1.0.0',
      addonVersion: diag.addonVersion,
      pid: process.pid,
      startedAt: this.startedAt,
      capabilities: {
        uia: diag.uiaAvailable,
        dot: true,
        rangeFromPoint: true,
        fullscreenDetection: true,
      },
    });

    // 步骤 2：启动 5 秒握手超时检测 (B-02 §1 & §8)
    this.handshakeTimer = setTimeout(() => {
      if (this.state === 'starting') {
        this.state = 'degraded';
        if (this.exitOnShutdown) {
          process.exit(1);
        }
      }
    }, this.handshakeTimeoutMs);
  }

  /**
   * 停止取词服务并清理定时器
   */
  public stop(): void {
    this.state = 'stopping';
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    if (this.port && this.messageListener) {
      if (typeof this.port.off === 'function') {
        this.port.off('message', this.messageListener);
      } else if (typeof this.port.removeListener === 'function') {
        this.port.removeListener('message', this.messageListener);
      }
      this.messageListener = null;
    }

    try {
      this.addon.stopDot();
    } catch {
      // ignore
    }
  }

  /**
   * 派发消息到父进程
   */
  public postMessage(message: unknown): void {
    if (this.port) {
      try {
        this.port.postMessage(message);
      } catch {
        // Port closed or process terminating
      }
    }
  }

  /**
   * 处理原生圆点回调事件
   */
  private handleDotEvent(evt: NativeDotEvent): void {
    switch (evt.eventType) {
      case 'clicked': {
        if (!evt.payload) return;
        const payload = this.formatSelectionPayload(evt.payload, 'dot');
        this.postMessage({
          type: 'dot_clicked',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          seq: evt.seq,
          payload,
        });
        break;
      }

      case 'hidden': {
        this.postMessage({
          type: 'dot_hidden',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          seq: evt.seq,
          reason: (evt.reason as DotHiddenReason) || 'outside_click',
        });
        break;
      }

      case 'foreground_changed': {
        if (!evt.foreground) return;
        this.postMessage({
          type: 'foreground_changed',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          processName: evt.foreground.processName,
          processId: evt.foreground.processId,
          windowTitle: evt.foreground.windowTitle,
          isFullscreen: evt.foreground.isFullscreen,
          at: new Date().toISOString(),
        });
        break;
      }

      default:
        break;
    }
  }

  /**
   * 统一将 NativeProbeResult 格式化为契约规定的 SelectionPayload
   */
  private formatSelectionPayload(
    raw: NativeProbeResult,
    source: 'hotkey' | 'dot',
  ): SelectionPayload {
    return {
      source,
      seq: raw.seq,
      text: raw.text,
      textTruncated: raw.textTruncated,
      rects: raw.rects,
      anchor: raw.anchor,
      pointer: raw.pointer,
      processName: raw.processName,
      processId: raw.processId,
      windowTitle: raw.windowTitle,
      paragraph: raw.paragraph || raw.text,
      paragraphError: raw.paragraphError ?? null,
      paragraphTruncated: raw.paragraphTruncated,
      capturedAt: raw.capturedAt || new Date().toISOString(),
      elapsedMs: raw.elapsedMs,
      dpiScale: raw.dpiScale,
      coordinateSpace: 'dip',
      selectionRanges: raw.selectionRanges || (raw.rects.length > 0 ? 1 : 0),
      warnings: raw.warnings || [],
    };
  }

  /**
   * 处理从主进程接收到的消息
   */
  private handleMessage(msg: CaptureMessage): void {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) {
      return;
    }

    switch (msg.type) {
      case 'hello_ack': {
        if (this.handshakeTimer) {
          clearTimeout(this.handshakeTimer);
          this.handshakeTimer = null;
        }

        this.config = { ...msg.config };
        this.configRevision = msg.configRevision;
        this.state = 'ready';

        this.postMessage({
          type: 'config_ack',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          requestId: '',
          revision: this.configRevision,
          appliedAt: new Date().toISOString(),
        });

        this.startHeartbeat();
        break;
      }

      case 'config_update': {
        if (msg.revision <= this.configRevision) {
          this.postMessage({
            type: 'config_error',
            protocolVersion: CAPTURE_PROTOCOL_VERSION,
            sentAt: new Date().toISOString(),
            requestId: msg.requestId,
            revision: msg.revision,
            code: 'InvalidConfig',
            message: `Stale config revision ${msg.revision} (current: ${this.configRevision})`,
          });
          return;
        }

        const parseResult = captureConfigSchema.safeParse(msg.config);
        if (!parseResult.success) {
          this.postMessage({
            type: 'config_error',
            protocolVersion: CAPTURE_PROTOCOL_VERSION,
            sentAt: new Date().toISOString(),
            requestId: msg.requestId,
            revision: msg.revision,
            code: 'InvalidConfig',
            message: 'Config fields failed validation schema',
          });
          return;
        }

        this.config = parseResult.data;
        this.configRevision = msg.revision;

        // 根据最新配置启停圆点
        if (!this.config.dotEnabled) {
          this.addon.hideDot();
        }

        this.postMessage({
          type: 'config_ack',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          requestId: msg.requestId,
          revision: this.configRevision,
          appliedAt: new Date().toISOString(),
        });
        break;
      }

      case 'capture_current': {
        // 当前前台实时 UIA 选区探针探测 (B-02 §5.1)
        const timeoutMs = msg.timeoutMs ?? this.config.captureTimeoutMs ?? 500;
        const probeRes = this.addon.probeSelection(timeoutMs);

        if (probeRes.success && probeRes.text.trim().length > 0) {
          const payload = this.formatSelectionPayload(probeRes, 'hotkey');
          this.postMessage({
            type: 'capture_result',
            protocolVersion: CAPTURE_PROTOCOL_VERSION,
            sentAt: new Date().toISOString(),
            requestId: msg.requestId,
            payload,
          });
        } else {
          this.postMessage({
            type: 'capture_error',
            protocolVersion: CAPTURE_PROTOCOL_VERSION,
            sentAt: new Date().toISOString(),
            requestId: msg.requestId,
            seq: probeRes.seq,
            code: (probeRes.errorCode as CaptureErrorCode) || 'EmptySelection',
            message: probeRes.errorMessage || 'No valid selection found in foreground window',
            processName: probeRes.processName || 'unknown.exe',
            processId: probeRes.processId || 0,
            windowTitle: probeRes.windowTitle || '',
            elapsedMs: probeRes.elapsedMs || 0,
            retryable: probeRes.errorCode === 'Timeout' || probeRes.errorCode === 'Busy',
          });
        }
        break;
      }

      case 'hide_dot': {
        // 隐藏圆点命令 (B-02 §5.9)
        this.addon.hideDot();
        break;
      }

      case 'diagnose': {
        // 诊断请求 (B-02 §5.8)
        const diag = this.addon.diagnose();
        this.postMessage({
          type: 'diagnose_result',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          requestId: msg.requestId,
          uiaAvailable: diag.uiaAvailable,
          hookInstalled: diag.hookInstalled,
          dotVisible: diag.dotVisible,
          foreground: diag.foreground ?? {
            processName: 'unknown.exe',
            processId: 0,
            windowTitle: '',
            isFullscreen: false,
          },
          serviceVersion: '1.0.0',
          addonVersion: diag.addonVersion,
          osVersion: diag.osVersion,
          dpiScale: diag.dpiScale,
          warnings: diag.warnings,
        });
        break;
      }

      case 'mock_emit_selection': {
        // 模拟测试指令：主动触发点按或结果
        const payload = this.mockEmitter.createMockSelection({
          source: msg.override?.source ?? 'dot',
          ...msg.override,
        });

        if (msg.requestId) {
          this.postMessage({
            type: 'capture_result',
            protocolVersion: CAPTURE_PROTOCOL_VERSION,
            sentAt: new Date().toISOString(),
            requestId: msg.requestId,
            payload,
          });
        } else {
          this.postMessage({
            type: 'dot_clicked',
            protocolVersion: CAPTURE_PROTOCOL_VERSION,
            sentAt: new Date().toISOString(),
            seq: payload.seq,
            payload,
          });
        }
        break;
      }

      case 'shutdown': {
        this.stop();

        this.postMessage({
          type: 'shutdown_ack',
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sentAt: new Date().toISOString(),
          requestId: msg.requestId,
        });

        if (this.exitOnShutdown) {
          setTimeout(() => {
            process.exit(0);
          }, 10);
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * 启动 5 秒定时心跳发射 (B-02 §5.7)
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  private sendHeartbeat(): void {
    if (this.state !== 'ready' && this.state !== 'starting') {
      return;
    }

    const diag = this.addon.diagnose();

    this.postMessage({
      type: 'service_status',
      protocolVersion: CAPTURE_PROTOCOL_VERSION,
      sentAt: new Date().toISOString(),
      state: this.state,
      uiaAvailable: diag.uiaAvailable,
      hookInstalled: diag.hookInstalled,
      dotVisible: diag.dotVisible,
      serviceVersion: '1.0.0',
      addonVersion: diag.addonVersion,
      uptimeMs: Math.round(performance.now() - this.startTime),
      lastErrorCode: null,
    });
  }
}

// utilityProcess 独立启动入口
if (typeof process !== 'undefined' && process.parentPort) {
  const service = new CaptureService();
  service.start();
}
