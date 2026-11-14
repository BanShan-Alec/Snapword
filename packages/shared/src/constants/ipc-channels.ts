/**
 * IPC 通信通道常量定义 (IPC Channels)
 */
export const IPC_CHANNELS = {
  SYSTEM_PING: 'system:ping',
  SYSTEM_GET_INFO: 'system:get-info',

  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  CONFIG_RESET: 'config:reset',

  DIAGNOSTICS_LOG: 'diagnostics:log',
  DIAGNOSTICS_OPEN_LOG_FOLDER: 'diagnostics:open-log-folder',
  DIAGNOSTICS_PERFORM_ACTION: 'diagnostics:perform-action',

  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',

  // 自动更新通道 (Updater IPC Channels)
  UPDATER_GET_STATE: 'updater:get-state',
  UPDATER_CHECK: 'updater:check',
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_CANCEL: 'updater:cancel',
  UPDATER_INSTALL: 'updater:install',
  UPDATER_OPEN_WINDOW: 'updater:open-window',
  UPDATER_CLOSE_WINDOW: 'updater:close-window',
  UPDATER_EVENT_STATE: 'updater:event:state',
  UPDATER_EVENT_PROGRESS: 'updater:event:progress',
  UPDATER_MOCK_EMIT: 'updater:mock:emit',

  // 跨窗口配置广播 (Config broadcast)
  CONFIG_EVENT_CHANGED: 'config:event:changed',

  // 关闭行为询问 (Close behavior prompt)
  WINDOW_CLOSE_REQUESTED: 'window:event:close-requested',
  WINDOW_CLOSE_READY: 'window:close-ready',
  WINDOW_CLOSE_RESPOND: 'window:close-respond',

  // 取词与选区通道 (Capture IPC Channels)
  CAPTURE_CURRENT: 'capture:current',
  CAPTURE_GET_STATUS: 'capture:get-status',
  CAPTURE_EVENT_DOT_CLICKED: 'capture:event:dot-clicked',
  CAPTURE_EVENT_RESULT: 'capture:event:result',
  CAPTURE_EVENT_STATUS: 'capture:event:status',

  // 流式翻译通道 (Translation Pipeline)
  TRANSLATION_TRANSLATE: 'translation:translate',
  TRANSLATION_ABORT: 'translation:abort',
  TRANSLATION_EVENT_CHUNK: 'translation:event:chunk',
  TRANSLATION_EVENT_FINISH: 'translation:event:finish',
  TRANSLATION_EVENT_ERROR: 'translation:event:error',

  // 翻译卡片通道 (Card Window IPC Channels)
  CARD_SHOW: 'card:show',
  CARD_HIDE: 'card:hide',
  CARD_RESIZE: 'card:resize',
  CARD_PIN_TOGGLE: 'card:pin-toggle',
  CARD_OPEN_IN_HOME: 'card:open-in-home',
  CARD_EVENT_ACTION: 'card:event:action',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
