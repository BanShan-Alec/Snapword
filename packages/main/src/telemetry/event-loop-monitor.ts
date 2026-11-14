import { performance } from 'node:perf_hooks';

// 私有常量
// setImmediate 在空闲事件循环中的固有调度开销基线（通常 < 0.2ms）
const SET_IMMEDIATE_BASELINE_MS = 0.2;
// 忽略微小抖动的上报门限（低于此值视为事件循环完全畅通）
const MIN_REPORTED_LAG_MS = 0.5;

/**
 * Node.js 主进程 Event Loop 滞后实时采样器
 *
 * 采用 libuv check 阶段的 setImmediate 循环探测事件循环调度滞后，
 * 避免 Windows 平台下 monitorEventLoopDelay 受 15.6ms 操作系统定时器中断精度限制的问题。
 */
export class EventLoopLagMonitor {
  private maxLagMs = 0;
  private isSampling = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly sampleIntervalMs = 20;

  constructor() {
    this.start();
  }

  public start(): void {
    if (this.isSampling) return;
    this.isSampling = true;

    const sample = () => {
      if (!this.isSampling) return;
      const start = performance.now();
      setImmediate(() => {
        const delta = performance.now() - start;
        const lag = Math.max(0, delta - SET_IMMEDIATE_BASELINE_MS);
        if (lag > this.maxLagMs) {
          this.maxLagMs = lag;
        }
        if (this.isSampling) {
          this.timer = setTimeout(sample, this.sampleIntervalMs);
          this.timer.unref();
        }
      });
    };

    sample();
  }

  public stop(): void {
    this.isSampling = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * 获取最近采样窗口内的最大滞后并重置统计
   */
  public getLagAndReset(): number {
    const lag = Math.round(this.maxLagMs * 10) / 10;
    this.maxLagMs = 0;
    return lag > MIN_REPORTED_LAG_MS ? lag : 0;
  }
}

export const eventLoopMonitor = new EventLoopLagMonitor();
