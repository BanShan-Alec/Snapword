# AGENTS.md — 全局架构守则与全仓任务路由

> 本文件是全仓架构红线与任务路由入口：全局硬红线 + 包级规则索引 + 开发流门禁。
> 进入任何 `packages/` 目录工作前，以该包的 `AGENTS.md` 为唯一真源。项目总览与架构见 [README.md](README.md)。

## 1. 技术栈速览

Electron 45（`contextIsolation` + `sandbox`）· React 19 + TypeScript · Vite 8（Rolldown 内核）·
Biome 2（格式化 + Lint）· LinguiJS 6（中文优先 Source-as-Key）· Vitest（单元）+
Playwright（E2E，真实 Electron 窗口）· pnpm 12 monorepo · Node >= 24

## 2. 全局红线（包无关，一句话可判定）

1. **根目录禁增业务依赖**：根 `package.json` 的 `dependencies` 只能包含 `@app/main`。（门禁：CI `verify:prebuild`）
2. **禁止桶文件**：不得新增只做重导出的 `index.ts`，严禁 `export *`；Biome `noBarrelFile` /
   `noReExportAll` 为 error，不设白名单。组件 `Xxx/index.tsx`（一组件一文件夹的本体实现）不是桶文件，除外。（例外澄清见 [CONTRIBUTING.md](CONTRIBUTING.md) §一.3）
3. **路径推导最佳实践（非阻断门禁）**：Node 脚本与构建配置推荐优先基于 `__dirname` / `import.meta.dirname` 推导绝对路径，避免依赖 `process.cwd()` 产生工作目录偏移风险；作为工程指导原则遵循，非硬性机械阻断门禁。（事由：桌面快捷方式启动时工作目录偏移；规范见 [CONTRIBUTING.md](CONTRIBUTING.md) §七）

## 3. 包索引（规则真源在各包 AGENTS.md）

