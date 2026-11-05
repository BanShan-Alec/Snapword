# @app/preload AGENTS.md — 安全桥接层规则（AI 必读）

> 全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。本文件为该包规则唯一真源。

## 1. 架构职责与分层

Preload 运行在拥有部分 Node 能力但启用了沙箱与上下文隔离的桥接环境中，`src/` 职责划分如下：

| 文件/模块                 | 核心职责                                                        | 依赖与可见性约束                                                 |
| :------------------------ | :-------------------------------------------------------------- | :--------------------------------------------------------------- |
| `index.ts`                | 聚合实现并暴露 `apiBridge`（`contextBridge.exposeInMainWorld`） | 必须显式声明类型为 `ElectronApi`，严禁泄露 Node 原生模块         |
| `logger.ts`               | 渲染进程全局 logger 桥接                                        | 调用经 `invokeTraced` 转发至主进程落盘，实现日志统一流转         |
| `telemetry/ipc-tracer.ts` | 跨进程全链路追踪桥接                                            | 生成 W3C traceparent 并挂载 `__trace_carrier` 实现跨进程追踪透传 |

> **构建与挂载约定**：Vite 以 lib 模式输出 CJS 产物 `dist/index.cjs`（Electron 外置，`@sentry/electron` 经 `ssr.noExternal` 主动内联），主进程在创建窗口时以绝对物理路径挂载。

## 2. 核心架构铁律

1. **类型强绑定**：`apiBridge` 必须显式标注为 `@app/shared/types/api` 的 `ElectronApi`，确保编译期类型与渲染端 `window.api` 绝对对齐。
2. **强制全链路追踪 (`invokeTraced`)**：所有 IPC 通信必须通过 `telemetry/ipc-tracer.ts` 的 `invokeTraced` 包装以携带 traceparent，严禁直接调用原生的 `ipcRenderer.invoke`。
3. **通道常量单一真源**：调用 channel 必须从 `@app/shared/constants/ipc-channels` 引入，严禁手写硬编码字符串。
4. **零业务逻辑**：Preload 仅作“透明请求转发器”，严禁在 Preload 内部做数据持久化、复杂运算或状态缓存。
5. **绝对沙箱隔离 (Zero Node Leak)**：在 `contextIsolation: true` 与 `sandbox: true` 约束下，严禁向渲染端暴露任何 Node.js 原生模块（如 `fs`、`child_process`）或 `electron` 原始对象。

## 3. 新增 Bridge API 开发范式 (代码骨架模板)

新增业务领域 API 桥接时，在 `src/index.ts` 中遵循以下骨架对齐实现：

```typescript
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { ElectronApi } from '@app/shared/types/api';
import type { CreateNoteInput } from '@app/shared/schemas/notes';
import type { NoteItem } from '@app/shared/types/notes';
import type { Result } from '@app/shared/types/result';
import { invokeTraced } from './telemetry/ipc-tracer';

export const apiBridge: ElectronApi = {
  // ... 已有领域
  notes: {
    create: (input: CreateNoteInput): Promise<Result<NoteItem>> =>
      invokeTraced(IPC_CHANNELS.NOTES_CREATE, input),
    list: (): Promise<Result<NoteItem[]>> => invokeTraced(IPC_CHANNELS.NOTES_LIST),
  },
};

// 挂载至渲染进程 window.api
contextBridge.exposeInMainWorld('api', apiBridge);
```

## 4. 提交前门禁

- 根目录执行：`pnpm typecheck`（重点校验 `apiBridge` 与 `@app/shared` 契约是否 100% 对齐）。
- 构建产物校验：`pnpm --filter @app/preload run build`。
