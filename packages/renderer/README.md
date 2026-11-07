# @app/renderer

渲染进程（Vite 8 + React 19 + antd + TailwindCSS + LinguiJS + zustand + ahooks），通过 preload 暴露的 `window.api` 与主进程进行类型安全的 IPC 通信。

> 架构分层、Feature 规范、请求层与组件约定见 [AGENTS.md](./AGENTS.md)；视觉规范见 [docs/DESIGN.md](./docs/DESIGN.md)；全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。

```bash
pnpm --filter @app/renderer dev        # 本地开发（由根目录 pnpm dev 统一编排）
pnpm --filter @app/renderer build      # 生产打包（含类型检查与按需 Chunk 分割）
pnpm --filter @app/renderer extract    # 一键提取自然中文词条至 PO 字典
pnpm --filter @app/renderer typecheck  # TypeScript 类型检查
pnpm --filter @app/renderer lint       # Biome 代码规范与格式化检查
```

## 分层架构

渲染层采用 Feature-Driven 架构，以所有权与副作用严格切分：
- **按所有权隔离**：单一业务域代码收敛于 `features/<domain>/`；仅在真实复用时上提至跨域层。
- **按副作用隔离**：`hooks/` 持有状态与 IPC 调用并输出 View Model；`components/` 保持无副作用纯展示渲染。
- **单向依赖流**：`entries → features → 跨域层`，各 Feature 之间禁止跨域直接引用。详细架构铁律与 SOP 见 [AGENTS.md](./AGENTS.md)。

## 已知取舍

- **面板常驻 + `hidden` 切换**：hook 已随 feature 收敛，若 tab 切换时卸载面板，本地组件状态会丢失、底层接口会重复请求。因此常驻面板保持挂载，仅切换显隐。
- **接入轻量声明式路由**：主窗口面板按需编排，不引入大型路由库；全局业务 store 保持按需下沉——默认各域无跨域共享 state，出现第二个独立消费者再上提。
- **不建第二份 API map**：类型全部从 `ElectronApi`（`@shared/types/api`）推导，避免手写表与真实契约漂移。

## 跨包与文档关联

- 多语言实操与架构：参见 [国际化（i18n）](../docs/src/pages/ui/i18n.md)
- 契约源头：参见 [packages/shared/README.md](../shared/README.md)
- 安全桥接：参见 [packages/preload/README.md](../preload/README.md)
- 主进程实现：参见 [packages/main/README.md](../main/README.md)
- 工程与提交规范：参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)
- 返回根目录：[README.md](../../README.md)
