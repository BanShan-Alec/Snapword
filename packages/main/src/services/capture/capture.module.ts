import type { AppModule } from '../../AppModule';
import { getCaptureServiceManager } from './capture-service-manager';

/**
 * 取词服务模块：ModuleRunner 挂载位对应 B-01 §7 启动顺序中
 * 「创建托盘 → utilityProcess.fork(capture-service.js)」之后的一环。
 *
 * fork 必须在 app ready 之后（electron.d.ts UtilityProcess.fork 前置条件），
 * 故 whenReady 后再 start()；握手 / 心跳 / 失败重启策略在 CaptureServiceManager（B-02 §1/§3/§8）。
 */
export function createCaptureServiceModule(): AppModule {
  return {
    enable({ app: electronApp }) {
      void electronApp.whenReady().then(() => {
        getCaptureServiceManager().start();
      });
    },
  };
}
