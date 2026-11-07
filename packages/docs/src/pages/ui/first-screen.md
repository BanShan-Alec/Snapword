---

title: 首屏体验（Startup-orchestration）
description: 动画、React 首帧与主进程就绪三路门禁协调揭幕，内联启动壳顶住白屏空窗期。
---

# 首屏体验（Startup-orchestration）

> **TL;DR**：React 挂载前由轻量内联 HTML 启动壳顶住白屏；构建内联的启动协调器（Coordinator）等待 Logo 动画、React 首帧与主进程就绪三路门禁齐备后交叉揭幕，任一路失联均有超时兜底。

## 1. 选型理由

桌面应用从双击图标到首屏完全可交互，中间面临三重不确定性：
1. **白屏闪烁**：Chromium 渲染进程解析庞大 JS 产物时页面空白。
2. **时序割裂**：前端 React 已经渲染完成，但主进程的核心控制器或配置存储尚未就绪，导致用户点击触发空指针。
3. **死锁风险**：若强依赖某单一路就绪信号，一旦发生异常（如主进程 IPC 假死），应用将永久卡在 Loading 骨架屏。

传统社区实践常采用 `show: false` 配合 `ready-to-show` 事件再呈现窗口，但这会导致用户双击桌面图标后在数百毫秒内没有任何物理界面出现，产生严重的“假死未启动”迟滞感。本项目刻意采用**「窗口创建即显示 + 底色对齐 + 裸 DOM 启动壳即刻呈现」**，在首帧瞬间给用户即时视觉反馈，再由启动协调器进行三道门禁汇流与超时兜底。

## 2. 核心机制

```mermaid
flowchart TB
  subgraph renderer["渲染进程（Renderer）"]
    StartupReadyNotifier["StartupReadyNotifier<br/>React 首帧 commit"]
    animation["animation 门禁<br/>animationend"]
    react["react 门禁<br/>app-react-startup-ready"]
    main["main 门禁"]
    settleGate["settleGate(id)"]
    tryFinishStartup["tryFinishStartup()"]
    APP_STARTUP_READY_CLASS["揭幕<br/>body.app-startup-ready"]
    STARTUP_ANIMATION_FALLBACK_MS["超时 1s"]
    STARTUP_REACT_FALLBACK_MS["超时 3s"]
    STARTUP_MAIN_FALLBACK_MS["超时 5s"]
  end
  subgraph preload["Preload（隔离桥）· api.startup"]
    getSnapshot["getSnapshot()<br/>先拉快照"]
    APP_STARTUP_MAIN_READY_EVENT["APP_STARTUP_MAIN_READY_EVENT<br/>后事件补推"]
  end
  subgraph mainProcess["主进程（Main）· startup-readiness.module"]
    startupReadiness["enable() 置 mainReady<br/>并广播"]
  end
  StartupReadyNotifier --> react
  animation & react & main --> settleGate
  STARTUP_ANIMATION_FALLBACK_MS & STARTUP_REACT_FALLBACK_MS & STARTUP_MAIN_FALLBACK_MS -.-> settleGate
  settleGate --> tryFinishStartup
  tryFinishStartup --> APP_STARTUP_READY_CLASS
  startupReadiness -->|"快照"| getSnapshot
  startupReadiness -->|"推送"| APP_STARTUP_MAIN_READY_EVENT
  getSnapshot -->|"先拉"| main
  APP_STARTUP_MAIN_READY_EVENT -->|"后推"| main
```

协调器由构建期插件 `startup-shell` 打包为经典 IIFE 内联进 `index.html`，先于 React 执行。它维护门禁注册表：`pendingGates` 初始装齐 `animation` / `react` / `main`，每路就绪调用一次 `settleGate`；集合清空后由 `tryFinishStartup` 统一揭幕，`finished` 保证只执行一次。

### 关键实现：门禁结算与揭幕

→ 源码：[packages/renderer/plugins/startup/coordinator.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/plugins/startup/coordinator.ts)

节选：`coordinator.ts` 的门禁结算与揭幕函数（`finished` / `pendingGates` / `GateId` 为同文件模块级状态）：

```ts
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
```

主进程门禁最容易漏信号：主进程侧 [startup-readiness.module.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/startup-readiness.module.ts) 的 `enable()` 在窗口创建前就完成并广播，监听器可能尚未挂载；preload 侧 [index.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/preload/src/index.ts) 在求值期即预取快照。协调器因此「先拉后推」——先调 `api.startup.getSnapshot()` 取快照，`mainReady` 为真立即放行；再监听 `APP_STARTUP_MAIN_READY_EVENT` 补推；最后以 `STARTUP_MAIN_FALLBACK_MS`（5s）兜底。无 `api.startup` 的纯浏览器调试环境直接放行，不阻塞揭幕。

## 3. 桌面端避坑注意事项

- **首屏协调器与 CSP 生产策略协同**：
  - 启动协调器是构建期直接内联到 `index.html` 的独立原生脚本。主进程在配置生产态 CSP 时，`script-src` 必须包含 `'unsafe-inline'`（或匹配 hash），否则协调器会被 Chromium 静默阻断，导致三门禁永远无法结算揭幕，造成应用与自动化测试无死锁假死。
- **产物冒烟严禁断言静态 `#root` 假阳性**：
  - 许多冒烟测试仅断言 HTML 包含 `<div id="root">` 便判定渲染成功，此时页面可能因 JS 语法错误处于彻底白屏。产物校验脚本必须等待 `page.waitForSelector('body.app-startup-ready')`，断言协调器真实完成揭幕。
- **三门禁超时兜底单一真源**：
  - `STARTUP_ANIMATION_FALLBACK_MS`（1s）、`STARTUP_REACT_FALLBACK_MS`（3s）、`STARTUP_MAIN_FALLBACK_MS`（5s）常量统一定义在 `@app/shared`，严禁在渲染端与主进程分别硬编码数字。
- **裸 DOM 启动壳样式不引外部资源**：
  - 启动壳 CSS 必须直接内联在 HTML `<style>` 标签中，严禁引用外部字体或外链图片，确保在最慢的物理磁盘上也能在首帧瞬间呈现。
