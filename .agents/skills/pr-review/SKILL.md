---

name: pr-review
description: 项目专用的 Pull Request 生命周期与 OpenCodeReview (OCR) 自动化评审工作流。当用户提到“创建PR”、“提PR”、“开PR”、“拉取review/评审结果”、“触发review/复查”、“按review建议修改/修复问题”、“合并PR”、“查看PR状态”时，必须严格使用此 Skill 中定义的 `pnpm pr-review <command>` 系列命令，严禁使用散装脚本或自行猜测 gh 命令。
---

# PR Review 自动化工作流指南

本 Skill 收敛了当前项目的 Pull Request 全生命周期管理，以及与 GitHub Actions `alibaba/open-code-review` (OCR) 的增量审查与本地闭环修复 SOP。

> [!IMPORTANT]
> **绝对准则**：在当前项目中执行 PR 创建、拉取审查、触发审查或合并操作时，**必须统一调用 `pnpm pr-review <command>`**，切勿自行使用原生 `gh` 命令散装拼凑或猜测逻辑。

---

## 一、命令速查表

在项目根目录下通过 `pnpm pr-review <command>` 调用：

| 用户意图             | 对应命令                 | 替代简写                | 详细操作与行为                                                                                                                              |
| :------------------- | :----------------------- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **创建 PR**          | `pnpm pr-review create`  | `pnpm pr-review pr`     | 前置校验工作区是否干净、推送当前分支、基于 `.github/PULL_REQUEST_TEMPLATE.md` 模板自动填充提交信息并开 PR                                   |
| **查看状态**         | `pnpm pr-review status`  | -                       | 查看当前仓库关联 PR 及所有 checks/CI 门禁状态                                                                                               |
| **拉取 Review 结果** | `pnpm pr-review pull`    | -                       | 从 Actions 产物拉取最新 Review 结果，前置嵌入 `CI Checks 整体状态`，在 `packages/pr-review/reviews/` 下生成 `pr-<PR>-round-<N>.md` 独立看板 |
| **触发增量复查**     | `pnpm pr-review trigger` | `pnpm pr-review review` | 在当前 PR 讨论区自动发送 `/review` 评论，触发 OpenCodeReview 增量扫描                                                                       |
| **安全合并 PR**      | `pnpm pr-review merge`   | -                       | 自动轮询等待所有必选 checks 全绿，确认后执行 squash 合并并清理远端分支                                                                      |

---

## 二、标准交互与执行流程 (SOP)

### 阶段 1：创建 PR

当用户指示“给当前分支创建 PR”或“提 PR”：
1. 运行 `pnpm pr-review create`；
2. 输出生成的 PR 链接及状态；
3. 提示用户：首次开 PR 时 GitHub Actions 会自动触发第一轮全量代码审查。

---

### 阶段 2：拉取 Review 结果

当用户指示“拉取 review 结果”、“拉取评审”或“查看 review”：
1. **执行拉取**：运行 `pnpm pr-review pull`；
2. **确认产物路径**：产物将落盘在 `packages/pr-review/reviews/pr-<PR编号>-round-<轮次>.md`；
3. **输出汇总简报**：
   - 提取看板顶部的 `🚦 CI Checks 整体状态` 表格；
   - 简要汇报缺陷统计：高危 (Critical/High)、中危 (Medium)、低优 (Low) 数量；
   - 告知用户可在编辑器打开该 `.md` 看板进行审阅打勾 `[x]` 或批注。

---

### 阶段 3：按 Review 建议修改代码 (AI Agent 闭环修复)

当用户指示“审阅完毕，按建议修改”、“修复 review 问题”或“根据 pr-XX-round-N.md 修复”：
1. **读取看板**：使用 `view_file` 读取最新的 `packages/pr-review/reviews/pr-<PR>-round-<轮次>.md`；
2. **判断用户处置意向**：
   - 包含 `- [x] **采纳修复**` 且**未勾选** `- [x] **忽略本项**`：**必须执行修复**；
   - 勾选了 `- [x] **忽略本项**`：**跳过**；
   - 存在 `> **人工批注 / 修改要求**` 且非默认模板文字：**严格遵照用户填写的批注要求处理**；
   - ⚠️ **防御 LLM 幻觉**：若评审建议声称某个第三方库 API 更名（例如声称 wouter v3 废弃 Redirect 更名为 Navigate），必须先在本地 `node_modules` 或源码中核实，切勿盲从幻觉建议导致编译报错。
3. **精准代码修改**：使用 `replace_file_content` 针对性修复源码。
4. **本地流水线全量验证**：

   ```bash
   pnpm format
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

   必须确保 Biome 代码检查、TypeScript 类型检查 (`tsc -b --noEmit`) 以及 Vitest 单元测试全部 100% 通过。
5. **规范提交与推送**：

   ```bash
   git add <修改的相关文件>
   git commit -m "fix(review): <简明修复摘要>"
   git push origin <当前分支名>
   ```
6. **触发下一轮增量复查**：
   运行 `pnpm pr-review trigger`。
   通知用户：已自动推送并向 PR 发送 `/review` 触发复查，约 2~3 分钟后可再次执行 `pnpm pr-review pull` 获取新轮次看板。

---

### 阶段 4：合并 PR

当所有轮次评审与 checks 均通过，用户要求“合并 PR”：
1. 运行 `pnpm pr-review merge`；
2. 脚本会自动校验门禁并在合并后提示本地分支清理命令。
