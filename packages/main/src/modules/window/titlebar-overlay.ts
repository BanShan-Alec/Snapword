import { nativeTheme } from 'electron';

/**
 * Window Controls Overlay（WCO）配置的单一事实源，
 * 供 HomeWindowModule（窗口创建时）与 NativeThemeModule（主题切换时）共享。
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

/**
 * paseo 主题 token（与 packages/renderer 的 Claude Light / Paseo Dark 同源）：
 * - window  = colorBgLayout（窗口画布 / 首帧底色，与 tokens.css 的 --window-bg 一致）
 * - overlay = colorBgContainer（Header 底色，原生控制按钮叠在其上，必须与其同色）
 * - symbol  = colorText（控制按钮与图标色）
 * 换主题槽位或升级 paseo 版本时必须同步这里（原生层读不到 CSS 变量）。
 */
interface PaseoColors {
  window: string;
  overlay: string;
  symbol: string;
}

const PASEO_COLORS: Record<'light' | 'dark', PaseoColors> = {
  light: { window: '#F0EDE2', overlay: '#F5F4EC', symbol: '#3C3C2C' },
  dark: { window: '#181B1A', overlay: '#1E2120', symbol: '#FAFAFA' },
};

function currentPaseoColors(): PaseoColors {
  return nativeTheme.shouldUseDarkColors ? PASEO_COLORS.dark : PASEO_COLORS.light;
}

// 可抽离的逻辑处理函数/组件

/** 仅 win32 在窗口创建时启用了对象形态的 overlay，运行时更新（setTitleBarOverlay）也仅对其有意义 */
export function canUpdateTitleBarOverlay(): boolean {
  return IS_WIN;
}

/**
 * 窗口底色（BrowserWindow backgroundColor）：paseo 的 colorBgLayout。
 * 首帧先于渲染进程，与启动壳叠放后保证深浅主题均无白闪。严禁在别处硬编码色值。
 */
export function getWindowBackgroundColor(): string {
  return currentPaseoColors().window;
}

/** overlay 颜色与 antd colorBgContainer / colorText 同值，保证原生按钮与 Header 无缝 */
export function getTitleBarOverlayOptions(): { color: string; symbolColor: string } {
  const colors = currentPaseoColors();
  return { color: colors.overlay, symbolColor: colors.symbol };
}
