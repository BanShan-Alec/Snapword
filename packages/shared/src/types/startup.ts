/**
 * 启动就绪契约类型 (Startup Readiness Types)
 * 跨主进程 / preload / 渲染端共享，见 specs/first-screen-loading.md §4.6
 */

/** 主进程就绪信号负载：ModuleRunner 链初始化完成的耗时数据 */
export interface StartupMainReadyPayload {
  /** 主进程启动到就绪链完成的耗时（毫秒，performance.now() 以进程启动为锚） */
  initMs: number;
  /** 闩锁落定时间戳（Date.now()） */
  latchedAt: number;
}

/** 主进程就绪闩锁快照：引导期一次性拉取，先到的信号经此补发（不丢） */
export interface StartupGateSnapshot {
  mainReady: boolean;
  payload: StartupMainReadyPayload | null;
}
