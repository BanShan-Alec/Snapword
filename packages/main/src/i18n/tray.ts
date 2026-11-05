import { resolveLocale, type SupportedLocale } from '@app/shared/constants/preferences';

/**
 * 主进程托盘文案（轻量 zh/en 字典）。
 *
 * 为什么不用 lingui：lingui 只接在 renderer —— @lingui/* 是 renderer 的依赖，
 * catalog 由 renderer 的 Vite 插件编译成 .po 运行时 chunk；主进程没有也不需要
 * 第二套 catalog 编译链。托盘文案很少，这里维护最小字典即可。
 *
 * 语言选择：启动时用 app.getLocale() 解析；应用内切换语言时由 renderer 通过
 * `system:set-locale` 通知 TrayManager 重建菜单与后续通知文案。
 */
export interface TrayMessages {
  openMainWindow: string;
  quit: string;
  captureServiceStartupFailed: string;
  captureServiceCrashed: string;
}

const TRAY_MESSAGES: Record<SupportedLocale, TrayMessages> = {
  'zh-CN': {
    openMainWindow: '打开主窗口',
    quit: '退出',
    captureServiceStartupFailed: '取词服务未启动（已自动重试 3 次）',
    captureServiceCrashed: '取词服务异常（已自动重试 3 次）',
  },
  en: {
    openMainWindow: 'Open Snapword',
    quit: 'Quit',
    captureServiceStartupFailed: 'Capture service failed to start (retried 3 times)',
    captureServiceCrashed: 'Capture service keeps crashing (retried 3 times)',
  },
};

/** 把 app.getLocale() 的返回值解析成托盘字典语种 */
export function resolveTrayLocale(locale: string): SupportedLocale {
  return resolveLocale('system', locale);
}

export function getTrayMessages(locale: string): TrayMessages {
  return TRAY_MESSAGES[resolveTrayLocale(locale)];
}
