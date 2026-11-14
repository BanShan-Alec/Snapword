import fs from 'node:fs';
import path from 'node:path';
import type { LanguageMode } from '@app/shared/constants/preferences';
import { WINDOW_IDS } from '@app/shared/constants/windows';
import { app, Menu, nativeImage, Tray } from 'electron';
import type { AppModule } from '../AppModule';
import { mainMessage } from '../i18n';
import { appLifecycle } from '../lifecycle';
import type { ModuleContext } from '../ModuleContext';
import { updaterService } from '../services/updater.service';
import { getAppConfigStore } from './config.module';
import { getLogManager } from './log.module';
import { getHomeWindowModule } from './window/home-window.module';
import { getUpdaterWindowModule } from './window/updater-window.module';
import { getWindow } from './window/window-registry';

export class TrayManager implements AppModule {
  private tray: Tray | null = null;
  private contextMenu: Menu | null = null;
  private readonly logger = getLogManager().scoped(this);

  public enable({ app: electronApp }: ModuleContext): void {
    electronApp.whenReady().then(() => {
      this.initTray();
    });
  }

  public getContextMenu(): Menu | null {
    return this.contextMenu;
  }

  public updateLanguage(lang: LanguageMode): void {
    if (!this.tray) return;

    this.tray.setToolTip(`${app.getName()} - ${mainMessage(lang, 'trayTooltipSuffix')}`);

    this.contextMenu = Menu.buildFromTemplate([
      {
        label: mainMessage(lang, 'trayShowMainWindow'),
        click: () => this.restoreMainWindow(),
      },
      {
        label: mainMessage(lang, 'trayCheckUpdates'),
        click: () => {
          this.logger.info('User requested update check');
          updaterService.check().catch((err) => {
            this.logger.warn('Failed to check for updates from tray:', err);
          });
          getUpdaterWindowModule()
            .show()
            .catch((err) => {
              this.logger.error('Failed to show updater window from tray:', err);
            });
        },
      },
      { type: 'separator' },
      {
        label: mainMessage(lang, 'trayQuit'),
        click: () => {
          appLifecycle.isQuitting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(this.contextMenu);
  }

  public initTray(): Tray | null {
    if (this.tray) return this.tray;

    try {
      const iconPath = this.resolveIconPath();
      if (!iconPath) {
        this.tray = new Tray(nativeImage.createEmpty());
      } else if (process.platform === 'win32' && iconPath.endsWith('.ico')) {
        // Windows 平台直接使用包含完整 DPI 阶梯 (16, 20, 24, 32, 48, 256) 的 .ico 文件路径，
        // 由 Windows 系统底层的 Shell_NotifyIcon 自动匹配当前屏幕缩放比例的最佳图标，
        // 彻底杜绝通过 nativeImage 强行 resize(16, 16) 导致的高分屏插值模糊与像素锯齿。
        this.tray = new Tray(iconPath);
      } else {
        let icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) {
          icon = nativeImage.createEmpty();
        } else {
          if (process.platform === 'darwin') {
            // 不标记为 template image：模板图只读 alpha 通道，会把不透明的蓝底与白闪电
            // 压成同一个实心圆角方块，闪电直接消失；这里保留全彩品牌图标。
            icon = icon.resize({ width: 16, height: 16, quality: 'best' });
          } else if (process.platform === 'win32') {
            icon = icon.resize({ width: 32, height: 32, quality: 'best' });
          } else {
            icon = icon.resize({ width: 24, height: 24, quality: 'best' });
          }
        }
        this.tray = new Tray(icon);
      }
      this.updateLanguage(getAppConfigStore().get('language'));

      // 单击/双击托盘图标激活并唤起主窗口（若已销毁则重建）
      this.tray.on('click', () => {
        this.toggleMainWindow();
      });

      this.tray.on('double-click', () => {
        this.restoreMainWindow();
      });

      return this.tray;
    } catch (err) {
      this.logger.error('Failed to initialize tray:', err);
      return null;
    }
  }

  public toggleMainWindow(): void {
    const win = getWindow(WINDOW_IDS.HOME);
    if (!win || win.isDestroyed()) {
      this.restoreMainWindow();
      return;
    }
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
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
      const homeWindow = getHomeWindowModule();
      if (homeWindow) {
        homeWindow.restoreOrCreateWindow(true).catch((err) => {
          this.logger.error('Failed to restoreOrCreateWindow from tray:', err);
        });
      }
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
      this.contextMenu = null;
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
