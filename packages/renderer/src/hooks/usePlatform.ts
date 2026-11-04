import { useEffect } from 'react';

/**
 * 平台类名注入：将 preload 暴露的 process.platform 映射为 documentElement 平台类名，
 * 供 CSS 按平台做标题栏避让（macOS 红绿灯 / Windows 窗口控制按钮）。
 */

// 私有常量

// 可抽离的逻辑处理函数/组件
export function usePlatform() {
  useEffect(() => {
    document.documentElement.classList.add(`platform-${window.api.system.getPlatform()}`);
  }, []);
}
