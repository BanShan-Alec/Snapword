# 主进程新增业务领域 SOP

> 仅在新增主进程业务领域时使用。跨端领域仍先遵循根 [AGENTS.md](../../AGENTS.md) §4.1 的契约先行流水线；日常维护与修复遵循[packages/main/AGENTS.md](../../packages/main/AGENTS.md) §1–3。

开发新领域时严格按以下三步骨架编写：

## Step 1: 编写 Service (`services/<domain>.service.ts` - 纯逻辑单例，零 IPC 依赖)

```typescript
import type { CreateNoteInput } from '@app/shared/schemas/notes';
import type { NoteItem } from '@app/shared/types/notes';

export class NotesService {
  async create(input: CreateNoteInput): Promise<NoteItem> {
    // 纯业务逻辑 / 文件持久化 / 系统 API 调用
    return {
      id: 'note-1',
      title: input.title,
      content: input.content,
      createdAt: Date.now(),
    };
  }
}

export const notesService = new NotesService();
```

## Step 2: 编写 Controller (`controllers/<domain>.controller.ts` - 校验 + handleTraced + 结果包装)

```typescript
import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { createNoteInputSchema } from '@app/shared/schemas/notes';
import type { NoteItem } from '@app/shared/types/notes';
import type { Result } from '@app/shared/types/result';
import { handleTraced } from '../telemetry/ipc-tracer';
import { notesService } from '../services/notes.service';
import { catchToResult, failResult, successResult } from './utils';

export function registerNotesControllers(): void {
  handleTraced(
    IPC_CHANNELS.NOTES_CREATE,
    async (_event, rawInput: unknown): Promise<Result<NoteItem>> => {
      // 1. Zod 严格校验入参（第二形参 rawInput 为 preload 解包后的纯净载荷）
      const parseResult = createNoteInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      // 2. 业务调用与统一 Result 包装
      try {
        const result = await notesService.create(parseResult.data);
        return successResult(result);
      } catch (err) {
        return catchToResult(err);
      }
    },
  );
}
```

> 新 IPC 的链路追踪规则与豁免均以[packages/main/AGENTS.md](../../packages/main/AGENTS.md) §2 为准，避免在本指南重复维护。

## Step 3: 在 `controllers/index.ts` 集中登记挂载

```typescript
import { registerNotesControllers } from './notes.controller';

export function registerAllControllers(): void {
  // ...已有 controllers
  registerNotesControllers();
}
```
