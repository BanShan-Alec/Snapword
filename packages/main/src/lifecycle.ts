import { app } from 'electron';
import { getLogManager } from './modules/log.module';

export const appLifecycle = {
  isQuitting: false,
};

if (typeof app?.on === 'function') {
  app.on('before-quit', () => {
    appLifecycle.isQuitting = true;
    // D7 替代方案：退出标记；其缺席即代表该轮运行异常终结（崩溃/强杀）
    getLogManager().scoped('App Lifecycle').info('App quitting');
  });
}
