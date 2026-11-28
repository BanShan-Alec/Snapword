# ADR-0005：卡片窗口启动动作采用 Preload Sticky Event Replay 模式

- 状态：已接受
- 日期：2026-11-16
- 相关：PRD RC-01 / RC-02、`packages/preload/src/index.ts`、`packages/renderer/src/features/card/hooks/useCardTranslation.ts`、`packages/main/src/modules/window/card-window.module.ts`

## 背景

在用户通过划词圆点或全局热键触发卡片翻译时，主进程（`CardWindowModule`）创建或展示置顶无焦点窗口（`BrowserWindow`），并通过 IPC 向卡片渲染进程派发动作（`CardActionPayload`）。

此前存在生命周期竞态问题：
1. 主进程调用 `showCard` 时可能触发 `window.loadURL` 或渲染进程重新挂载；
2. 若主进程在 React 组件挂载并注册监听器（`window.api.card.onAction`）之前发送 IPC 事件 `card:event-action`，渲染进程会丢失该初始事件；
3. 为缓解该问题，之前引入了双通道机制：除 `onAction` 监听外，新增了 `card:get-action` 双向拉取 IPC 通道（`invoke`），让 React `useEffect` 在初次挂载时主动拉取一次主进程持有的 `currentAction`。

然而，拉取通道方案带来了多重架构缺陷：
- **职责割裂与双重事实源**：卡片动作用两套完全不同的通信管道传递（主动 push 与被动 pull），需在卡片 Hook 内处理竞态去重；
- **跨进程通信开销**：每次卡片打开和挂载多了一次跨进程的 IPC Round-Trip；
- **契约膨胀**：在 `@app/shared`、`@app/preload`、`@app/main` 的 API 与通道层增加了维护成本；
- **测试与排查难度**：时序依赖使得卡片在热重载或快速连续唤起时更容易出现偶发性重复请求或闪烁。

## 决策

1. **废弃主动拉取通道**：
   - 彻底删除 `card:get-action` IPC 通道及其控制器方法 `handleTraced(IPC_CHANNELS.CARD_GET_ACTION, ...)`；
   - 在 `@app/shared` 中移除 `ElectronApi.card.getAction` 契约定义。
2. **在 Preload 桥接层引入 Sticky Event Replay（粘性事件重放）模式**：
   - Preload 初始化时常驻监听来自主进程的 `card:event-action`，将最新的 `CardActionPayload` 缓存在闭包变量 `latestCardAction`；
   - 当 React 组件调用 `window.api.card.onAction(callback)` 注册监听时，若 `latestCardAction` 已有缓存，利用微任务（`queueMicrotask`）立即向该回调函数重放最新的动作；
   - 后续任何新到达的 `card:event-action` 会先更新 `latestCardAction`，再实时广播给所有已注册的活跃监听器；
   - 监听器解绑时返回对应的 cleanup 函数。
3. **渲染进程单通道归一**：
   - 卡片渲染进程只消费统一的 `cardApi.onAction((action) => { ... })`，无需关心窗口当前是刚创建还是早已常驻。

## 理由

- **优雅消除时序竞争**：Preload 脚本在 DOM 构建与 React 脚本执行之前即已完成注入与执行。无论主进程在 `did-finish-load` 前后何时发送 IPC，Preload 都能 100% 捕获该事件并暂存，React 挂载后注册即刻收到重放，零丢失。
- **免除额外 IPC 开销**：消除了渲染进程到主进程的 `invoke` 往返通信，直接由 Preload 同步/微任务重放，首屏渲染与翻译发起更快。
- **单一职责与单一事实源**：事件从主进程到渲染进程只有一条流向（Push），不混用 Pull 与 Push，契约精简清晰。
- **与 RxJS/EventStore ReplaySubject 范式契合**：粘性广播（Sticky / Replay）是桌面 GUI 与移动操作系统（如 Android Sticky Broadcast、现代前端状态流）解决生命周期迟到监听的标准成熟模式。

## 后果

- `@app/shared`：移除了 `CARD_GET_ACTION` 常量及对应类型定义。
- `@app/preload`：在 `window.api.card` 闭包内维护 `latestCardAction` 与 `Set<Callback>`，实现自动粘性重放。
- `@app/renderer`：`useCardTranslation` 移除了 `getAction` 调用与冗余的双通道去重逻辑，代码更加内聚纯粹。
- 自动化测试与 CI 门禁全面保持绿灯。

## 备选方案

- **主进程预热窗口（Pre-warm Window）**：应用启动时预先创建并加载隐藏的 Card 窗口，避免首次打开冷启动。
  - _否决原因_：增加常驻内存占用与显存开销，违反轻量化设计原则，且无法彻底解决 React 树卸载重载时的挂载时序。
- **React 挂载后通过 IPC 通知主进程就绪（Ready Handshake）**：卡片挂载后发 `card:ready`，主进程收到后再下发 action。
  - _否决原因_：增加了两次 IPC 往返延迟，并且在连续取词或窗口复用场景下握手状态管理繁琐脆弱。
