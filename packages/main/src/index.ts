import { ALLOWED_EXTERNAL_URLS } from '@app/shared/constants/security';
import { app } from 'electron';
import log from 'electron-log/main';
import type { AppInitConfig } from './AppInitConfig';
import { SILENT_CHECK_DELAY_MS } from './constants/updater';
import { devServerUrl } from './env';
import { createModuleRunner } from './ModuleRunner';
import { terminateAppOnLastWindowClose } from './modules/auto-terminate.module';
import { createConfigModule, getAppConfigStore } from './modules/config.module';
import { createIPCModule } from './modules/ipc.module';
import { createLogModule } from './modules/log.module';
import { createNativeThemeModule } from './modules/native-theme.module';
import { allowInternalOrigins } from './modules/security/block-origins';
import { createContentSecurityPolicyModule } from './modules/security/csp';
import { allowExternalUrls } from './modules/security/external-urls';
import { createSentryModule, initMainSentry } from './modules/sentry.module';
import { disallowMultipleAppInstance } from './modules/single-instance.module';
import { createStartupReadinessModule } from './modules/startup-readiness.module';
import { createTrayModule } from './modules/tray.module';
import { createHomeWindowModule } from './modules/window/home-window.module';
import { createUpdaterWindowModule } from './modules/window/updater-window.module';
import { updaterService } from './services/updater.service';

// 主进程最早期初始化 Sentry
initMainSentry();

export async function initApp(initConfig: AppInitConfig) {
  const startupReadiness = createStartupReadinessModule();

  const moduleRunner = createModuleRunner()
    .init(createLogModule())
    .init(createSentryModule())
    .init(createConfigModule())
    .init(createNativeThemeModule())
    .init(createIPCModule())
    // 主进程启动就绪控制：注册 IPC 查询通道，初始保持 false
    .init(startupReadiness)
    .init(createHomeWindowModule({ initConfig }))
    .init(createUpdaterWindowModule({ initConfig }))
    .init(createTrayModule())
    .init(disallowMultipleAppInstance())
    .init(terminateAppOnLastWindowClose())

    // Security
    .init(createContentSecurityPolicyModule())
    .init(
      allowInternalOrigins(
        new Set(
          devServer
            ? [new URL(devServer).origin]
            : [
                initConfig.windows.home instanceof URL ? initConfig.windows.home.origin : 'file://',
                'null',
              ],
        ),
      ),
    )
    .init(allowExternalUrls(new Set(ALLOWED_EXTERNAL_URLS)));

  await moduleRunner;
  // 所有同步/异步模块（含异步窗口创建与注册）均已完成后再广播就绪事件
  startupReadiness.markReady();

  // 应用就绪后若开启自动更新则延迟执行后台静默检查
  try {
    const configStore = getAppConfigStore();
    if (configStore.get('autoCheckUpdate')) {
      setTimeout(() => {
        try {
          updaterService.checkSilently().catch((err) => {
            log.warn('[AutoUpdater] Silent update check failed:', err);
          });
        } catch (err) {
          log.warn('[AutoUpdater] Silent update check invocation failed:', err);
        }
      }, SILENT_CHECK_DELAY_MS);
    }
  } catch (err) {
    log.warn('[AutoUpdater] Failed to schedule silent update check:', err);
  }
}

// 自动引导启动主进程流水线
const devServer = devServerUrl;

initApp({
  windows: {
    home: devServer
      ? new URL('src/entries/home/index.html', devServer)
      : { path: require.resolve('@app/renderer') },
    updater: devServer
      ? new URL('src/entries/updater/index.html', devServer)
      : { path: require.resolve('@app/renderer/updater') },
  },
  preload: {
    path: require.resolve('@app/preload'),
  },
  // 初始化失败记入 main.log，并以非零状态码退出，杜绝无窗口僵尸进程驻留
}).catch((error) => {
  log.error('[initAppFailed]', error);
  app.exit(1);
});
