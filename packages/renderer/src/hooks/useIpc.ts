import type { IpcCallOptions } from '@app/shared/types/telemetry';
import type { UseManualRequestOptions, UseManualRequestResult } from '@/hooks/useManualRequest';
import { useManualRequest } from '@/hooks/useManualRequest';
import type { IpcApiData, IpcApiParams, IpcApiPath } from '@/lib/ipc';
import { callIpc } from '@/lib/ipc';

/**
 * 单一 IPC channel 的请求 hook = useManualRequest + callIpc。
 * 根据点分路径字符串自动推导入参和返回值解包类型，无需手写 Result 解构与类型断言。
 *
 * 只用于“一次请求对一个 channel”。多 channel 编排（一个动作路由多个接口）改用 useManualRequest，
 * service 内部用 callIpc 拼装。
 */
export function useIpc<P extends IpcApiPath>(
  path: P,
  options?: UseManualRequestOptions<IpcApiData<P>, IpcApiParams<P>> & IpcCallOptions,
): UseManualRequestResult<IpcApiData<P>, IpcApiParams<P>> {
  const { recordSuccess, ...requestOptions } = options ?? {};

  return useManualRequest<IpcApiData<P>, IpcApiParams<P>>(async (...args: IpcApiParams<P>) => {
    return callIpc(path, args, { recordSuccess });
  }, requestOptions);
}
