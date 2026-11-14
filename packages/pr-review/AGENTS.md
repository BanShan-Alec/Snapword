# @app/pr-review AGENTS.md — 评审工具包规则

> 全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。工具链契约唯一真源见 [.agents/skills/pr-review/SKILL.md](../../.agents/skills/pr-review/SKILL.md)。

## 1. 架构分层与目录职责

本包为 Pull Request 生命周期管理与 OpenCodeReview (OCR) 自动化审查工具链，代码结构如下：

| 目录/切片       | 核心职责                                                          | 依赖与可见性约束                                             |
| :-------------- | :---------------------------------------------------------------- | :----------------------------------------------------------- |
| `src/cli.ts`    | 命令行入口与全局标志位解析                                        | 集中注册子命令，严禁在此写具体业务逻辑                       |
| `src/commands/` | 薄命令交互适配（`create`, `status`, `pull`, `trigger`, `merge`）  | 负责终端参数提取与人机交互展示，调用 `core/` 工作流引擎      |
| `src/ports/`    | 端口契约定义（`VcsProvider` 等纯领域接口与类型）                  | 纯类型与接口定义，不依赖任何外部工具                         |
| `src/adapters/` | 基础设施适配器（`CliVcsAdapter` 生产、`InMemoryVcsAdapter` 测试） | 封装 Git 与 GitHub CLI 原始交互，对外暴露强类型领域模型      |
| `src/core/`     | 核心引擎与领域服务（`PrWorkflowEngine`、`ReviewStorage` 等）      | 纯领域逻辑，依赖端口接口，具备 100% 离线确定性单元测试       |
| `src/utils/`    | 终端高亮、进程辅助与基础工具函数                                  | 纯工具函数                                                   |
| `reviews/`      | OCR 审查看板产物目录（`pr-<PR>-round-<N>.md`）                    | **纯运行产物，严禁手改**；内置保留最近 10 轮历史自动轮转清理 |

## 2. 核心架构与交互铁律

1. **唯一真源对齐**：修改命令逻辑或参数前，**必须先读** [.agents/skills/pr-review/SKILL.md](../../.agents/skills/pr-review/SKILL.md)，所有对外命令契约与 OCR 提示词口径以此为基准。
2. **唯一调用入口**：根目录 `pnpm pr-review <command>` 是该工具包全仓唯一合法的调用方式，严禁绕过 CLI 或在业务脚本中散装拼凑 `gh` 命令。
3. **全仓 ESM-only 执行**：源码为 ES Module，直接经 `tsx` 运行，禁止引入 CommonJS 混编或引入 `ts-node`。

## 3. 提交前门禁（⚠️ 孤岛单测重点提醒）

```bash
# ⚠️ 关键门禁：根目录 `pnpm test` 在 vitest.config.ts 中排除了 packages/pr-review/**
# 修改本包代码后，必须显式单独执行专用单测命令：
pnpm test:pr-review

# 类型与代码风格校验（全仓门禁）：
pnpm typecheck
pnpm lint
```
