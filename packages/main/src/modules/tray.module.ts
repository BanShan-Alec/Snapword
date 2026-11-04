import fs from 'node:fs';
import path from 'node:path';
import { WINDOW_IDS } from '@app/shared/constants/windows';
import { app, Menu, nativeImage, Tray } from 'electron';
import type { AppModule } from '../AppModule';
import type { ModuleContext } from '../ModuleContext';
import { getLogManager } from './log.module';
import { getWindowManager } from './window/index.module';
import { getWindow } from './window/window-registry';

/**
 * 托盘最小实现（B-01 §2/§7/§8）
 *
 * P4 骨架范围：图标 + 两个菜单项（打开主窗口 / 退出）。
 * 热键注册、取词开关、诊断入口等随主链路开发逐步补齐；
 * 退出经 app.quit() 触发 before-quit，由入口处按 B-01 §8 顺序清理。
 */
export class TrayManager implements AppModule {
  private tray: Tray | null = null;
  private readonly logger = getLogManager().scoped(this);

  public enable({ app: electronApp }: ModuleContext): void {
    electronApp.whenReady().then(() => {
      this.initTray();
    });
  }

  public initTray(): Tray | null {
    if (this.tray) return this.tray;

    try {
      const iconPath = this.resolveIconPath();
      if (!iconPath) {
        this.tray = new Tray(nativeImage.createEmpty());
      } else if (process.platform === 'win32' && iconPath.endsWith('.ico')) {
        // Windows 直接用完整 DPI 阶梯的 .ico，由 Shell_NotifyIcon 匹配当前缩放的最佳图标
        this.tray = new Tray(iconPath);
      } else {
        let icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) {
          icon = nativeImage.createEmpty();
        } else if (process.platform === 'darwin') {
          icon = icon.resize({ width: 16, height: 16, quality: 'best' });
        } else if (process.platform === 'win32') {
          icon = icon.resize({ width: 32, height: 32, quality: 'best' });
        } else {
          icon = icon.resize({ width: 24, height: 24, quality: 'best' });
        }
        this.tray = new Tray(icon);
      }

      this.tray.setToolTip(app.getName());
      // TODO(i18n)：主进程文案等配置层落地后接 i18n（P5）
      this.tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: '打开主窗口',
            click: () => this.restoreMainWindow(),
          },
          { type: 'separator' },
          {
            label: '退出',
            click: () => {
              // before-quit 里按 B-01 §8 顺序清理（capture stop → 窗口关闭 → 托盘销毁）
              app.quit();
            },
          },
        ]),
      );

      // 单击托盘图标唤起主窗口
      this.tray.on('click', () => {
        this.restoreMainWindow();
      });

      return this.tray;
    } catch (err) {
      this.logger.error('Failed to initialize tray:', err);
      return null;
    }
  }

  public restoreMainWindow(): void {
    const win = getWindow(WINDOW_IDS.HOME);
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    } else {
      const windowManager = getWindowManager();
      if (windowManager) {
        windowManager.restoreOrCreateWindow(true).catch((err) => {
          this.logger.error('Failed to restoreOrCreateWindow from tray:', err);
        });
      }
    }
  }

  /**
   * 取词服务故障托盘提示（B-01 §7/§9.1 失败表占位）。
   * P4 骨架：Windows 气泡 + 日志；点击跳转诊断入口与文案统一待 P5 接线。
   * TODO(i18n)：主进程文案等配置层落地后接 i18n（P5）
   */
  public notifyCaptureServiceIssue(detail: string): void {
    this.logger.warn(`[capture-service] ${detail}`);
    if (process.platform === 'win32' && this.tray) {
      this.tray.displayBalloon({
        iconType: 'warning',
        title: 'Snapword',
        content: detail,
      });
    }
  }

  private resolveIconPath(): string {
    const isWin = process.platform === 'win32';
    const iconNames = isWin ? ['icon.ico', 'icon.png'] : ['icon.png'];

    const baseDirs: string[] = [];
    if (process.resourcesPath) {
      baseDirs.push(path.join(process.resourcesPath, 'buildResources'));
    }
    if (app) {
      baseDirs.push(path.join(app.getAppPath(), 'build', 'resources'));
    }

    for (const dir of baseDirs) {
      for (const name of iconNames) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
    return '';
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

let singletonTrayManager: TrayManager | null = null;

export function getTrayManager(): TrayManager {
  if (!singletonTrayManager) {
    singletonTrayManager = new TrayManager();
  }
  (globalThis as unknown as { __trayManager?: TrayManager }).__trayManager = singletonTrayManager;
  return singletonTrayManager;
}

export function createTrayModule(): TrayManager {
  return getTrayManager();
}
