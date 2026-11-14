# Snapword

> 划词即译的 Windows 桌面工具。选中英文 → 点一下 → 译文出现在屏幕上，不切窗口、不打断阅读。

[![CI](https://github.com/BanShan-Alec/Snapword/actions/workflows/ci.yml/badge.svg)](https://github.com/BanShan-Alec/Snapword/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)

**当前状态：P4 工程底座完成（按干净 temp5 基座重新实现），进入 P5 主链路开发。**

产品与交互设计、4 份阻塞契约（架构 / IPC / DB / 提示词）与 UIA 技术验证（D-1 30/30，P95 16.2/24.2ms，Q-6 93.3%，同源 iframe 10/10）均已完成。工程侧已落地：temp5@9077d18 基座（IPC 契约归一化 / Fuses / pr-review 重构 / 冷启动耗时分解 / 卸载清理）、paseo 双主题（token / behavior 注入）、设置页主题与语言切换、WCO 与窗口底色对齐。取词链路、DB、六个业务域按 P5 从零实现（不沿用旧 P4 移植代码，旧实现仅作参考）。

---

## 这是什么

阅读英文资料时，理解一个词或一句话的现行做法是：选中 → 复制 → 切到翻译网站 → 粘贴 → 读 → 切回原窗口 → 找回阅读位置。一次至少 6 个动作、2 次窗口切换，**打断了阅读的连续状态**。

Snapword 把划词链路压到 2 个动作：**选中 → 点圆点**；主窗口翻译页也可手动输入或粘贴文本。

| 能力       | 说明                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| 划词取词   | 通过 Windows UI Automation 读取其他应用的选中文本，**不模拟按键、不碰剪贴板**                                        |
| 单词词典化 | 音标（美式）+ 多义项 + **该词在当前句子中的准确含义**（取所在段落后本地切句）                                        |
| 句子翻译   | 流式输出，分段处理长文，翻译前给出消耗预估                                                                           |
| 代码保护   | 自动识别代码、变量名、命令行、URL，避免被翻译成中文                                                                  |
| 术语表     | 自定义「不译 / 固定译法」，保证技术术语一致                                                                          |
| 生词本     | 一键收藏、搜索、导出 CSV / JSON                                                                                      |
| 朗读       | 系统 TTS 兜底，可选配云 TTS                                                                                          |
| 隐私       | 无服务器、无账号；默认无统计上报，生产构建可选 Sentry 崩溃上报（需显式配置 DSN）；选中内容只发往**你自己配置的**接口 |

## 当前进度

| 阶段           | 状态                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| 产品与交互设计 | ✅ PRD v2.0 三窗口基线（圆点 / 翻译卡片 / 主窗口）+ 交互规格             |
| 技术契约       | ✅ 架构（B-01）、IPC（B-02）、DB schema v2.0（B-03）、提示词（B-04）     |
| UIA 技术验证   | ✅ D-1 30/30、Q-6 93.3%、同源 iframe 10/10；Q-2 / Q-7 / 多屏等明确不支持 |
| P4 工程底座    | ✅ temp5 基座 + paseo 双主题（token/behavior）+ 设置/主题切换 + WCO 配色 |
| P5 主链路      | 🔄 进行中：取词 addon → capture → DB → 翻译 → 三窗口 → 收藏              |
| 安装包 / 发布  | ⬜ 未开始（发版流程见 [.github/CICD.md](.github/CICD.md)）               |

## 仓库架构

```text
snapword/
├── packages/
│   ├── main/          # 主进程：ModuleRunner + Controller/Service + 取词 / DB / 窗口
│   ├── preload/       # 安全桥：apiBridge 封闭暴露面 + invokeTraced 链路追踪
│   ├── renderer/      # 渲染进程：React 19 + Feature 驱动 + 双主题 + LinguiJS
│   ├── shared/        # 跨进程契约层：IPC_CHANNELS / Result<T> / zod schemas
│   ├── pr-review/     # PR 生命周期与 AI 审查看板 CLI
│   └── tsconfig/      # base / node / react 编译配置继承包
├── .agents/           # AI 横切规则与 pr-review skill
├── .config/           # Biome / commitlint / changelogen / Playwright / Vitest
├── .github/           # CI / CodeQL / OpenCodeReview / Release
├── build/             # electron-builder + Sentry 构建配置
├── docs/              # PRD / 交互规格 / 技术契约 / ADR / 研究
├── drizzle/           # Drizzle 迁移（P5 实现 DB 后落盘）
├── e2e/               # Playwright 桌面端 E2E
└── scripts/           # dev / build / verify / contrast-check
```

各业务包的职责、README 与规则文件都在 `packages/<name>/` 下，AI 协作者从根 [AGENTS.md](AGENTS.md) 的任务路由进入。

## 快速开始

| 依赖    | 版本要求                         |
| :------ | :------------------------------- |
| Node.js | >= 24.0.0                        |
| pnpm    | ^12.0.0（仓库锁定 pnpm@12.15.0） |

```bash
pnpm install   # 安装工作区依赖（.npmrc 已内置 npmmirror 镜像加速）
pnpm dev       # 开发模式：Vite DevServer + Electron 双进程热重载
```

| 命令                     | 用途                                                            |
| :----------------------- | :-------------------------------------------------------------- |
| `pnpm dev`               | 开发模式（Vite + Electron 热重载）                              |
| `pnpm preview`           | 生产预览（构建后以生产形态启动；`pnpm start` 为等价别名）       |
| `pnpm build:win`         | Windows 打包（NSIS 安装包 + portable）                          |
| `pnpm build:unpack`      | 仅生成未打包目录，用于验证产物                                  |
| `pnpm test`              | Vitest 单元测试（`pnpm test:pr-review` 单独跑 pr-review 包）    |
| `pnpm test:e2e`          | Playwright 桌面端 E2E                                           |
| `pnpm typecheck`         | TypeScript 全工作区类型检查                                     |
| `pnpm lint` / `lint:fix` | Biome 检查 / 自动修复                                           |
| `pnpm i18n:extract`      | 提取中文词条到 PO 字典（改文案后执行）                          |
| `pnpm i18n:check`        | 校验英译完整性（CI 门禁）                                       |
| `pnpm pr-review <cmd>`   | PR 生命周期：`create` / `status` / `pull` / `trigger` / `merge` |

完整命令清单见根 `package.json` 的 `scripts`。

## 文档

完整文档体系与分层规范见 [docs/README.md](docs/README.md)（含研发玩法与契约先行原则）：

| 分类     | 文档                                                                                                                 | 内容                                                                                                      |
| :------- | :------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| **规格** | [docs/specs/PRD.md](docs/specs/PRD.md)                                                                               | **产品需求文档 v3.0**：背景、取词、三窗口交互摘要（7.4）、引擎、隐私、数据、验收（原 PRD-v2 已收敛）      |
| **规格** | [docs/specs/interaction-spec-v2.md](docs/specs/interaction-spec-v2.md)                                               | **当前交互规格**：交互需求条目 RD/RC/RM/RX（13）、逐帧时序、位置算法、状态机、参数表；验收见 PRD 第十五章 |
| **契约** | [docs/contracts/architecture.md](docs/contracts/architecture.md)                                                     | **B-01 技术架构**：进程拓扑、Native Addon 拆分、线程模型、启动/退出、崩溃恢复、窗口与数据所有权           |
| **契约** | [docs/contracts/ipc-contract.md](docs/contracts/ipc-contract.md)                                                     | **B-02 IPC 契约**：消息目录、字段/单位/DIP 坐标系、错误码、超时/背压                                      |
| **契约** | [docs/contracts/data-model.md](docs/contracts/data-model.md)                                                         | **B-03 数据库 schema v2.0**：Drizzle schema-as-code、软删除/撤销、同步预留、索引、迁移/损坏恢复           |
| **契约** | [docs/contracts/prompt-contract.md](docs/contracts/prompt-contract.md)                                               | **B-04 提示词契约**：两条提示词全文、JSON schema、占位符、重试、模型参数                                  |
| **术语** | [GLOSSARY.md](GLOSSARY.md)                                                                                           | **领域术语表**：划词/取词、三窗口、语境、请求分段、会话历史、翻译引擎等标准用词                           |
| **决策** | [docs/adr/](docs/adr/)                                                                                               | 架构决策记录：PUA 占位符、temperature=0、Drizzle ORM + node:sqlite、Sentry 生产启用                       |
| **视觉** | [packages/renderer/docs/DESIGN.md](packages/renderer/docs/DESIGN.md)                                                 | **视觉规范**：设计令牌、双主题、字号 / 间距、对比度规则                                                   |
| **调研** | [docs/research/immersive-translate-interaction-2026-11.md](docs/research/immersive-translate-interaction-2026-11.md) | 本机沉浸式翻译 1.34.4 的三窗口交互调研：圆点尺寸、卡片布局、拖拽/防误关、参考交互取舍                     |
| **调研** | [docs/research/uia-validation-2026-11.md](docs/research/uia-validation-2026-11.md)                                   | UIA 验证报告：Q-1、D-1（30/30）、Q-6（93.3%）、同源 iframe、坐标空间发现                                  |

## 关键设计决策

这些是设计阶段做过的取舍，都有明确理由，不是随手选的：

| 决策               | 选择                                                           | 理由                                                                                                 |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 取词方式           | **纯 UIA**，取不到就不弹                                       | 不模拟按键（不会被杀软判为键盘记录器）、不读写剪贴板（无污染、无密码泄露风险）                       |
| 是否用模拟复制兜底 | **永久不做**                                                   | 致命问题有两个：无法拦截密码框会导致明文密码外发；终端里 Ctrl+C 是中断信号会杀掉用户正在运行的命令   |
| 取词失败怎么办     | `RangeFromPoint` 取鼠标下的词 → 主窗口翻译页手输               | 两条都不碰剪贴板                                                                                     |
| 触发与呈现         | **圆点 → 翻译卡片 → 主窗口**三层                               | 圆点只做入口，卡片只做这一次翻译，主窗口负责历史/生词本/设置；入口不夺焦                             |
| 译文呈现           | 贴选区的翻译卡片，**出现时不夺取键盘焦点**                     | 卡片在视线附近，可拖拽、防误关；管理动作移到主窗口                                                   |
| 卡片宽度           | 固定 420px（仅屏幕可用空间不足时夹限），仅拖动位置，不可缩放   | 纯自适应会跳动干扰阅读；固定侧边栏又离视线太远                                                       |
| 翻译引擎           | 仅 OpenAI 兼容接口，用户自填 Key                               | 无服务器成本；开源项目不该替用户承担接口费用与合规责任                                               |
| 单词结果           | 全部交给 LLM，但**必须结合所在句子**                           | 用户真正的问题是"这词在这句话里什么意思"，不是"这词有几个意思"                                       |
| 生词本             | 只记主动收藏，不做复习                                         | 翻译工具不该长成背单词软件                                                                           |
| 历史记录           | 仅内存，退出清空                                               | 不在磁盘留下用户的阅读痕迹                                                                           |
| 数据层             | SQLite + **Drizzle ORM** + Node 内置 `node:sqlite`             | schema-as-code 单一事实源、迁移可 review、少一个原生依赖；Electron 42/45 已实测；rc.5 迁移缺陷有规避 |
| 删除与同步         | 软删除 + 墓碑，5 秒撤销；同步用每设备快照 + 按记录 LWW（v1.1） | 撤销真实可恢复；不把 DB 文件放进云盘；无服务器、无账号                                               |
| 协议               | MIT                                                            | 传播最广、企业可用、条款最短                                                                         |

## 已知限制

| 限制                                    | 说明                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| 仅 Windows                              | macOS 的取词实现完全不同，暂不支持                                                   |
| 仅 Chrome / Edge **138+**               | 依赖 Chromium 138 起默认启用的原生 UIA provider；旧版与企业策略回退不做              |
| 全屏应用卡片置顶暂不支持                | 圆点不显示；热键仍可用，但卡片不保证可见；失败时托盘提示并打开主窗口（Q-2 不再验证） |
| 多显示器第二屏暂不支持                  | 仅保证主显示器；第二屏不承诺取词/卡片位置                                            |
| 跨域 iframe 暂不支持                    | 仅同源 iframe 已验证                                                                 |
| 管理员权限窗口暂不支持                  | UIA 跨完整性级别访问未验证                                                           |
| 仅英文 → 简体中文                       | 其他语种不支持                                                                       |
| 不支持 canvas 渲染的页面                | 在线文档、部分在线表格的文本无法通过 UIA 读取，这是硬限制                            |
| 不支持 IDE / 终端 / Office / PDF 阅读器 | 不承诺可用，也不作为缺陷处理                                                         |
| 无代码签名                              | 首次安装会有 SmartScreen 提示，属正常现象                                            |

## 数据与隐私

| 文件/数据                    | 位置                                | 说明                                                    |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------- |
| 生词本 / 术语表 / 可同步设置 | `%APPDATA%\Snapword\vocab.db`       | 明文 SQLite；软删除墓碑用于 5 秒撤销与同步              |
| 配置                         | `%APPDATA%\Snapword\config.json`    | API Key 为 `safeStorage` 密文；设备本地项               |
| 备份                         | `%APPDATA%\Snapword\vocab.db.bak-*` | 迁移前 / 清空全部数据前自动生成；保留最近 3 份          |
| 日志                         | `%APPDATA%\Snapword\logs\`          | 脱敏，保留 7 天                                         |
| 云盘同步（v1.1）             | 用户选择的云盘文件夹                | 每设备一份快照 JSON；明文；**不**把 `vocab.db` 放进云盘 |

数据库不存完整原文段落、API Key、Base URL 或日志正文；导出与同步文件同样不包含这些内容。同步默认不同步语境片段，可在设置中开启。

## 贡献

欢迎 PR。动手前请读 [CONTRIBUTING.md](CONTRIBUTING.md)；提交信息遵循 Conventional Commits，且 subject 必须包含简体中文（commitlint + husky 自动校验）。使用 AI 协作者请先读 [AGENTS.md](AGENTS.md)。文档与代码不一致时以代码为准，并欢迎提 PR 修正。

## License

[MIT](LICENSE)
