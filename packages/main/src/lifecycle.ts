import { app } from 'electron';
import { getLogManager } from './modules/log.module';

export const appLifecycle = {
  isQuitting: false,
};

// 退出尝试计数：正常一次退出只触发一次 before-quit；同一进程再次触发说明上一次
// 尝试被 Electron 判为取消（见下方重试分支），计数用于区分两行日志的语义
let quitAttempt = 0;

if (typeof app?.on === 'function') {
  app.on('before-quit', () => {
    appLifecycle.isQuitting = true;
    quitAttempt += 1;
    const logger = getLogManager().scoped('App Lifecycle');

    if (quitAttempt === 1) {
      // D7 替代方案：退出标记；其缺席即代表该轮运行异常终结（崩溃/强杀）
      logger.info('App quitting');
      return;
    }

    // 第二次及以后：典型场景是 WM_CLOSE 的「关闭被取消」通知晚于 app.quit() 到达，
    // 复位了 Electron 内部退出标记，随后 window-all-closed 兜底补发一次退出重试
    logger.info(`App quitting retry (attempt ${quitAttempt}): previous attempt did not complete`);
  });
}
