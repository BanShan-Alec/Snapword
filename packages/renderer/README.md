# @app/renderer

渲染进程（Vite 8 + React 19 + antd v6 + TailwindCSS v4 + LinguiJS + zustand + wouter），通过 preload 暴露的 `window.api` 与主进程进行类型安全的 IPC 通信。

> 🤖 **AI 协作者**：本包的目录结构 / Feature 规范 / 请求层 / 组件约定已收敛至 [AGENTS.md](./AGENTS.md)，动手前必读；视觉规范见 [docs/DESIGN.md](./docs/DESIGN.md)；全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。

```bash
pnpm --filter @app/renderer dev        # 本地开发（由根目录 pnpm dev 统一编排）
pnpm --filter @app/renderer build      # 生产打包（含类型检查与按需 Chunk 分割）
pnpm --filter @app/renderer extract    # 一键提取自然中文词条至 PO 字典
pnpm --filter @app/renderer typecheck  # TypeScript 类型检查
pnpm --filter @app/renderer lint       # Biome 代码规范与格式化检查
```

## 分层架构

渲染层采用 Feature-Driven 架构，以所有权与副作用严格切分：
- **按所有权隔离**：单一业务域代码收敛于 `features/<domain>/`（translate / vocabulary / history / glossary / settings / help）；仅在真实复用时上提至跨域层。
- **按副作用隔离**：`hooks/` 持有状态与 IPC 调用并输出 View Model；`components/` 保持无副作用纯展示渲染。
- **单向依赖流**：`entries → features → 跨域层`，各 Feature 之间禁止跨域直接引用。详细架构铁律与 SOP 见 [AGENTS.md](./AGENTS.md)。

## 已知取舍

- **路由层只做编排**：主窗口的六个业务域挂在 `entries/home/App.tsx` 的 wouter 路由上，不引入大型路由库；业务状态默认下沉在 feature 内，出现第二个独立消费者再上提。
- **不建第二份 API map**：类型全部从 `ElectronApi`（`@app/shared/types/api`）推导，避免手写表与真实契约漂移。
- **请求 hooks 随 P5 引入**：当前 IPC 调用统一经 `lib/ipc.ts` 的 `callIpc`；`useIpc` / `useManualRequest` 落地后按 AGENTS.md §4 的 manual-only 规则执行。

## 跨包与文档关联

- 多语言实操与架构：参见 [AGENTS.md](./AGENTS.md) §6
- 视觉与设计令牌：参见 [docs/DESIGN.md](./docs/DESIGN.md)
- 契约源头：参见 [packages/shared/README.md](../shared/README.md)
- 安全桥接：参见 [packages/preload/README.md](../preload/README.md)
- 主进程实现：参见 [packages/main/README.md](../main/README.md)
- 工程与提交规范：参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)
- 返回根目录：[README.md](../../README.md)
