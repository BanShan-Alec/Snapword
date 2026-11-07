---

title: 主进程单元测试（EventEmitter）
description: 将业务逻辑与系统依赖解耦，纯逻辑脱壳秒测，生命周期模块通过 EventEmitter 与边界打桩。
---

# 主进程单元测试（EventEmitter）

> **TL;DR**：主进程代码无需每次都把 Electron 运行时跑起来。纯逻辑 Service 彻底与系统脱壳秒测，强依赖系统的生命周期模块通过轻量 `EventEmitter` 模拟 `app` 事件并在模块边界使用 `vi.spyOn` 换桩，兼顾毫秒级执行效率与高覆盖率。

## 1. 选型理由

- **摆脱 Electron 运行时启动包袱**：如果在单元测试中真实导入 `electron` 模块并创建窗口，单次测试耗时将从数毫秒激增至数秒，且无法直接跑在轻量 Node CI 节点上。
- **防止全局原型污染**：市面上通用的 `electron-mock` 等重量级库经常存在全局原型链污染与 API 版本滞后问题，导致单测通过但生产报错。
- **分层解耦的必然成果**：遵循 Controller / Service 分层架构后，绝大多数核心业务算法（如更新错误分类、日志行截断、环境解包）本质上都是纯 TypeScript 函数，完全可以在脱壳状态下获得 100% 单元测试覆盖。

## 2. 核心机制

### 场景一：纯逻辑/算法脱壳单测（零外部依赖）

→ 源码：[packages/main/tests/unit/updater-classify.test.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/tests/unit/updater-classify.test.ts)

```ts
import { AppError } from '@app/main/errors/AppError';
import { classifyUpdaterError } from '@app/main/services/updater-classify';
import { ErrorCode } from '@app/shared/constants/error-codes';
import { describe, expect, it } from 'vitest';

describe('classifyUpdaterError', () => {
  it('优先采用结构化 AppError 中携带的明确业务错误码', () => {
    const timeout = new AppError('请求超时', ErrorCode.UPDATER_NETWORK_ERROR);
    expect(classifyUpdaterError(timeout, ErrorCode.UPDATER_CHECK_FAILED)).toBe(
      ErrorCode.UPDATER_NETWORK_ERROR,
    );
  });

  it('智能识别 electron-updater 底层抛出的 net::ERR_ 前缀', () => {
    const err = new Error('Error: net::ERR_CONNECTION_TIMED_OUT');
    expect(classifyUpdaterError(err, ErrorCode.UPDATER_CHECK_FAILED)).toBe(
      ErrorCode.UPDATER_NETWORK_ERROR,
    );
  });

  it('未识别异常安全回退至阶段默认兜底码', () => {
    expect(classifyUpdaterError(new Error('ENOENT'), ErrorCode.UPDATER_CHECK_FAILED)).toBe(
      ErrorCode.UPDATER_CHECK_FAILED,
    );
  });
});
```

### 场景二：系统生命周期模块单测（EventEmitter 替代 `app`）

→ 源码：[packages/main/tests/unit/tray-lifecycle.test.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/tests/unit/tray-lifecycle.test.ts)

```ts
import { EventEmitter } from 'node:events';
import * as configModule from '@app/main/modules/config.module';
import { ApplicationTerminatorOnLastWindowClose } from '@app/main/modules/auto-terminate.module';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ApplicationTerminatorOnLastWindowClose', () => {
  // 必须清理 Mock，防止跨测试用例污染
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('开启托盘驻留且未显式退出时不执行 app.quit', () => {
    // 1. 用标准的 Node 原生 EventEmitter 模拟 Electron.App
    const mockApp = new EventEmitter() as unknown as Electron.App;
    (mockApp as unknown as { quit: () => void }).quit = vi.fn();

    // 2. 在模块边界对 Store 打桩
    vi.spyOn(configModule, 'getAppConfigStore').mockReturnValue({
      get: (key: string) => key === 'minimizeToTray',
    } as unknown as ReturnType<typeof configModule.getAppConfigStore>);

    const terminator = new ApplicationTerminatorOnLastWindowClose();
    terminator.enable({
      app: mockApp,
    } as unknown as import('@app/main/ModuleContext').ModuleContext);

    // 3. 手动发射系统事件，断言是否触发 quit 行为
    mockApp.emit('window-all-closed');
    expect((mockApp as unknown as { quit: () => void }).quit).not.toHaveBeenCalled();
  });
});
```

## 3. 桌面端避坑注意事项

| 避坑要点                 | 事故表现与原因                                                                                                      | 本仓库对齐方案                                                                                                      |
| :----------------------- | :------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------ |
| **滥用全局 Mock 库**     | 使用 `jest-electron` 或全局重写 `electron` 导出，容易导致单例方法互相串台、甚至阻碍正常打包解析。                   | 严禁全局重写 `electron`；在模块实例化时以参数形式传入 `ModuleContext`，单测中仅需提供轻量 `EventEmitter` 即可驱动。 |
| **纯逻辑未剥离系统依赖** | 把更新错误码判断、日志行截断等纯函数直接塞入包含 `BrowserWindow` 的 Controller 中，导致单测必须先初始化原生图形栈。 | 逻辑强行下沉到 Service / Utils 纯函数中，单测直接测试输入输出，Controller 仅负责 IPC 路由转发。                     |
| **异步 Mock 未清理**     | `vi.spyOn(module, 'fn')` 在测试用例之间互相污染，下一个用例偶发失败。                                               | 规范在 `afterEach` 中显式执行 `vi.restoreAllMocks()`，保持测试隔离。                                                |
| **混淆单测与 E2E 边界**  | 试图在 Vitest 中测试“点击窗口最小化按钮窗口隐藏”，导致测试极度脆弱。                                                | 纯逻辑与生命周期状态流转归 Vitest 单测（毫秒级）；窗口真实视觉/系统托盘弹出全部交给 Playwright E2E。                |
