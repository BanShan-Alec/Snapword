---

title: 首次关闭确认（Close-confirmation）
description: 拦截主窗口首次关闭事件，交互确认托盘常驻或彻底退出，配置持久化与设置页反悔入口。
---

# 首次关闭确认（Close-confirmation）

> **TL;DR**：主进程拦截主窗口的首次点击关闭事件，唤起确认弹窗由用户决策是「最小化到托盘」还是「彻底退出应用」；该选择持久化至用户配置中，并在设置页面提供随时反悔的修改开关。

## 1. 选型理由

桌面应用的关闭按钮（右上角 `X`）存在认知分歧：
- 用户期望关闭窗口后后台继续同步或保留托盘通知，直接退出应用会造成业务中断。
- 若默认静默最小化到托盘，部分用户会误以为程序卡死或无法彻底关闭。

工程通过「首次关闭拦截确认 + 偏好记忆 + 设置页反悔」提供人性化体验。

## 2. 核心机制

### 主进程首次关闭拦截

主进程监听窗口 `close` 事件，未确认时拦截默认行为并向渲染端广播 `WINDOW_CLOSE_REQUESTED`：

→ 源码：[packages/main/src/modules/window/index.module.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/window/index.module.ts)

```ts
browserWindow.on('close', (event) => {
  if (this.closeGuardBypass) {
    this.closeGuardBypass = false;
    return; // 放行自然销毁
  }

  const store = getAppConfigStore();
  const confirmed = store.get('closeBehaviorConfirmed');

  // 若尚未确认过偏好，拦截默认关闭并派发询问事件
  if (!confirmed) {
    event.preventDefault();
    this.closeRequestPending = true;
    sendToWindow(WINDOW_IDS.HOME, IPC_CHANNELS.WINDOW_CLOSE_REQUESTED);
    return;
  }

  // 已确认偏好：若为退出应用，按需终止在途下载并退出；若退守托盘则放行窗口销毁
});
```

### 渲染端交互弹窗与决策回传（closeRespond）

前端接收到关闭请求后唤起 Ant Design 对话框，由用户决定策略并通过受限 API 回传：

→ 源码：[packages/renderer/src/components/close-behavior/CloseBehaviorDialog/index.tsx](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/src/components/close-behavior/CloseBehaviorDialog/index.tsx)

```tsx
const respond = async (choice: CloseBehaviorChoice) => {
  currentModal?.destroy();
  // 经请求层向主进程提交用户决策（'window' | 'quit' | 'cancel'）
  await callIpc('window:close-respond', window.api.window.closeRespond, [choice]);
};

// 订阅主进程发送的首次关闭拦截信号
const unsubscribe = window.api.window.onCloseRequested(showPrompt);
```

主进程接收到 `'window'`（留在托盘）或 `'quit'`（退出）后，将配置持久化至 `userData/config.json`，并置位 `closeBehaviorConfirmed: true`，后续关闭不再弹窗。

## 3. 桌面端避坑注意事项

- **模态框焦点管理与无障碍对齐**：
  - 自定义 Footer 中的推荐操作按钮（如「留在托盘」）需配置 `autoFocus` 与 `afterOpenChange` 双重对齐焦点，避免在无头测试或纯键盘导航时因焦点未能及时转移而触发交互失败。
- **无人确认时绝不自动超时关闭**：
  - 关闭确认请求不设置任何超时自动放行兜底。如果用户离开电脑或未作选择，窗口必须保持原状，防止意外丢失尚未保存的业务数据。
- **防止重复点击引发弹窗堆叠**：
  - 用户在弹窗展开期间若连续重复点击窗口右上角 `X`，渲染进程内聚单例守卫（`if (currentModal) return;`），拦截多余的展示请求，保证界面仅存在一个模态框。
- **退出时终止在途下载**：
  - 用户若选择「彻底退出应用」，主进程在销毁前会主动取消正在后台进行的 OTA 安装包下载任务，释放文件句柄并清理临时碎片。
