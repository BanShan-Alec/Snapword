/**
 * IPC 通信通道常量定义 (IPC Channels)
 *
 * 渲染进程 ↔ 主进程的 ContextBridge 白名单通道。
 * 主进程 ↔ 取词 utilityProcess 的消息目录见 packages/shared/src/types/capture-protocol.ts（B-02）。
 */
export const IPC_CHANNELS = {
  SYSTEM_PING: 'system:ping',
  SYSTEM_GET_INFO: 'system:get-info',
  /** 渲染层语言切换后通知主进程重建托盘文案（RM-13 立即生效） */
  SYSTEM_SET_LOCALE: 'system:set-locale',

  DIAGNOSTICS_LOG: 'diagnostics:log',
  DIAGNOSTICS_OPEN_LOG_FOLDER: 'diagnostics:open-log-folder',
  DIAGNOSTICS_PERFORM_ACTION: 'diagnostics:perform-action',

  // 启动就绪契约 (Startup readiness)：引导期快照拉取 + 主进程就绪单向推送
  STARTUP_GET_SNAPSHOT: 'startup:get-snapshot',
  STARTUP_EVENT_MAIN_READY: 'startup:event:main-ready',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
