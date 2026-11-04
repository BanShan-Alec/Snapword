import {
  APP_REACT_STARTUP_READY_EVENT,
  APP_STARTUP_MAIN_READY_EVENT,
  APP_STARTUP_READY_CLASS,
  STARTUP_ANIMATION_FALLBACK_MS,
  STARTUP_MAIN_FALLBACK_MS,
  STARTUP_REACT_FALLBACK_MS,
  STARTUP_UNMOUNT_DELAY_MS,
} from '@app/shared/constants/startup';

/**
 * 启动壳门禁注册表就绪协调器（specs/first-screen-loading.md §4.3 / D9）
 *
 * React 引导前的裸 DOM 引导层：构建期经 plugins/startup-shell.ts
 * 打包为经典 IIFE 内联进 index.html（先于 main.tsx 执行），豁免 7 段式模板；
 * import 面仅限 @app/shared/constants 纯常量（壳产物自足红线 §6.1）。
 *
 * 门禁注册表：所有就绪源（动画 / React 首帧 / 主进程）齐备才交叉淡入；
 * 新增就绪源 = 加一个 GateId + 一段注册代码 + 一个兜底常量。
 */

// 私有常量
const LOGO_SHELL_SELECTOR = '.startup-logo-shell';
const LOADING_ELEMENT_ID = 'loading';

// 门禁注册表状态：待齐备门禁集合与完成标记（裸 DOM 引导层，豁免 7 段式模板，无锚点约束）
type GateId = 'animation' | 'react' | 'main';

/** 主进程就绪桥的结构视图：contextIsolation 下经 api.startup 暴露（不存在时主门禁立即放行） */
type StartupBridgeLike = {
  getSnapshot: () => Promise<{ mainReady: boolean }>;
};

let finished = false;
const pendingGates = new Set<GateId>(['animation', 'react', 'main']);

const tryFinishStartup = () => {
  if (finished || pendingGates.size > 0) return;
  finished = true;
  document.body.classList.add(APP_STARTUP_READY_CLASS);
  window.setTimeout(
    () => document.getElementById(LOADING_ELEMENT_ID)?.remove(),
    STARTUP_UNMOUNT_DELAY_MS,
  );
};

const settleGate = (id: GateId) => {
  if (finished) return;
  pendingGates.delete(id);
  tryFinishStartup();
};

// 门禁一：壳弹出动画（跳过动画、reduced-motion 或元素缺失时直接放行）
const startupLogoShell = document.querySelector(LOGO_SHELL_SELECTOR);
const skipAnimation =
  window.location.search.includes('skip_animation') ||
  document.documentElement.classList.contains('skip-startup-animation');
if (
  skipAnimation ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  !startupLogoShell
) {
  settleGate('animation');
} else {
  startupLogoShell.addEventListener('animationend', () => settleGate('animation'), { once: true });
  window.setTimeout(() => settleGate('animation'), STARTUP_ANIMATION_FALLBACK_MS);
}

// 门禁二：React 首帧 commit（含兜底，React 侧派发见 StartupReadyNotifier）
window.addEventListener(APP_REACT_STARTUP_READY_EVENT, () => settleGate('react'), { once: true });
window.setTimeout(() => settleGate('react'), STARTUP_REACT_FALLBACK_MS);

// 门禁三：主进程就绪（先拉后推，先到信号经快照补发不丢；就绪源见 startup-readiness.module）
const bridge = (window as { api?: { startup?: StartupBridgeLike } }).api?.startup;
if (!bridge) {
  settleGate('main'); // 无 preload 桥的异常环境不阻塞壳
} else {
  bridge
    .getSnapshot()
    .then((snapshot) => {
      if (snapshot.mainReady) settleGate('main');
    })
    .catch(() => {}); // 拉取失败交给事件与兜底路径
  window.addEventListener(APP_STARTUP_MAIN_READY_EVENT, () => settleGate('main'), { once: true });
  window.setTimeout(() => settleGate('main'), STARTUP_MAIN_FALLBACK_MS);
}
