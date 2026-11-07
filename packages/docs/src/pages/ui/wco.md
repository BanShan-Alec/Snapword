---

title: 原生窗口体验（WCO）
description: 采用 Window Controls Overlay，保留 Win11 贴靠与原生管理，底色同源杜绝白闪与重绘黑边。
---

# 原生窗口体验（WCO）

> **TL;DR**：系统标题栏让位给内容但窗口管理权仍归操作系统（保留 Win11 贴靠、最大化动画与原生右键菜单）；窗口底色与原生控件覆盖层（Overlay）同源配置杜绝白闪；挂载专属重绘守护消除无边框黑边残影。

## 1. 选型理由

传统桌面应用自定义标题栏往往简单粗暴地配置 `frame: false`：
- **系统能力严重失守**：Windows 11 的分屏贴靠（Snap Layouts）、平滑最大化动画、原生窗口阴影以及双击标题栏缩放全部失效，需开发者手写大量容易出 Bug 的模拟逻辑。
- **白闪与残影突出**：窗口创建瞬间若背景色未与页面底色对齐，深色模式下会产生强烈的白屏闪烁；而在 Windows 跨屏拖拽或锁屏唤醒后容易产生黑边残影。

工程采用现代规范 **Window Controls Overlay (WCO)** 配合底层重绘守护，兼得现代无边框视觉与原生窗口稳健性。

## 2. 核心机制

### 跨平台分流配置

→ 源码：[packages/main/src/modules/window/index.module.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/window/index.module.ts)

```ts
backgroundColor: getWindowBackgroundColor(),
...(isMac ? { titleBarStyle: 'hidden', titleBarOverlay: true } : {}),
...(isWin
  ? {
      titleBarStyle: 'hidden',
      frame: false,
      titleBarOverlay: getTitleBarOverlayOptions(),
    }
  : {}),
```

### 窗口底色与 Overlay 同源防白闪

底色与按钮颜色在主进程一处收敛，直接对齐 Ant Design 容器色值（深色 `#141414` / 浅色 `#ffffff`）：

→ 源码：[packages/main/src/modules/window/titlebar-overlay.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/window/titlebar-overlay.ts)

```ts
export function getWindowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#141414' : '#ffffff';
}

export function getTitleBarOverlayOptions(): { color: string; symbolColor: string } {
  const isDark = nativeTheme.shouldUseDarkColors;
  return {
    color: getWindowBackgroundColor(),
    symbolColor: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.88)',
  };
}
```

系统或用户在运行时切换明暗主题时，主进程通过 `browserWindow.setTitleBarOverlay(...)` 同步刷新按钮色阶。

## 3. 桌面端避坑注意事项

- **Windows 无边框重绘守护（attachWindowsWindowRepaint）**：
  - Windows 在无边框 WCO 模式下，当遭遇跨多 DPI 屏幕拖拽、Snap 贴靠或锁屏唤醒时，Chromium 合成器偶发挂起留下黑边残影。主进程在 `window-repaint.ts` 实现了重绘守护，仅监听低频 `'resized'` 与 `'show'` 事件并在 32ms 内补绘有界双帧（`win.webContents.invalidate()`），有效消除残影而绝不占用 CPU。
- **可拖拽区域内的子交互控件必须声明 `no-drag`**：
  - 顶部导航栏通常设置了 `-webkit-app-region: drag`。内部嵌套的搜索框、头像、设置按钮等子元素**必须显式声明 `-webkit-app-region: no-drag`**，否则系统会将点击动作全部拦截为窗口拖动，导致按钮无法点击或文本无法选中。
- **macOS 与 Windows 参数差异**：
  - 在 macOS 上，`titleBarOverlay: true` 仅用于开启安全区域 CSS 变量支持，红绿灯按钮的色阶完全由 macOS 系统托管（传 `color` 会被系统静默忽略）。
- **Linux 平台不做 WCO 定制**：
  - Linux 桌面环境窗口管理器碎片化严重（X11 / Wayland / GNOME / KDE），强制开启 WCO 容易导致窗口无法拖拽或控制按钮丢失，Linux 下保持系统默认边框是最佳实践。
