---

title: 端到端断言策略（Shell-stub + Tolerance）
description: 启动期全面打桩系统级 shell 模块，断言只锁协议与最终态，窗口几何与跨进程恢复保留物理容差。
---

# 端到端断言策略（Shell-stub + Tolerance）

> **TL;DR**：E2E 测试严禁穿透操作系统原生界面。启动阶段全局 Mock 掉 Electron `shell` 模块，断言只锁状态机协议与兜底上界，对窗口几何尺寸预留物理舍入容差（2px/10px）。

## 1. 选型理由

- **规避无头 CI 挂死风险**：在 Linux Xvfb 或 GitHub Actions 无头环境中调用 `shell.openExternal`，由于缺少原生桌面文件管理器，系统会触发 `xdg-open` 误唤起后台浏览器孤儿进程，死锁主进程的 stdio 管道致使 Playwright Worker 45s 超时。
- **防止本地测试污染**：若直接调用原生接口，本地跑 E2E 会疯狂弹出外部浏览器、资源管理器和原生系统弹窗，干扰开发体验。
- **抹平跨平台像素级舍入误差**：Windows 无边框窗口在 High-DPI 缩放下具有不可见的边框阴影（Resize Border），必须使用带有容差的断言。

## 2. 核心机制

### 全局 Shell 模块打桩

→ 源码：[e2e/helpers/electron.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/e2e/helpers/electron.ts)

```ts
// 注入主进程 shell 安全桩：防止外部孤儿进程持有 stdio 管道导致 Playwright Worker 挂死
await electronApp.evaluate(({ shell }) => {
  shell.openExternal = async (url) => {
    console.warn('[E2E Shell Stub] openExternal called with:', url);
  };
  shell.openPath = async (path) => {
    console.warn('[E2E Shell Stub] openPath called with:', path);
    return '';
  };
  shell.showItemInFolder = (fullPath) => {
    console.warn('[E2E Shell Stub] showItemInFolder called with:', fullPath);
  };
});
```

### 窗口几何与跨进程恢复容差断言

→ 源码：[e2e/window-state.spec.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/e2e/window-state.spec.ts)

```ts
// 1. 自适应算法断言：容差 10px（Windows 无边框窗口 getBounds 含不可见 resize 边框，实测 +3/+8px）
expect(Math.abs(bounds.width - expectedWidth)).toBeLessThanOrEqual(10);
expect(Math.abs(bounds.height - expectedHeight)).toBeLessThanOrEqual(10);

// 2. 跨进程重启恢复断言：容差 2px（Windows 对无边框窗口恢复时存在亚像素舍入）
for (const key of ['x', 'y', 'width', 'height'] as const) {
  expect(Math.abs(restored[key] - expected[key])).toBeLessThanOrEqual(2);
}
```

### 状态机与时序只锁最终态与兜底上界

→ 源码：[e2e/first-screen.spec.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/e2e/first-screen.spec.ts)

```ts
// 时序断言只锁"最终态 + 兜底上界"：微观淡入/淡出节奏留给目测，门禁只锁兜底限时
test('AC-1 双门禁达成：body 挂上 app-startup-ready（3000ms 兜底界内）', async ({ page }) => {
  await expect(page.locator('body')).toHaveClass(/app-startup-ready/, {
    timeout: STARTUP_REACT_FALLBACK_MS,
  });
});

test('AC-2 壳物理退场：ready 后 ≤1000ms #loading 从 DOM 物理卸载', async ({ page }) => {
  await expect(page.locator('#loading')).toHaveCount(0, {
    timeout: STARTUP_UNMOUNT_DELAY_MS * 2,
  });
});
```

## 3. 桌面端避坑注意事项

| 避坑要点                     | 事故表现与原因                                                                                                                   | 本仓库对齐方案                                                                                                       |
| :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **`shell` 模块泄露导致挂死** | Linux Xvfb 下 `shell.openExternal` 唤起 Firefox 孤儿进程，进程持有 stdout 管道导致 Playwright Worker teardown 永远无法到达 EOF。 | 启动后立即通过 `electronApp.evaluate` 覆盖 `openExternal`、`openPath` 和 `showItemInFolder` 为内存打桩函数。         |
| **绝对等值断言翻红**         | 断言 `expect(bounds.width).toBe(1024)`，在 Windows 上实测返回 1032（含 +8px 隐式阴影边框），导致 CI 随机翻红。                   | 涉及操作系统窗口几何尺寸断言，统一使用 `Math.abs(actual - expected) <= tolerance`（工作区 10px，重启恢复 2px）。     |
| **过度断言动画微观帧**       | 断言 CSS 过渡期第 160ms 时的 opacity 为 0.45，CI 虚拟机 CPU 抢占抖动必挂。                                                       | E2E 仅断言最终状态（如稳定后 `opacity === '1'`）与兜底超时时间（如 `STARTUP_REACT_FALLBACK_MS`），不过度干预过渡态。 |
| **日志因果一致性验证**       | 仅验证 UI 不验证日志落盘，生产环境丢日志难以排查。                                                                               | 真实 IPC 交互后，直接调用 `fs.readFileSync` 校验 `userData/logs/main.log` 与 `traces.ndjson` 中的真实行因果关联。    |
