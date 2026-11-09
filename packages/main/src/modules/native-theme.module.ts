import { WINDOW_IDS } from '@app/shared/constants/windows';
import type { AppConfig } from '@app/shared/schemas/config';
import { nativeTheme } from 'electron';
import type { AppModule } from '../AppModule';
import type { ModuleContext } from '../ModuleContext';
import { getLogManager } from './log.module';
import { canUpdateTitleBarOverlay, getTitleBarOverlayOptions } from './window/titlebar-overlay';
import { getWindow } from './window/window-registry';

/**
 * 系统级主题同步（nativeTheme）
 * AppConfig['theme'] 的 'system' | 'light' | 'dark' 与 Electron nativeTheme.themeSource 枚举一一对应，直接透传。
 * 同步后：原生对话框/标题栏/滚动条及渲染层 prefers-color-scheme 均由应用主题驱动。
 *
 * 职责边界：启动期同步与解析归窗口创建链（resolveNativeTheme，由窗口模块创建窗口时显式调用），
 * 本模块只负责运行时联动——themeSource 变化（用户切换/系统翻转）触发 WCO overlay 重刷。
 */

// 私有常量

// 可抽离的逻辑处理函数/组件
const logger = getLogManager().scoped('NativeTheme');

export function applyNativeThemeSource(theme: AppConfig['theme']): void {
  try {
    nativeTheme.themeSource = theme;
    logger.info(`themeSource synced -> ${theme}`);
  } catch (err) {
    logger.error('Failed to sync themeSource:', err);
  }
}

/**
 * 显式解析主题：幂等同步 themeSource（保证 shouldUseDarkColors 与持久偏好对齐）后返回具体明暗。
 * 窗口创建链的单一事实源：backgroundColor / WCO overlay 初刷 / renderer 首帧 query
 * 均以本次解析结果为准，不再依赖模块装配顺序。
 */
export function resolveNativeTheme(theme: AppConfig['theme']): 'light' | 'dark' {
  applyNativeThemeSource(theme);
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

/**
 * 同步主窗口 WCO 颜色。守卫参照 VS Code windowImpl.updateWindowControls：
 * setTitleBarOverlay 仅 win32/linux 支持且要求创建时已启用 overlay；
 * 本应用仅 win32 启用（darwin 的 overlay 仅用于启用 CSS env 变量，颜色由系统管理）。
 */
export function applyTitleBarOverlay(): void {
  if (!canUpdateTitleBarOverlay()) {
    return;
  }

  const homeWindow = getWindow(WINDOW_IDS.HOME);
  if (!homeWindow) {
    return;
  }

  try {
    homeWindow.setTitleBarOverlay(getTitleBarOverlayOptions());
    logger.info('TitleBarOverlay synced ->', getTitleBarOverlayOptions());
  } catch (err) {
    logger.error('Failed to sync titleBarOverlay:', err);
  }
}

export class NativeThemeModule implements AppModule {
  enable({ app }: ModuleContext): void {
    // nativeTheme 事件注册须在 app.whenReady() 后；启动期同步与解析由窗口创建链负责
    app.whenReady().then(() => {
      nativeTheme.on('updated', () => {
        logger.info(`Updated, shouldUseDarkColors=${nativeTheme.shouldUseDarkColors}`);
        applyTitleBarOverlay();
      });
    });
  }
}

export function createNativeThemeModule(): NativeThemeModule {
  return new NativeThemeModule();
}
