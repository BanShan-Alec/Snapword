---

title: 全栈端到端功能开发（Fullstack-SOP）
description: 遵循 shared ➔ preload ➔ main ➔ renderer 单向流转闭环，类型安全与链路追踪一气呵成。
---

# 全栈端到端功能开发（Fullstack-SOP）

> **TL;DR**：新增跨进程功能必须严格遵照「契约先行、单向穿透」流水线：在 `shared` 声明 Schema 与通道常量，经 `preload` 安全桥接，主进程 `main` 校验并执行业务，最终由 `renderer` 纯展示消费。类型安全与 W3C 全链路追踪全自动闭环。

## 1. 选型理由

- **契约单一事实源（Contract-First）**：Electron 桌面端包含主进程（Node.js）与渲染进程（Chromium），若通信双方各自手写类型，字段变更极易引发静默崩坏。先在 `shared` 定义 Zod Schema 与通道常量，确保类型与运行时校验唯一真源。
- **透明注入全链路追踪**：跨进程排错极为痛苦。通过 Preload 的 `invokeTraced` 自动注入 traceparent、Main 端的 `handleTraced` 自动解包创建 Span，开发者无需手动关心跨端链路传递。
- **严格单向调用流**：杜绝逆向调用与跨包泄漏，确保架构边界清晰、可测性高。

## 2. 核心流转时序与开发范式

以新增 `notes` 领域为例，严格按以下四步流水线开发：

### Step 1: 契约层（`@app/shared` - 跨端唯一真源）

→ 规范直链：[packages/shared/AGENTS.md](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/shared/AGENTS.md)
```ts
// 1. schemas/notes.ts: 入参校验与推导类型
export const createNoteInputSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(''),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

// 2. constants/ipc-channels.ts: 通道常量
export const IPC_CHANNELS = { NOTES_CREATE: 'notes:create' } as const;

// 3. types/api.ts: 扩充全局 ElectronApi 契约
export interface ElectronApi {
  notes: { create: (input: CreateNoteInput) => Promise<Result<NoteItem>> };
}
```

### Step 2: 安全桥接层（`@app/preload` - 零逻辑透明转发）

→ 规范直链：[packages/preload/AGENTS.md](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/preload/AGENTS.md)
```ts
// src/index.ts: 经 invokeTraced 透明包装并暴露给 window.api
export const apiBridge: ElectronApi = {
  notes: { create: (input) => invokeTraced(IPC_CHANNELS.NOTES_CREATE, input) },
};
```

### Step 3: 主进程核心层（`@app/main` - 业务执行与入参校验）

→ 规范直链：[packages/main/AGENTS.md](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/AGENTS.md)
```ts
// 1. services/notes.service.ts: 纯数据逻辑单例（零 IPC 依赖）
export class NotesService { async create(input: CreateNoteInput): Promise<NoteItem> { ... } }

// 2. controllers/notes.controller.ts: handleTraced 校验入参并返回 Result<T>
handleTraced(IPC_CHANNELS.NOTES_CREATE, async (_event, rawInput: unknown) => {
  const parsed = createNoteInputSchema.safeParse(rawInput);
  if (!parsed.success) return failResult(parsed.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
  try { return successResult(await notesService.create(parsed.data)); } catch (err) { return catchToResult(err); }
});
```

### Step 4: 渲染展示层（`@app/renderer` - 响应式调用与七段式渲染）

→ 规范直链：[packages/renderer/AGENTS.md](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/AGENTS.md)
```tsx
// features/notes/hooks/useNotes.ts: 消费统一封装的 useIpc
const { runAsync, loading } = useIpc('notes.create', window.api.notes.create);

// features/notes/components/NotesCard/index.tsx: 遵循七段式语义模板纯展示渲染
```

## 3. 桌面端避坑注意事项

| 避坑要点                       | 事故表现与原因                                                                                 | 本仓库对齐方案                                                            |
| :----------------------------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **Controller 遗漏集中登记**    | 主进程写了 Controller 却未在 `controllers/index.ts` 中注册，调用抛出 `No handler registered`。 | 必须在 `registerAllControllers()` 中显式挂载，严禁裸写分散监听。          |
| **IPC 返回裸 Error 对象**      | 未捕获 Promise rejection 跨进程传递，渲染端收到空对象 `{}` 导致调试困难与白屏崩溃。            | 必须使用 `catchToResult(err)` 统一包装为带 `ErrorCode` 的 `Result<T>`。   |
| **渲染层异步未走 manual-only** | 使用第三方库默认轮询或自动防抖，桌面端后台常驻时疯狂空转消耗 CPU 与电量。                      | 统一采用 `useManualRequest` 或 `useIpc`，显式由用户交互或特定 Hook 触发。 |
