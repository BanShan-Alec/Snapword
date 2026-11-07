# @app/pr-review

> PR 生命周期管理与 OpenCodeReview (OCR) 自动化看板套件。

本包将项目的 Pull Request 生命周期（开 PR、状态查询、安全合并）与 AI Code Review 闭环流程完整收敛，所有 Review 产物与轮次看板均保存在本包的 `reviews/` 目录下（并内置最近 10 轮保留与自动清理机制）。

---

## 🚀 统一命令速查

在项目根目录可通过 `pnpm pr-review <command>` 调用：

| 指令                     | 简写     | 详细说明                                                                                                                                          |
| :----------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm pr-review pull`    | -        | 拉取最新 CI 产物并在 `reviews/` 下生成 `pr-<PR>-round-<N>.md` 看板（分支未关联 PR 时为 `branch-<分支>-round-<N>.md`），自动清理超过 10 轮的旧看板 |
| `pnpm pr-review trigger` | `review` | 在当前 PR 讨论区自动发表 `/review` 评论（等价于手动评论 `/review` 或 `/ocr`），触发 OpenCodeReview 增量扫描                                       |
| `pnpm pr-review create`  | `pr`     | 运行前置检查（gh 已认证、工作区干净、非 main 分支），推送特性分支并基于 PR 模板自动创建 Pull Request                                              |
| `pnpm pr-review status`  | -        | 查看当前仓库 PR 与所有 checks 状态                                                                                                                |
| `pnpm pr-review merge`   | -        | 先交互确认（`--yes` 跳过），再轮询等待分支保护门禁全绿（15s × 40 次上限），随后 squash 合并并清理远端分支                                         |

---

## 🎯 1. 核心机制概览

本仓库接入了基于大语言模型的代码审查工具 `alibaba/open-code-review`，并进行了深度定制优化：

```mermaid
flowchart TD
    A["提交 Pull Request (Opened / Reopened / Ready)"] -->|"自动触发首次 Review"| B["AI 审查执行"]
    C["后续代码更新 (Push)"] -->|"不自动触发 (防噪音/省 Token)"| D["开发者本地多轮自测"]
    D -->|"在 PR 评论回复 /review 或 /ocr，或运行 pnpm pr-review trigger"| B
    B --> E["📊 更新置顶 Summary 看板<br/>(按 Critical/High/Medium 分级)"]
    B --> F["💬 发送 Inline 评论<br/>(全部严重级均行内呈现，Summary 折叠路由已关闭)"]
    B --> G["✨ 自动 Resolve 已修复的旧 Thread<br/>(新 Commit 修复后自动关闭)"]
```

### 1.1 真增量审查 (`checkpoint_range: true`)

- **初次开 PR**：从 `merge-base` 到最新 commit 进行全量审查。
- **后续复查**：Bot 在置顶看板中记录上次审查的 commit 检查点。后续审查**仅对 `<checkpoint>..<new head>` 之间的纯增量提交进行扫描**，避免重复审查旧代码。
- **不重复评论 (`incremental: true`)**：即使增量范围有交集，相同代码行也不会重复发送雷同评论。
- **fail-closed 回退**：检查点标记缺失、基线移动等存疑场景下自动回退全量审查，不会静默漏看。

### 1.2 置顶动态看板 (`sticky_summary: true`)

- Bot 首次运行会在 PR 讨论区发布一条带有隐式签名（`<!-- ocr-summary -->`）的看板。
- 后续轮次的审查结果将通过 GitHub API **直接原地更新（PATCH）这一条看板**，避免反复发布主评论造成 PR 刷屏。

### 1.3 噪声治理（折叠路由已关闭）

- **全部发现均以 Inline Comment 呈现**：Critical / High / Medium / Low 一律在代码差异行内生成评论，便于就地查阅与逐条处置。
- **折叠路由显式关闭**：`route_severity_below` 已置空——不再把低危建议倾倒进置顶 Summary 的折叠区（早期配置曾为 `low`，已废弃），避免看板变成垃圾桶。
- **控频改由三重机制承担**：`incremental` 相同代码行不重复评论、`resolve_outdated` 自动关闭已修复 Thread、Push 不自动触发（仅开 PR 与手动 `/review` 触发）。

### 1.4 自动关闭过时评论 (`resolve_outdated: true`)

- 当你在后续 commit 中修改了原来报错的代码行后，GitHub 会自动将其标记为 `isOutdated`。
- Bot 在下一轮审查确认该位置没有再次报错后，会自动调用 GraphQL API 将该 Review Thread 标记为 **Resolved**；人类回复过或已被新发现覆盖的 Thread 受保护，不会被自动关闭。

---

## 2. 与 AI Agent 协同修复的最佳实践

推荐采用**“本地一键拉取高优看板 ➔ 勾选/批注裁决 ➔ AI Agent 闭环修复”**的极简链路：

```mermaid
sequenceDiagram
    autonumber
    actor Dev as 开发者
    participant Local as 本地终端
    participant File as packages/pr-review/reviews/pr-XX-round-N.md
    participant Agent as 本地 AI Agent
    participant GH as GitHub (CI)

    Local->>GH: 运行 pnpm pr-review pull (下载并过滤最新 Review 产物)
    Local->>File: 自动生成多轮独立看板 (按轮次持久化存储，只留最近 10 轮)
    Dev->>File: 打开 Markdown 快速打勾 [x] 并留下一两句批注
    Dev->>Agent: 发送指令："根据 packages/pr-review/reviews/pr-XX-round-N.md 修复勾选的 Issue"
    Agent->>Agent: 本地读源码、执行修复并跑通本地测试
    Agent->>Local: 修复完成并规范提交
    Dev->>GH: git push 并在本地运行 pnpm pr-review trigger
    GH->>GH: 触发增量 Review，自动 Resolve 已修复的讨论！
```

### 协同步骤：

1. **本地一键拉取最新轮次看板**：

   ```bash
   pnpm pr-review pull
   ```

   - 自动匹配当前分支关联 PR 的最新已完成 CI 产物；
   - 产物输出至 `packages/pr-review/reviews/pr-<PR编号>-round-<轮次>.md`；
   - 自动触发清理机制：整目录只保留最近 10 轮看板，多余历史看板自动剔除；
   - 智能比对上一轮状态，展示 `✨ 上一轮已成功解决` 清单，继承历史人工批注。
   - 高中危默认勾选采纳（`- [x]`），低优常规建议完整保留但默认忽略（`- [ ]`，支持手动打勾修复）；上一轮的忽略 / 修复意向会被继承。

2. **快速裁决与人工批注**：
   - 打开对应轮次的 markdown 看板；
   - 高危 / 中危保持默认采纳；如有预期设计或需忽略，取消勾选或在批注说明；
   - 低优建议按需勾选；
   - 批注要求直接在 `人工批注 / 修改要求` 输入自然语言。

3. **委托 AI Agent 闭环修复**：
   - 发送指令：
     > “请根据 `packages/pr-review/reviews/pr-<PR编号>-round-<轮次>.md` 执行代码修复：对标记修复的项执行修复，勾选忽略或留有批注的遵照批注处置，完成后运行本地测试。”

4. **一键提交并触发增量复查**：

   ```bash
   # 规范提交并推送到远端特性分支
   git push origin <branch>

   # 本地一键向 PR 发送 /review 请求（免开浏览器网页）
   pnpm pr-review trigger
   ```
