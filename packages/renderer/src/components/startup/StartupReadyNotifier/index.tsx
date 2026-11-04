import {
  APP_REACT_COMMIT_AT_KEY,
  APP_REACT_STARTUP_READY_EVENT,
} from '@app/shared/constants/startup';
import { memo, useEffect } from 'react';

// 私有常量

// 可抽离的逻辑处理函数/组件

const _StartupReadyNotifier = (_props: StartupReadyNotifierProps) => {
  // 变量声明、解构

  // 组件状态

  // 网络IO

  // 数据转换

  // 逻辑处理函数

  // 组件Effect
  useEffect(() => {
    window[APP_REACT_COMMIT_AT_KEY] = Date.now();
    performance.mark('app:react-commit');
    window.dispatchEvent(new Event(APP_REACT_STARTUP_READY_EVENT));
  }, []);

  // 组件渲染
  return null;
};

// props 类型定义
type StartupReadyNotifierProps = Record<string, never>;

declare global {
  interface Window {
    [APP_REACT_COMMIT_AT_KEY]?: number;
  }
}

export const StartupReadyNotifier = memo(_StartupReadyNotifier);
