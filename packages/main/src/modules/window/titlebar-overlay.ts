import { nativeTheme } from 'electron';

/**
 * Window Controls Overlay（WCO）配置的单一事实源，
 * 供 WindowManager（窗口创建时）与 NativeThemeModule（主题切换时）共享。
 *
 * 平台契约（Electron 41 electron.d.ts）：
 * - 构造项 titleBarOverlay 的 color/symbolColor 标注 @platform win32,linux；
 *   macOS 传 boolean true，仅用于启用 WCO JS API 与 CSS env(titlebar-area-*)，
 *   红绿灯外观由系统管理（参照 VS Code defaultBrowserWindowOptions 的平台分支）。
 * - BrowserWindow.setTitleBarOverlay 标注 @platform win32,linux，且要求窗口创建时
 *   已启用 overlay，否则抛 "Titlebar overlay is not enabled"。
 * - height 缺省为系统标题栏高度；本应用头部高度由内容决定，故不钉死该值。
 */

// 私有常量
const IS_WIN = process.platform === 'win32';

// 可抽离的逻辑处理函数/组件

/** 仅 win32 在窗口创建时启用了对象形态的 overlay，运行时更新（setTitleBarOverlay）也仅对其有意义 */
export function canUpdateTitleBarOverlay(): boolean {
  return IS_WIN;
}

/**
 * 窗口底色与 overlay 色同源同主题分支（深 #141414 / 浅 #ffffff），
 * 供 BrowserWindow 构造项 backgroundColor 使用：首帧先于渲染进程，
 * 与启动壳叠放后保证深浅主题均无白闪。严禁在别处硬编码这两个色值。
 */
export function getWindowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#141414' : '#ffffff';
}

/** overlay 颜色与 antd colorBgContainer / colorText 同值（浅 #ffffff / 深 #141414 + 主文字色） */
export function getTitleBarOverlayOptions(): { color: string; symbolColor: string } {
  const shouldUseDarkColors = nativeTheme.shouldUseDarkColors;
  return {
    color: getWindowBackgroundColor(),
    symbolColor: shouldUseDarkColors ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.88)',
  };
}
