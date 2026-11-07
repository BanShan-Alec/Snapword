/**
 * 更新器可运营参数（主进程独占）
 *
 * 只放会影响用户等待/重试语义的时值；dev 模拟流程的演示节奏属于开发噪音，仍就地保留。
 */
export const OTA_ERROR_DEBOUNCE_MS = 1000;
export const UPDATE_CHECK_TIMEOUT_MS = 15_000;
export const PROGRESS_EMIT_THROTTLE_MS = 250;
export const SILENT_CHECK_DELAY_MS = 3000;
