import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { StartupGateSnapshot, StartupMainReadyPayload } from '@app/shared/types/startup';
import type { AppModule } from '../AppModule';
import { handleTraced } from '../telemetry/ipc-tracer';
import { broadcast } from './window/window-registry';

/**
 * 主进程就绪源
 *
 * ModuleRunner 链位在 IPC 模块之后、WindowManager 之前：enable() 完成即代表
 * 主进程初始化链就绪，此时窗口尚未创建——信号必然先于壳监听器的注册，
 * 故采用"闩锁 + 快照拉取（startup:get-snapshot）+ 单向推送
 * （startup:event:main-ready）"双通道，先到的信号经拉取补发，不丢。
 *
 * payload 携带初始化耗时（initMs 以进程启动为 performance.now() 锚点），
 * 是 v2 最小埋点集的主进程侧数据；不建上报通道（D6）。
 * 严禁在本模块 enable() 中新增同步耗时（spec §6.4 显示零阻塞）。
 */

// 私有常量
let snapshot: StartupGateSnapshot = { mainReady: false, payload: null };

export function createStartupReadinessModule(): AppModule {
  return {
    enable() {
      const payload: StartupMainReadyPayload = {
        initMs: Math.round(performance.now()),
        latchedAt: Date.now(),
      };
      snapshot = { mainReady: true, payload };

      handleTraced(IPC_CHANNELS.STARTUP_GET_SNAPSHOT, () => snapshot);

      // 此刻注册表为空属预期空操作；契约对后续创建的窗口（含 updater）成立
      broadcast(IPC_CHANNELS.STARTUP_EVENT_MAIN_READY, payload);
    },
  };
}
