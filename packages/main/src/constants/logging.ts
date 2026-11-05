/**
 * 日志基础设施参数（主进程独占）
 *
 * 轮转上限、归档保留策略与渲染日志准入阈值单点维护；
 * E2E 通过相对路径引用这里的常量，避免产品改动后测试静默失真。
 */
export const LOG_FILE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const TRACE_FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const RENDERER_LINE_MAX_LENGTH = 2000;

export const LOG_ARCHIVE_MAX_DAYS = 7;
export const LOG_ARCHIVE_MAX_FILES = 5;
export const LOG_ARCHIVE_MAX_ATTEMPTS = 100;
export const LOG_ARCHIVE_CROP_BYTES = 256 * 1024;

export const RENDER_LOG_THROTTLE_LIMIT = 50;
export const RENDER_LOG_THROTTLE_WINDOW_MS = 1000;
