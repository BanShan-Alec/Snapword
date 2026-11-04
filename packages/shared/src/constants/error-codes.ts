/**
 * 语义化错误码统一推行常量 (SCREAMING_SNAKE_CASE)
 * 严禁使用 HTTP 404/500 或纯数字错误码。
 * 取词/IPC 协议层的错误码见 docs/ipc-contract.md（B-02 §6）；主进程业务码在此登记。
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DIVIDE_BY_ZERO: 'DIVIDE_BY_ZERO',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  WINDOW_NOT_FOUND: 'WINDOW_NOT_FOUND',
  INVALID_PROTOCOL: 'INVALID_PROTOCOL',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
