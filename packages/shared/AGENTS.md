# @app/shared AGENTS.md — 跨端契约层规则

> 全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。本文件为该包规则唯一真源。

## 1. 四层职能架构与导出契约

代码按技术职能水平分层，业务领域在各层内垂直切分，文件命名一律采用 `kebab-case.ts`：

| 目录层级     | 核心职责                           | 规范与依赖约束                                                           | 子路径导出与消费方式             |
| :----------- | :--------------------------------- | :----------------------------------------------------------------------- | :------------------------------- |
| `constants/` | 系统级常量与跨域枚举               | `SCREAMING_SNAKE_CASE` 常量，领域特定默认值就近维护在对应 schema         | `@app/shared/constants/<domain>` |
| `types/`     | 纯 TypeScript 接口（零运行时体积） | 纯返回结构体与 `Result<T>` / `ElectronApi` 顶层抽象；无需运行时校验      | `@app/shared/types/<domain>`     |
| `schemas/`   | Zod 运行时数据校验模型             | 输入参数必须由 Zod 驱动；`z.infer` 推导类型**必须且仅允许**就近导出      | `@app/shared/schemas/<domain>`   |
| `utils/`     | 跨端纯函数工具                     | 零 Electron/Node 依赖，包含环境编解码 (`env-packer`) 与 W3C Trace 序列化 | `@app/shared/utils/<util>`       |

- **子路径直出与绝对禁止桶文件**：`package.json` 通过子路径 `exports` 直出具体文件，无根入口；严禁新增任何 `index.ts` 聚合导出或 `export *`（Biome `noBarrelFile` 硬拦截）。消费方必须按需直达具体文件。

## 2. 核心契约与环境流转

1. **Schema 唯一真源**：入参校验逻辑与编译期类型完全由 Zod 统一派生，禁止手写重复的 TypeScript 类型。
2. **纯返回接口隔离**：仅作为 IPC 返回结果的结构体归入 `types/`，避免将无校验需求的实体引入 Zod 运行时打包开销。
3. **环境跨端序列化**：运行环境以 `MODE` 为单一事实源。`utils/env-packer.ts` 保持纯粹 Base64URL 序列化契约，主进程挂载启动参数，preload 解包并 `Object.freeze` 注入 `window.__APP_ENV__`。

## 3. 命名规范

| 类别                     | 规范                        | 示例                                                              |
| :----------------------- | :-------------------------- | :---------------------------------------------------------------- |
| **文件名**               | `kebab-case.ts`             | `error-codes.ts`, `ipc-channels.ts`                               |
| **常量与枚举**           | `SCREAMING_SNAKE_CASE`      | `IPC_CHANNELS.CALCULATOR_CALCULATE`, `ErrorCode.VALIDATION_ERROR` |
| **Zod Schema**           | `camelCase` + 后缀 `Schema` | `calculateInputSchema`, `stepInputSchema`                         |
| **TypeScript 类型/接口** | `PascalCase`                | `Result<T>`, `CalculateInput`, `CalculateResult`, `ElectronApi`   |

## 4. 新增业务领域开发范式 (SOP 骨架)

以新增 `notes` 领域为例，无需在任何聚合文件中登记，直接在四个分层创建或追加对应契约：

```typescript
// 1. 运行时校验与推导类型 (src/schemas/notes.ts):
import { z } from 'zod';

export const createNoteInputSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100),
  content: z.string().default(''),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

// 2. 纯返回接口定义 (src/types/notes.ts):
export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

// 3. 通道常量声明 (src/constants/ipc-channels.ts):
export const IPC_CHANNELS = {
  // ... 其他通道
  NOTES_CREATE: 'notes:create',
  NOTES_LIST: 'notes:list',
} as const;

// 4. 全局 Bridge API 契约扩充 (src/types/api.ts):
export interface ElectronApi {
  // ... 其他领域
  notes: {
    create: (input: CreateNoteInput) => Promise<Result<NoteItem>>;
  };
}
```

### 消费端按需直达示范（严禁通过根桶导入）

```typescript
// 主进程与 preload 为 CJS 打包、无 tree-shaking，按需直达具体文件可防止整包契约与 Zod 拖入运行时
import { ErrorCode } from '@app/shared/constants/error-codes';
import { createNoteInputSchema } from '@app/shared/schemas/notes';
import type { NoteItem } from '@app/shared/types/notes';
```

## 5. 提交前门禁

根目录执行：`pnpm typecheck`（确保跨端契约类型 100% 匹配）。
