import { expect, test } from '@playwright/test';

/**
 * P4 骨架占位 spec（唯一保留的 e2e 入口）。
 *
 * 模板原有的十个场景（首屏 / 关闭行为 / 设置 / 更新窗口等）随功能裁剪一并移除；
 * 真实的 Snapword E2E（空链路启动 / 启动壳揭幕 / 托盘退出）待 P4 验证门
 * （工程骨架可构建可运行）之后按 docs/progress-checklist.md §8 落地。
 */
test.skip('app skeleton placeholder', async () => {
  // 占位断言：真实场景接入后替换本文件
  expect(true).toBe(true);
});
