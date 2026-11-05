/**
 * 全栈统一 IPC 响应结果契约对象
 */
export type Result<T> =
  | { success: true; data: T; traceId?: string }
  | { success: false; error: string; code?: string; traceId?: string };
