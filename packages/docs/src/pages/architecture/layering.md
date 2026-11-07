---

title: 分层架构（Controller / Service）
description: IPC 事件收敛于 Controller，核心业务封装在 Service，脱离 Electron 依赖实现纯 Node 单测。
---

# 分层架构（Controller / Service）

> **TL;DR**：主进程严格分为通信控制层（Controller）与业务逻辑层（Service）。Controller 负责参数校验与响应包装，Service 保持纯数据进出且不依赖 Electron API，可在纯 Node 环境下秒级单测。

## 1. 选型理由

桌面端主进程最常见的坏味道是把 `ipcMain.handle` 与业务逻辑糊在一个函数内：
1. **测试成本高昂**：单测一段简单逻辑必须拉起整个 Electron 原生实例，耗时长且无法在无 GUI 环境（如极简 CI runner）运行。
2. **通信与业务耦合**：一旦需要支持 CLI 模式、定时器触发或多窗口复用，原有的 IPC handler 无法被直接调用。

为此，主进程建立单向依赖流：`IPC 事件 ──> Controller ──> Service`。

## 2. 核心机制

### Controller 职责：校验、调用与包装

Controller 负责路由分发、Zod 参数合法性校验，并将异常收敛为统一的 `Result<T>`：

→ 源码：[packages/main/src/controllers/counter.controller.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/controllers/counter.controller.ts)

```ts
export function registerCounterControllers(): void {
  handleTraced(
    IPC_CHANNELS.COUNTER_INCREMENT,
    async (stepInput): Promise<Result<CounterResult>> => {
      try {
        // 1. Zod 校验入参，非法入参直接阻断
        const parsed = stepInputSchema.safeParse(stepInput);
        if (!parsed.success) {
          return failResult(ErrorCode.INVALID_ARGUMENT, '步长参数格式错误');
        }

        // 2. 委托纯业务 Service 处理
        return successResult(counterService.increment(parsed.data.step));
      } catch (err) {
        return catchToResult(err);
      }
    },
  );
}
```

### Service 职责：纯粹的业务本体与脱壳单测

Service 不接触 `ipcMain`、`event.sender`，输入与输出均为纯 TypeScript 数据结构：

→ 源码：[packages/main/src/services/counter.service.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/services/counter.service.ts)

```ts
export class CounterService {
  getCounter(): CounterResult {
    const store = getAppConfigStore();
    return { count: store.get('serverCounter') };
  }

  increment(step = 1): CounterResult {
    const store = getAppConfigStore();
    const newCount = store.get('serverCounter') + step;
    store.set({ serverCounter: newCount });
    return { count: newCount, step };
  }
}

export const counterService = new CounterService();
```

所有 Controller 由主模块显式注册挂载，全仓禁止散落的裸写：

```ts
export function registerAllControllers(): void {
  registerSystemControllers();
  registerCounterControllers();
  registerCalculatorControllers();
  // ... 其余业务域控制器
}
```

## 3. 桌面端避坑注意事项

- **Service 严禁 import Electron**：
  - 纯业务 Service（如运算、数据清洗、更新错误分类）不得出现 `import { ... } from 'electron'`。若需持久化或系统能力，必须通过依赖注入或下沉至 `modules/` 基础设施层，确保 Service 可在 Vitest Node 环境下直接测试。
- **Store 依赖严禁在 Service 构造函数立即求值**：
  - 若 Service 依赖持久化配置（如 `getAppConfigStore()`），必须在业务方法调用时延迟读取（Lazy Read），严禁在 `new Service()` 构造函数中直接执行。避免因主进程模块装配时序未就绪引发启动闪退。
- **IPC 管道中禁止抛出未捕获异常**：
  - 未捕获的 Promise Rejection 会导致跨进程 IPC 通道挂死或渲染端处于无限等待状态。必须经由 `catchToResult(err)` 转化为包含结构化 `ErrorCode` 的 `Result<T>`。
- **禁止在 Controller 之外裸写 `ipcMain.handle`**：
  - 所有跨端监听统一通过 `register<Domain>Controllers()` 集中装配，并用 `handleTraced` 包装以自动接入 W3C 链路追踪上下文。
