import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { StartupGateSnapshot, StartupMainReadyPayload } from '@app/shared/types/startup';
import type { AppModule } from '../AppModule';
import { handleTraced } from '../telemetry/ipc-tracer';
import { broadcast } from './window/window-registry';

/**
 * 主进程启动就绪控制模块
 *
 * 1. enable() 注册 IPC_CHANNELS.STARTUP_GET_SNAPSHOT 查询通道，初始状态为 mainReady: false。
 * 2. 主窗口在后续创建并立刻呈现原生底色与 Loading 动画，用户免于白屏等待。
 * 3. 待 await moduleRunner 完成所有同步/异步模块与窗口初始化后，调用 markReady() 封板广播 STARTUP_EVENT_MAIN_READY。
 *    向已真实存在的窗口推送就绪事件，彻底闭环异步就绪时序。
 */
export class StartupReadinessModule implements AppModule {
  private snapshot: StartupGateSnapshot = { mainReady: false, payload: null };

  public enable(): void {
    handleTraced(IPC_CHANNELS.STARTUP_GET_SNAPSHOT, () => this.getSnapshot());
  }

  public getSnapshot(): StartupGateSnapshot {
    return { ...this.snapshot };
  }

  public markReady(): void {
    if (this.snapshot.mainReady) {
      return;
    }
    const payload: StartupMainReadyPayload = {
      initMs: Math.round(performance.now()),
      latchedAt: Date.now(),
    };
    this.snapshot = { mainReady: true, payload };
    broadcast(IPC_CHANNELS.STARTUP_EVENT_MAIN_READY, payload);
  }
}

export function createStartupReadinessModule(): StartupReadinessModule {
  return new StartupReadinessModule();
}
