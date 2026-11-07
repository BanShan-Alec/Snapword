---

title: 窗口位置与尺寸（Window-state）
description: 首次启动自适应工作区居中，拔屏超屏保护回退，续启交由原生 windowStatePersistence 在构造期无感恢复。
---

# 窗口位置与尺寸（Window-state）

> **TL;DR**：首次启动由纯函数计算工作区自适应居中几何并提供拔屏超屏保护；再次启动完全委托给 Electron 官方的 `windowStatePersistence` 在窗口构造期直接恢复，消灭第三方 Keeper 带来的二次尺寸抖动。

## 1. 选型理由

传统手写状态保存（如 `electron-window-state`）存在两大难以根治的痛点：
1. **二次跳动（Flicker）**：窗口先按默认大小创建，随后在 JS 逻辑中执行 `setBounds()` 或 `maximize()`，肉眼可见明显的几何跳动与卡顿。
2. **多屏拔插越界**：用户在外接 4K 大屏关闭窗口（如 1600×1000 并在右侧副屏），拔掉显示器后在笔记本单屏启动，窗口坐标落入屏幕虚无空间，用户误以为程序假死。

工程采用「首启与拔屏纯函数保护 + 续启原生持久化」的组合方案。

## 2. 核心机制

### 纯函数几何裁决与拔屏超屏保护（resolveWindowBounds）

→ 源码：[packages/main/src/modules/window/window-size.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/window/window-size.ts)

```ts
export function resolveWindowBounds(
  persisted: Partial<WindowState> | null | undefined,
  targetDisplay: Pick<Display, 'workArea'>,
): WindowState {
  const { workArea } = targetDisplay;
  const isMaximized = Boolean(persisted?.isMaximized);

  // 1. 历史尺寸超屏判定（例如 4K 拔线切回笔记本小屏幕）
  const hasHistorySize =
    typeof persisted?.width === 'number' && persisted.width >= MIN_WINDOW_WIDTH;
  const isOversized =
    hasHistorySize && (persisted.width! > workArea.width || persisted.height! > workArea.height);

  let width: number;
  let height: number;

  if (hasHistorySize && !isOversized) {
    width = clampDimension(persisted.width!, MIN_WINDOW_WIDTH, workArea.width);
    height = clampDimension(persisted.height!, MIN_WINDOW_HEIGHT, workArea.height);
  } else {
    // 首次启动或超屏：自适应宽度 95%、高度 85% 计算
    const adaptive = calculateAdaptiveInitialSize(workArea);
    width = adaptive.width;
    height = adaptive.height;
  }

  // 2. 坐标判定：若发生超屏重置或坐标越出工作区，强制在当前显示器绝对居中
  let x = persisted?.x;
  let y = persisted?.y;
  if (isOversized || x === undefined || y === undefined || x > workArea.x + workArea.width) {
    const centered = calculateCenteredCoordinates({ width, height }, workArea);
    x = centered.x;
    y = centered.y;
  }

  return { x, y, width, height, isMaximized };
}
```

### 续启交给官方 windowStatePersistence

窗口定义中指定专属标识名与原生持久化开关：

→ 源码：[packages/main/src/modules/window/index.module.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/window/index.module.ts)

```ts
new BrowserWindow({
  name: WINDOW_IDS.HOME, // 唯一名称同时充当持久化索引键
  windowStatePersistence: this.keepState, // 开启官方持久化（原生构造期注入）
  ...initialBounds,
});
```

Electron 在 C++ 窗口构造阶段直接从系统底层的 `Local State` 读取历史尺寸与最大化状态注入原生窗口句柄，首帧呈现即为记忆状态。

## 3. 桌面端避坑注意事项

- **切勿在窗口创建后手动调用 `maximize()`**：
  - 官方 `windowStatePersistence` 已经涵盖了最大化、全屏状态的恢复。如果在构造后再次手动判断并调用 `maximize()`，会破坏原生的恢复流程并引发闪烁。
- **存储位置在 `userData/Local State`**：
  - 该机制由 Chromium 内核托管，数据保存在应用目录下的 `Local State` 文件中，工程不再生成多余的 `window-state.json`。如需重置，调用 `BrowserWindow.clearPersistedState(name)`。
- **Windows 分数缩放上游容差**：
  - 在 Windows 125% 或 150% 等非整数 DPI 缩放下，Chromium 底层坐标转换可能产生 1–2px 的微量漂移（上游已知机制），在编写自动化 E2E 断言时务必保留容差。