| 包               | 职责                                                | 规则文件                                                                                                             |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@app/main`      | 主进程：Controller/Service 分层、窗口与系统生命周期 | [packages/main/AGENTS.md](packages/main/AGENTS.md)                                                                   |
| `@app/preload`   | 安全桥接层：contextBridge 暴露 `window.api`         | [packages/preload/AGENTS.md](packages/preload/AGENTS.md)                                                             |
| `@app/renderer`  | React 界面层：Feature 驱动 + LinguiJS               | [packages/renderer/AGENTS.md](packages/renderer/AGENTS.md)（视觉另见 [DESIGN.md](packages/renderer/docs/DESIGN.md)） |
| `@app/shared`    | 跨端契约单一事实源：Schema / 通道 / 类型            | [packages/shared/AGENTS.md](packages/shared/AGENTS.md)                                                               |
| `@app/pr-review` | PR 生命周期与 OCR 审查工具链                        | [packages/pr-review/AGENTS.md](packages/pr-review/AGENTS.md)                                                         |
| `@app/docs`      | 解决方案合集文档站（Vocs，GitHub Pages 部署）       | [packages/docs/AGENTS.md](packages/docs/AGENTS.md)                                                                   |

## 4. 全栈流转范式与任务路由

### 4.1 全栈端到端流水线（SOP）

新增跨端业务领域严格遵照「契约先行、单向穿透」流水线，代码骨架由各包自包含实现：
1. **契约先行 (`@app/shared`)**：在 `schemas/` 定义 Zod 入参模型与推导类型，在 `constants/ipc-channels.ts` 声明通道，在 `types/api.ts` 扩充 `ElectronApi`。
2. **安全桥接 (`@app/preload`)**：在 `index.ts` 经 `invokeTraced` 包装透明转发至对应 IPC 通道，挂载至 `window.api`（严禁泄露 Node 原生模块）。
3. **主进程处理 (`@app/main`)**：编写纯业务 `services/<domain>.service.ts`（单例无状态），在 `controllers/<domain>.controller.ts` 中通过 `handleTraced` 校验入参并调用 Service，统一返回 `Result<T>`，并在 `controllers/index.ts` 集中登记。
4. **渲染层消费 (`@app/renderer`)**：在 `features/<domain>/hooks/` 统一通过 `useIpc` 或 `useManualRequest` 发起调用，卡片组件遵循七段式语义模板纯展示渲染。

### 4.2 任务路由导航

| 研发任务 / 关注点                              | 核心规则指引（唯一真源）                                                         |
| :--------------------------------------------- | :------------------------------------------------------------------------------- |
| 新增跨端业务域 (全栈 SOP)                      | 四包各自的 `AGENTS.md`（按上述 4.1 流水线顺序落地）                              |
| 主进程模块装配 / 生命周期 / 托盘 / 窗口        | [packages/main/AGENTS.md](packages/main/AGENTS.md)                               |
| 安全桥接 / contextBridge / IPC 追踪            | [packages/preload/AGENTS.md](packages/preload/AGENTS.md)                         |
| 渲染层 Feature 划分 / manual-only / 组件七段式 | [packages/renderer/AGENTS.md](packages/renderer/AGENTS.md)                       |
| 跨端契约 / Zod Schema / MODE 环境流转          | [packages/shared/AGENTS.md](packages/shared/AGENTS.md)                           |
| 视觉 / 设计 Token / 品牌定制                   | [packages/renderer/docs/DESIGN.md](packages/renderer/docs/DESIGN.md)             |
| 多语言词条与国际化 (LinguiJS)                  | [packages/renderer/AGENTS.md](packages/renderer/AGENTS.md) §6                    |
| 日志输出 / 异常处理 / 链路追踪规范             | [.agents/rules/logging-specification.md](.agents/rules/logging-specification.md) |
| PR 审查 / OpenCodeReview 工作流                | [.agents/skills/pr-review/SKILL.md](.agents/skills/pr-review/SKILL.md)           |
| 工程规范 / Commit 纪律 / 路径推导              | [CONTRIBUTING.md](CONTRIBUTING.md)                                               |

## 5. 开发流与验证门禁矩阵（根目录执行）

| 研发场景               | 机器门禁判据与组合命令                                             | 拦截重点与避坑指南                                                     |
| :--------------------- | :----------------------------------------------------------------- | :--------------------------------------------------------------------- |
| **日常编码闭环**       | `pnpm typecheck` · `pnpm lint` · `pnpm test`                       | 快速增量校验，运行全仓核心单元测试套件                                 |
| **PR 提交前全量门禁**  | `pnpm typecheck && pnpm lint && pnpm test && pnpm verify:prebuild` | 必须全绿方可提 PR；CI 将执行相同流水线阻断合并                         |
| **PR 生命周期管理**    | `pnpm pr-review <create\|status\|pull\|trigger\|merge>`            | 统一收敛命令，严禁手写散装 gh 命令；实现审阅与合并闭环                 |
| **pr-review 模块改动** | `pnpm test:pr-review`                                              | ⚠️ **关键判据**：根 `pnpm test` 排除了本包，改动后必须单独执行此命令！ |
| **多语言文案变动**     | `pnpm i18n:extract` ➔ 补译 ➔ `pnpm i18n:check`                     | `messages.po` 缺少英译将直接导致 CI 失败                               |
| **文档站内容变动**     | `pnpm docs:dev`（本地预览）· `pnpm docs:build`（静态构建）         | 构建包含死链检测与 SSG 静态生成                                        |
| **发版与分发预检**     | `pnpm verify:prebuild` · `pnpm build:unpack`                       | 检查主进程 external 依赖隔离，验证打包产物完整性                       |

## 6. 指针

- 全局工程规范与协作基础设施（Git 规范 / PR 闭环 / 发版 SOP / pnpm 12 机制 / build/lib）：[CONTRIBUTING.md](CONTRIBUTING.md)
- 横切规则（globs 触发，落盘日志英文）：[.agents/rules/logging-specification.md](.agents/rules/logging-specification.md)

## 7. 模块系统与脚本执行约定

- **全仓 ESM-only**：包源码统一 ES Module；`.ts` 脚本用 `tsx` 直接执行（`scripts/*.ts`、pr-review CLI），不引入 ts-node/CJS 包装。
- **main / preload 产物是 CJS**：Vite 以 lib 形式输出 `dist/index.cjs`，`package.json` 的 `main`/`exports` 指向它；源码仍是 ESM，由构建器转译。
- **renderer 的 Node 隔离是约定、未机械 enforce**：靠 `packages/tsconfig/react.json` 的 `types: ["vite/client"]` 白名单约束，但 `vite.config.ts` 与 `src` 同属一个 program，Node 类型会经 `vite` 传递进来。不要在 renderer 里 `import 'node:fs'` 或使用 `__dirname` / `process`，typecheck 不会拦。
