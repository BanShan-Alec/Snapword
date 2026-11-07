import { ALLOWED_EXTERNAL_URLS } from '@app/shared/constants/security';
import { app } from 'electron';
import log from 'electron-log/main';
import type { AppInitConfig } from './AppInitConfig';
import { SILENT_CHECK_DELAY_MS } from './constants/updater';
import { devServerUrl } from './env';
import { appLifecycle } from './lifecycle';
import { createModuleRunner } from './ModuleRunner';
import { terminateAppOnLastWindowClose } from './modules/auto-terminate.module';
import { createConfigModule, getAppConfigStore } from './modules/config.module';
import { createIPCModule } from './modules/ipc.module';
import { createLogModule, getLogManager } from './modules/log.module';
import { createNativeThemeModule } from './modules/native-theme.module';
import { allowInternalOrigins } from './modules/security/block-origins';
import { createContentSecurityPolicyModule } from './modules/security/csp';
import { allowExternalUrls } from './modules/security/external-urls';
import { createSentryModule, initMainSentry } from './modules/sentry.module';
import { disallowMultipleAppInstance } from './modules/single-instance.module';
import { createStartupReadinessModule } from './modules/startup-readiness.module';
import { createTrayModule, getTrayManager } from './modules/tray.module';
import { createWindowManagerModule } from './modules/window/index.module';
import { createUpdaterWindowModule } from './modules/window/updater-window.module';
import { createCaptureServiceModule } from './services/capture/capture.module';
import { getCaptureServiceManager } from './services/capture/capture-service-manager';
import { updaterService } from './services/updater.service';

export async function initApp(initConfig: AppInitConfig) {
  const moduleRunner = createModuleRunner()
    .init(createLogModule())
    // B-01 §7 第 1 步：单实例锁最先持有；失败则退出，聚焦已有实例由 WindowManager 处理
    .init(disallowMultipleAppInstance());

  // B-01 §7：Sentry 初始化必须在单实例锁之后，第二实例抢锁失败即退出、绝不上报
  initMainSentry();

  moduleRunner
    .init(createSentryModule())
    .init(createConfigModule())
    .init(createNativeThemeModule())
    .init(createIPCModule())
    // 主进程就绪源：链位在 WindowManager 之前，信号先于窗口与壳
    .init(createStartupReadinessModule())
    .init(createWindowManagerModule({ initConfig }))
    .init(createUpdaterWindowModule({ initConfig }))
    // B-01 §7：托盘先于取词服务创建
    .init(createTrayModule())
    // B-01 §7 第 6 步：utilityProcess.fork(capture-service.cjs)
    // 握手 / 心跳 / 失败重启由 CaptureServiceManager 承担（B-02 §1/§3/§8）
    .init(createCaptureServiceModule())
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

/**
 * 退出顺序（B-01 §8）：托盘「退出」/ 系统关机 / 开发终端退出都汇入 before-quit。
 * 1. 停止接受新取词（captureEnabled=false）与 2. 注销全局热键 —— P5 接入热键/取词开关时补充；
 * 3. 取词服务 shutdown → shutdown_ack ≤1s → kill 兜底（CaptureServiceManager.stop，B-02 §8）；
 * 5. 窗口随 quit 自然关闭，销毁托盘；
 * 6. SQLite checkpoint（closeDatabase()，P5 接线 DB 后在此调用）与 7. temp/ 清理（P5 接入云 TTS 时补充）。
 *
 * 第 3 步必须等 shutdown_ack/超时 kill 完成后再放行退出：before-quit 先 preventDefault，
 * 待 stop() 的 1s 上限结束后再调用 app.quit()；第二次 before-quit 由 isQuitting 放行。
 * isQuitting 置位同时承担 D7 崩溃叙事：其缺席即代表该轮运行异常终结（崩溃/强杀）。
 */
app.on('before-quit', (event) => {
  if (appLifecycle.isQuitting) {
    return;
  }
  appLifecycle.isQuitting = true;
  event.preventDefault();
  const logger = getLogManager().scoped('App Lifecycle');
  logger.info('App quitting: begin ordered shutdown (B-01 §8)');

  void (async () => {
    try {
      await getCaptureServiceManager().stop();
    } catch (error) {
      logger.error('Capture service shutdown failed:', error);
    } finally {
      getTrayManager().destroy();
      app.quit();
    }
  })();
});

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
