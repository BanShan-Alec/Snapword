import { ALLOWED_EXTERNAL_URLS } from '@app/shared/constants/security';
import { app } from 'electron';
import log from 'electron-log/main';
import type { AppInitConfig } from './AppInitConfig';
import { devServerUrl } from './env';
import { appLifecycle } from './lifecycle';
import { createModuleRunner } from './ModuleRunner';
import { createIPCModule } from './modules/ipc.module';
import { createLogModule, getLogManager } from './modules/log.module';
import { allowInternalOrigins } from './modules/security/block-origins';
import { createContentSecurityPolicyModule } from './modules/security/csp';
import { allowExternalUrls } from './modules/security/external-urls';
import { disallowMultipleAppInstance } from './modules/single-instance.module';
import { createStartupReadinessModule } from './modules/startup-readiness.module';
import { createTrayModule, getTrayManager } from './modules/tray.module';
import { createWindowManagerModule } from './modules/window/index.module';
import { getCaptureServiceManager } from './services/capture/capture-service-manager';
import { createCaptureServiceModule } from './services/capture/capture.module';

export async function initApp(initConfig: AppInitConfig) {
  const moduleRunner = createModuleRunner()
    .init(createLogModule())
    // B-01 §7 第 1 步：单实例锁最先持有；失败则退出，聚焦已有实例由 WindowManager 处理
    .init(disallowMultipleAppInstance())
    .init(createIPCModule())
    // 主进程就绪源：链位在 WindowManager 之前，信号先于窗口与壳
    .init(createStartupReadinessModule())
    .init(createWindowManagerModule({ initConfig }))
    // B-01 §7：托盘先于取词服务创建
    .init(createTrayModule())
    // B-01 §7 第 6 步：utilityProcess.fork(capture-service) 挂载点
    // （P4 骨架只建目录与类型；hello/hello_ack/config_ack 握手由下一步实现）
    .init(createCaptureServiceModule())

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
}

/**
 * 退出顺序（B-01 §8）：托盘「退出」/ 系统关机 / 开发终端退出都汇入 before-quit。
 * 1. 停止接受新取词（captureEnabled=false）与 2. 注销全局热键 —— P5 接入热键/取词开关时补充；
 * 3. 取词服务 shutdown（握手实现后改为 shutdown → shutdown_ack ≤1s → kill 兜底）；
 * 5. 窗口随 quit 自然关闭，销毁托盘；
 * 6. SQLite checkpoint 与 7. temp/ 清理 —— P5 接入 DB / 云 TTS 时补充。
 */
app.on('before-quit', () => {
  if (appLifecycle.isQuitting) {
    return;
  }
  appLifecycle.isQuitting = true;
  const logger = getLogManager().scoped('App Lifecycle');
  logger.info('App quitting: begin ordered shutdown (B-01 §8)');
  getCaptureServiceManager().stop();
  getTrayManager().destroy();
});

// 自动引导启动主进程流水线
const devServer = devServerUrl;

initApp({
  windows: {
    home: devServer
      ? new URL('src/entries/home/index.html', devServer)
      : { path: require.resolve('@app/renderer') },
  },
  preload: {
    path: require.resolve('@app/preload'),
  },
  // 初始化失败记入 main.log，并以非零状态码退出，杜绝无窗口僵尸进程驻留
}).catch((error) => {
  log.error('[initAppFailed]', error);
  app.exit(1);
});
