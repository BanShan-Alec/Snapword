/**
 * 启动壳就绪契约常量 (Startup Readiness Contract)
 *
 * 三端耦合的单一事实源：渲染端引导层（plugins/startup/coordinator.ts，构建期内联）、
 * React 通知器（StartupReadyNotifier）与 E2E 断言。改名必须跨端同步，唯一定义在本文件。
 */

/** 壳就绪后挂在 body 上的类名：触发 #root 与 #loading 的 0.16s 交叉淡入 */
export const APP_STARTUP_READY_CLASS = 'app-startup-ready';

/** React 首帧 commit 就绪 DOM 事件名（StartupReadyNotifier 派发 → 协调器门禁监听） */
export const APP_REACT_STARTUP_READY_EVENT = 'app-react-startup-ready';

/** React 首帧 commit 时间戳在 window 上的键名（等价上游 T5 reactCommit 埋点） */
export const APP_REACT_COMMIT_AT_KEY = '__APP_REACT_COMMIT_AT__';

/**
 * 门禁兜底时值：任一就绪源在时限内未到达时强制放行，避免启动壳永久卡死。
 * 渲染协调器（构建期内联）与 E2E 断言共用，禁止在两处各写一套。
 */
export const STARTUP_ANIMATION_FALLBACK_MS = 1000;
export const STARTUP_REACT_FALLBACK_MS = 3000;

/** 就绪后延迟移除加载壳，留出交叉淡入窗口 */
export const STARTUP_UNMOUNT_DELAY_MS = 500;
