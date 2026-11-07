import { useRequest } from 'ahooks';
// ahooks 根导出不含 useRequest 的 Options/Result 类型，且该包无 exports 字段，
// 故从内部路径导入（已锁 ahooks 3.10.x；升级后若路径失效，tsc 会显式报错，届时本地重声明）
import type {
  Options as UseRequestOptions,
  Result as UseRequestResult,
} from 'ahooks/lib/useRequest/src/types';

/**
 * 自动触发能力清单：从 ahooks Options 中剔除的键。
 * `manual` 一并剔除——由本封装写死为 true。
 */
type AutoTriggerOptionKeys =
  | 'manual'
  | 'refreshDeps'
  | 'refreshDepsAction'
  | 'pollingInterval'
  | 'pollingWhenHidden'
  | 'pollingErrorRetryCount'
  | 'refreshOnWindowFocus'
  | 'focusTimespan'
  | 'debounceWait'
  | 'debounceLeading'
  | 'debounceTrailing'
  | 'debounceMaxWait'
  | 'throttleWait'
  | 'throttleLeading'
  | 'throttleTrailing'
  | 'ready';

/** 继承 ahooks 全部选项后剔除自动触发键：上游新增的合法选项自动获得，禁用一个键只需加一个字符串 */
export type UseManualRequestOptions<TData, TParams extends unknown[]> = Omit<
  UseRequestOptions<TData, TParams>,
  AutoTriggerOptionKeys
>;

/** 直接复用 ahooks Result，不做裁剪 */
export type UseManualRequestResult<TData, TParams extends unknown[]> = UseRequestResult<
  TData,
  TParams
>;

/**
 * useRequest 的 manual-only 封装：挂载、deps、轮询、聚焦、ready、防抖/节流等
 * 自动触发能力从编译期到运行期均不存在，触发点必须显式（事件处理器或显式 run()）。
 * 保留 ahooks 内建 take-latest 竞态防护，以及跨组件 cacheKey 共享能力。
 */
export function useManualRequest<TData, TParams extends unknown[] = []>(
  service: (...args: TParams) => Promise<TData>,
  options?: UseManualRequestOptions<TData, TParams>,
): UseManualRequestResult<TData, TParams> {
  // manual 写死 true：置于展开之后，运行时同样无法被 options 覆盖
  return useRequest(service, { ...options, manual: true });
}
