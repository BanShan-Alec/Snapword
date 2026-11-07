---

title: 模块生命周期（ModuleRunner）
description: 采用 ModuleRunner 微内核将系统能力解耦为可插拔模块，链式装配并在入口删一行即可整体退场。
---

# 模块生命周期（ModuleRunner）

> **TL;DR**：主进程横向系统能力一律实现 `AppModule` 接口（仅包含 `enable()` 方法），由微内核 `ModuleRunner` 串成顺序 Promise 链执行；系统能力可插拔，入口删一行即可整体卸载。

## 1. 选型理由

传统 Electron 项目极易演化为数千行的“巨石 `main.js`”：窗口创建、系统托盘、自动更新、CSP 设置、单实例锁等逻辑全部混杂在 `app.whenReady()` 的嵌套回调中，初始化时序无从厘清，删除或重构某项能力往往牵一发而动全身。

项目采用微内核架构将原生生命周期事件垂直切片：每个能力是一个模块，装配顺序显式写在入口，关注点与依赖关系同时可见。

## 2. 核心机制

`initApp` 里的 `.init()` 链就是真实初始化时序：`init()` 对每个模块立即调用 `enable()`，同步完成的部分当场执行；返回的 Promise 从调用点就开始跑，只是被接到链尾，`await moduleRunner` 会等链上所有 Promise 落定。下图按代码顺序分阶段排列全部模块，箭头标出两处不能调换的因果依赖。

```mermaid
flowchart LR
  subgraph foundation["基础设施"]
    direction TB
    LOG["createLogModule()<br/>日志双写"]
    SENTRY["createSentryModule()<br/>崩溃监控"]
    CONFIG["createConfigModule()<br/>偏好持久化"]
    THEME["createNativeThemeModule()<br/>原生主题"]
    LOG -->|"最先装配：后续模块异常均可落盘"| SENTRY
    SENTRY --> CONFIG --> THEME
  end

  subgraph runtime["通信与就绪"]
    direction TB
    IPC["createIPCModule()<br/>控制器路由"]
    READY["createStartupReadinessModule()<br/>就绪闩锁"]
    IPC --> READY
  end

  subgraph windows["窗口与系统生命周期"]
    direction TB
    WIN["createWindowManagerModule()<br/>主窗口"]
    UPDATER_WIN["createUpdaterWindowModule()<br/>更新窗口"]
    TRAY["createTrayModule()<br/>系统托盘"]
    SINGLE["disallowMultipleAppInstance()<br/>单实例锁"]
    TERM["terminateAppOnLastWindowClose()<br/>末窗退出"]
    WIN --> UPDATER_WIN --> TRAY --> SINGLE --> TERM
  end

  subgraph security["主进程安全加固（信任边界）"]
    direction TB
    CSP["createContentSecurityPolicyModule()<br/>CSP 响应头"]
    ORIGIN["allowInternalOrigins()<br/>内部来源白名单"]
    EXT["allowExternalUrls()<br/>外链白名单"]
    CSP --> ORIGIN --> EXT
  end

  foundation --> runtime
  runtime -->|"就绪信号先于窗口创建"| windows
  windows --> security
```

### 极简模块协议（AppModule）

每个横向系统模块只关注自己的就绪逻辑，接口只有单一方法：

→ 源码：[packages/main/src/AppModule.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/AppModule.ts)

```ts
export interface AppModule {
  enable(context: ModuleContext): Promise<void> | void;
}
```

### 微内核链式驱动（ModuleRunner）

`ModuleRunner` 维护一条顺序 Promise 执行链：`init()` 立即调用 `enable()`，返回 Promise 时把它接到链尾；它自身实现 `PromiseLike`，入口一句 `await moduleRunner` 即可收敛整条链。对外只导出 `createModuleRunner()` 工厂，`ModuleRunner` 类不直接暴露。

→ 源码：[packages/main/src/ModuleRunner.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/ModuleRunner.ts)

节选：`ModuleRunner` 类（省略 import；工厂 `createModuleRunner()` 见文件末尾）：

```ts
class ModuleRunner implements PromiseLike<void> {
  private promise: Promise<void>;

  constructor() {
    this.promise = Promise.resolve();
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ): PromiseLike<TResult1 | TResult2> {
    // biome-ignore lint/suspicious/noExplicitAny: Delegate error handler to Promise#then
    return this.promise.then(onfulfilled, onrejected as any);
  }

  init(module: AppModule) {
    const p = module.enable(this.createModuleContext());

    if (p instanceof Promise) {
      this.promise = this.promise.then(() => p);
    }

    return this;
  }

  private createModuleContext(): ModuleContext {
    return {
      app,
    };
  }
}

export function createModuleRunner() {
  return new ModuleRunner();
}
```

### 主进程入口的流水线装配

系统能力的启动完全声明式收拢在 `initApp` 中：加一个能力 = 新建 module 文件 + 流水线加一行；删掉 `createTrayModule()` 那一行，托盘连同它的原生事件订阅整体退场。

→ 源码：[packages/main/src/index.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/index.ts)

节选：`initApp()` 内的装配链（省略函数签名与异常处理）：

```ts
const moduleRunner = createModuleRunner()
  .init(createLogModule())
  .init(createSentryModule())
  .init(createConfigModule())
  .init(createNativeThemeModule())
  .init(createIPCModule())
  // 主进程就绪源：链位在 WindowManager 之前，信号先于窗口与壳
  .init(createStartupReadinessModule())
  .init(createWindowManagerModule({ initConfig }))
  .init(createUpdaterWindowModule({ initConfig }))
  .init(createTrayModule())
  .init(disallowMultipleAppInstance())
  .init(terminateAppOnLastWindowClose())

  // Security
  .init(createContentSecurityPolicyModule())
  .init(
    allowInternalOrigins(
      new Set(
        devServer
          ? [new URL(devServer).origin]
          : [
              initConfig.windows.home instanceof URL ? initConfig.windows.home.origin : 'file://',
              'null',
            ],
      ),
    ),
  )
  .init(allowExternalUrls(new Set(ALLOWED_EXTERNAL_URLS)));

await moduleRunner;
```

## 3. 桌面端避坑注意事项

- **模块装配顺序具有强因果依赖**：
  - 例如日志模块（`LogModule`）必须最先装配，确保后续所有模块初始化异常均可被捕获落盘；`StartupReadinessModule` 必须先于 `WindowManagerModule`，确保窗口渲染前就绪信号已完成就绪。
- **职责边界隔离（`modules/` vs `services/`）**：
  - `modules/` 仅承载横向基础设施与原生系统生命周期切片（如窗口、托盘、系统原生主题）；垂直业务逻辑一律归属于 `services/`，严禁在 `modules/` 中书写业务处理分支。
- **初始化异常阻断与 app.exit(1) 防僵尸驻留**：
  - 若某个核心前置模块在 `enable()` 中抛出 Rejected Promise，`initApp().catch()` 必须在记录日志后显式调用 `app.exit(1)`。切勿只打印错误而不退出，否则将留下一个无窗口、无 UI 响应却死死占着单实例锁与端口的系统后台僵尸进程。
- **模块注销与资源清理**：
  - 若模块持有长时间监听（如 `process.on` 或外部原生句柄），应在模块内部配合主进程退出信号主动注销，避免造成进程挂死。
