---

title: 使用此模板（Use-this-template）
description: 把模板转为自己项目的七组原子任务，可整页交给 AI 协作者执行，每组只给目标与可复制的完成判据。
---

# 使用此模板（Use-this-template）

> **TL;DR**：Use this template / Fork 之后、写第一行业务之前，按 §2 七组任务完成「转为己有」。每组只给目标与判据，挂载点由执行者自行搜索确认；可整页交给 AI 协作者执行，人只验收判据。

## 1. 执行时机与前置条件

- **何时执行**：GitHub「Use this template」/ Fork / Clone 之后、写第一行业务之前。此时挂载点全是模板默认形态，改造成本最低。
- **边界**：把仓库跑起来见 [快速上手（Getting Started）](/introduction/getting-started)；`name` / `appId` / `productName` 的逐项含义见 [配置项归属](/dx/configuration-map)。演示域（counter / calculator）与能力演示卡随业务需要自行删改，不属本页范围。
- **执行方式**：整页投喂 AI 协作者逐任务执行，或人工照做；判据为可复制命令或明确的人工验收项，逐条通过后再进入下一任务。

## 2. 核心机制

### 任务 1：身份与仓库坐标改名

全仓身份由根 `package.json` 单一真源解析（`build/lib/app-identity.ts` 消费），改这六处即贯通 electron-builder 发布坐标、主进程 GitHub 坐标与窗口标题：

→ 源码：[package.json](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/package.json)
```jsonc
{
  "name": "electron-react-monorepo-template", // [!code --]
  "productName": "Electron React Template", // [!code --]
  "appId": "com.template.electron-react-monorepo", // [!code --]
  "description": "Type-safe Electron monorepo template powered by Vite, React and ContextBridge IPC", // [!code --]
  "author": {
    "name": "BanShan-Alec", // [!code --]
    "email": "627649674@qq.com" // [!code --]
  },
  "repository": {
    "url": "https://github.com/BanShan-Alec/electron-react-monorepo-template.git" // [!code --]
  }
}
```

- **判据**：`pnpm verify:prebuild` 绿（`name` 的小写规约由该门禁校验）；`productName` 与 `appId` 是发布身份，对外发版后不可再改。

### 任务 2：品牌资源替换

替换安装器 / 窗口图标、界面 logo 家族与 favicon，保持安装器、Header、首屏三处视觉一致。

- **判据**：`pnpm build:unpack` 产物窗口、任务栏、安装器图标正确，界面 logo 无变形。

### 任务 3：剥离文档站

`packages/docs` 是本模板的自述载体，与业务无关：删掉整包及其在仓库内的全部引用（内嵌文档 Tab、CI 的 docs job、站点常量都在内）。删完在 GitHub 分支保护里移除 `docs` required check——否则之后每个 PR 都会停在 Pending。

- **判据**：`pnpm docs:build` 报命令不存在为预期；`pnpm typecheck && pnpm lint && pnpm test` 绿。

### 任务 4：pr-review 工具链（默认保留）

默认保留、零改码：`create` / `status` / `merge` 依赖 `gh` 登录即可用；要启用 AI 自动评审，在仓库 Settings → Secrets and variables → Actions 配 `OCR_LLM_URL` / `OCR_LLM_TOKEN` / `OCR_LLM_MODEL` 三枚密钥。不打算用就删 `.github/workflows/open-code-review.yml` 一个文件（留着不配 secrets，每个 PR 都会挂一个红叉）。

- **注意**：评审只在 PR opened / reopened / ready_for_review 时触发，后续 push 不会自动复查，需 `pnpm pr-review trigger`；`AI Code Review` 保持非 required。
- **判据**：新开一个 PR 后 `AI Code Review` 正常跑完（或 workflow 已删），`pnpm pr-review status` 能列出 PR 与 checks。

### 任务 5：重写根 README

模板 README 讲的是模板自己（徽章、文档站入口、解法地图、演示截图）：整体重写为你的产品 README——它是什么、怎么跑、怎么贡献。

- **判据**：人工验收，重写后不再描述模板自身。

### 任务 6：版本史清零

删 `CHANGELOG.md`，删除全部 `v*` tag（本地与远端）与 GitHub Releases，按 [发版流水线（Changelogen）](/delivery/release-pipeline) 从首个版本重新起步。

- **判据**：新 tag 推送后 GitHub Release 正常生成，三平台产物齐全。

### 任务 7：收尾门禁

七组任务做完后跑一次总验收，兜住跨任务连坐——删包后 lockfile 未重生成、被删对象的外部引用、残留的模板坐标：

```bash
pnpm install   # 重生成 lockfile；CI 用 --frozen-lockfile
grep -rin "banshan-alec\|electron-react-monorepo-template\|packages/docs" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
```

- **判据**：上面 grep 零命中；`pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm verify:prebuild` 全绿；推送后 CI 全绿。

## 3. 桌面端避坑注意事项

- **`productName` 决定 `userData` 路径**：改动后旧版本的持久化数据与日志不会自动迁移，用户会表现为「设置全丢」。确需变更时在主进程显式 `app.setPath('userData', ...)`，详见 [配置项归属](/dx/configuration-map)。
