---

title: AI 评审闭环（Open-code-review）
description: PR 自动化审查流水线，置顶单一看板治理评论刷屏，配合本地 CLI 驱动拉取与一键合并。
---

# AI 评审闭环（Open-code-review）

> **TL;DR**：告别 AI 评论在 PR 中的无序刷屏。通过 GitHub Actions 钉版集成 `open-code-review`，配置置顶看板（`sticky_summary`）与旧线程自动解决（`resolve_outdated`）。本地配套 `pnpm pr-review` CLI 命令集，实现“拉取审查 -> 针对修复 -> 门禁全绿一键合并”的高效工程闭环。

## 1. 选型理由

- **治理 PR 评论刷屏**：AI 审查每次改动若重复在行内发表全量评论，几轮下来 PR 评论量破百，重要人工讨论被彻底淹没。
- **动态清理已过时意见**：代码根据建议修复并 push 新提交后，CI 必须自动将对应的旧 review threads 标为已解决（Resolved）。
- **本地开发者闭环体验**：无需频繁在网页与终端间切换，通过本地专属 CLI 工具链一站式查询审查看板、查看状态和安全合并。

## 2. 核心机制

### GitHub Actions 审查与评论治理配置

→ 源码：[.github/workflows/open-code-review.yml](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.github/workflows/open-code-review.yml)

```yaml
name: OpenCodeReview

on:
  pull_request:
    types: [opened, reopened, ready_for_review]
  issue_comment:
    types: [created] # 支持评论 /review 或 /ocr 重新触发

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: write # 自动 resolve 旧线程需要 contents 写权限
      pull-requests: write # 发表 review 评论
      issues: write
    steps:
      - uses: actions/checkout@v4

      # 关键步骤：统一 PR 元信息（从 issue_comment 评论事件中反查 PR base/head）
      - name: Resolve PR Info
        id: pr_info
        uses: actions/github-script@v7
        with:
          script: |
            if (context.eventName === 'issue_comment') {
              const { data: pr } = await github.rest.pulls.get({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: context.issue.number,
              });
              core.setOutput('base_ref', pr.base.ref);
              core.setOutput('head_sha', pr.head.sha);
              core.setOutput('pr_number', pr.number);
            } else {
              core.setOutput('base_ref', context.payload.pull_request.base.ref);
              core.setOutput('head_sha', context.payload.pull_request.head.sha);
              core.setOutput('pr_number', context.payload.pull_request.number);
            }

      - uses: alibaba/open-code-review@v1.13.3
        with:
          pr_number: ${{ steps.pr_info.outputs.pr_number }}
          base_ref: ${{ steps.pr_info.outputs.base_ref }}
          head_sha: ${{ steps.pr_info.outputs.head_sha }}
          # 核心评论治理参数
          checkpoint_range: "true" # 记录检查点，仅对最新 push 增量审查
          sticky_summary: "true" # 置顶单一看板并原地更新，彻底杜绝刷屏
          resolve_outdated: "true" # 代码修复后，自动 resolve 对应的旧 review threads
          route_severity_below: "" # 关闭向 Summary 倾倒 Low 建议，保持看板精简
          language: "Chinese" # 评审输出统一为中文
          review_concurrency: "4" # 压低并发避免触发大模型供应商 429 限流
```

### 本地 PR 审查工具链（CLI 常用命令表）

→ 工具包：`@app/pr-review`

| 命令                     | 核心功能与作用                                                  | 典型使用场景                     |
| :----------------------- | :-------------------------------------------------------------- | :------------------------------- |
| `pnpm pr-review create`  | 自动根据当前分支第一个提交生成 PR 标题与结构化正文并提交        | 本地开发完毕，一键发起 PR        |
| `pnpm pr-review pull`    | 自动下载 Actions 审查产物并转化为本地可勾选的 Markdown 任务清单 | 拉取 AI 评审建议并在本地对照修改 |
| `pnpm pr-review trigger` | 往 PR 发表 `/review` 评论，触发 GitHub Actions 重新审查         | 代码修改推送到远端后发起复查     |
| `pnpm pr-review status`  | 检查 PR 的 5 大 CI 门禁状态与 Review 决议                       | 确认当前 PR 是否达到合入标准     |
| `pnpm pr-review merge`   | 严格校验 5 项 Required Checks 全部绿色通过后执行安全合并        | 门禁全绿，一键合入主分支         |

## 3. 桌面端避坑注意事项

| 避坑要点                    | 事故表现与原因                                                                                        | 本仓库对齐方案                                                                                    |
| :-------------------------- | :---------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **LLM 供应商 429 限流**     | AI 审查对 PR 中每个变动文件并发发起大模型调用，触发 API 频率上限导致 Review 中断或返回 Partial 结果。 | 工作流显式设置 `review_concurrency: '4'`，平滑削峰留出频率余量。                                  |
| **CI 自动关闭线程权限不足** | 开启 `resolve_outdated: 'true'` 但未配置写权限，GitHub Actions 抛出 HTTP 403 异常。                   | 工作流顶部必须显式授予 `permissions: contents: write`。                                           |
| **门禁未绿强行合入**        | 开发者在单元测试或 E2E 尚未跑完时手动合并 PR，导致破坏性改动流入 main 分支。                          | `pnpm pr-review merge` 内部硬编码状态机，严格轮询直至 5 个 Required Checks 全部通过方放行合并。   |
| **重复触发竞态冲突**        | 连续快速评论 `/review` 启动多个审查 Job，互相覆盖 Summary 评论。                                      | 配置 `concurrency: group: ocr-${{ pr_number }}, cancel-in-progress: true`，新任务自动取消旧任务。 |
