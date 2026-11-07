# @app/docs AGENTS.md — 文档站架构与执行规则

> 全局红线见 [根 AGENTS.md](../../AGENTS.md)。本文件为 `@app/docs` 规则唯一真源。

## 1. 站点架构与非显式约定

Vocs 2 纯静态站（`full-static`），部署于 GitHub Pages（前缀 `/electron-react-monorepo-template/`）。常规目录结构见文件树，此处仅记录**环境查不到的隐形陷阱与单一真源**：

| 文件 / 路径                  | 角色与规则                 | 隐形陷阱 / 机器门禁                                                                       |
| :--------------------------- | :------------------------- | :---------------------------------------------------------------------------------------- |
| `src/navigation.ts`          | 侧栏与首页目录**唯一真源** | 漏登记则页面线上不可达；有且只能有一条对应 `link`                                         |
| `vocs.config.ts`             | 静态构建配置               | `iconUrl` 必须手动自带 `/electron-react-monorepo-template/` 前缀                          |
| `scripts/vocs-windows-fix.*` | Win32 路径转义补丁         | Windows 本地 `dev`/`build` 必须经 `node --import` 预加载（上游 wevm/vocs#674 修复前勿删） |
| `src/pages.gen.ts` / `dist/` | 构建派生临时产物           | 严禁手改、严禁提交入库（Git 门禁）                                                        |

- **唯一门禁命令**：`pnpm docs:build`（退出码 0 为通过）。Markdown 不受 Biome 拦截，死链与 MDX 语法全由此把关。
- **本地预览**：`pnpm docs:dev`（端口 5174）。

## 2. 页面规范

### 1. 元信息（Frontmatter & TL;DR）

- `title`：形如「中文名（English-tag）」，英文标签供按技术栈切片检索。
- `description`：一句话结论，同时注入 `llms.txt`、搜索索引与卡片 meta。
- 正文首行 `# <title>` 与 frontmatter 严格一致，紧随 `> **TL;DR**：<一句话结论>`。

### 2. 页面骨架：极简速查清单三段式

全站页面（**唯一例外：`src/pages/index.mdx` 自定义首页，不套用三段式**）按阅读量控制篇幅：

- **解法 / 机制页**：正文 40–90 行（不含代码块与 mermaid）。
- **规范 / 清单页**：正文 40–120 行。
- **总量软上限**：200 行；每页代码块 ≤3。

````md
---

title: <中文名>（<English-tag>）
description: <一句话结论，与 TL;DR 一致>
---

# <与 title 一致>

> **TL;DR**：<技术选型核心取舍与解决痛点>

## 1. 选型理由

<阐述为什么选型该方案、痛点与架构动因，直切核心不写空话>

## 2. 核心机制

### <机制/配置模块名>

→ 源码：[packages/.../file.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/.../file.ts)
```ts
// 真实源码摘录，严禁凭记忆臆造
```

## 3. 桌面端避坑注意事项

<!-- 包含事故表现与方案对比时优先三列表格（避坑要点｜事故表现与原因｜本仓库对齐方案）；规则陈述用加粗列表 -->
````

- **桌面端约束准则（Desktop-Specific Only）**：严禁搬运第三方库（React / Wouter / Zustand / Ant Design 等）的基础 API 或通用入门教程；选型理由与避坑要点必须紧扣 Electron 桌面端特殊约束（如 `file://` 协议路由、跨进程 IPC 吞吐、ASAR 物理隔离、后台常驻 CPU 保护、原生窗口生命周期等）。
- **机制图与代码块**：机制 / 流程 / 状态页在 §2 节首放一张 mermaid 图（`flowchart` / `sequenceDiagram` / `stateDiagram-v2`），图下最多 2–3 个完整代码块；代码块必须起于声明边界，节选必须标「节选」，每块 3 行内给 `→ 源码` 链接，单块不超过约 60 行。
- **单一真源直链**：每个核心代码块必须紧邻对应的 GitHub `blob/main/<path>` 直链，严禁伪造路径或断言指标。
- **链接纪律**：站内链接一律写根相对路径 `/dimension/slug`（严禁尾斜杠、严禁 `.md` 后缀、严禁 `file:///...` 本地路径，CI `docs` 门禁会直接阻断死链）。
- **标题迁移**：新页统一 `## 2. 核心机制`；存量 `## 2. 核心配置与实现` 页面待迁移。

## 3. 新增 / 修改页面 SOP

1. **写正文**：遵循 §2 三段式骨架与单一真源直链，新页面采用 `.md`。
2. **登记导航**：在 `src/navigation.ts` 的 `SIDEBAR_GROUPS` 登记路由（完成判据：`SIDEBAR_GROUPS` 恰好有一条 `link`）。
3. **改路径处理**：若移动或重命名页面，同一 commit 内同步更新 `navigation.ts` 与所有入站引用。
4. **本地验证**：运行 `pnpm docs:build`（完成判据：退出码为 0，且 `dist/public/<dimension>/<slug>/index.html` 成功生成）。
5. **合流发布**：CI `docs` job 机械阻断构建错误与死链；合并进 `main` 自动触发 GitHub Pages 部署。

## 4. Anti-Patterns（避坑清单）

- **未登记导航** — 新页落盘却未加入 `navigation.ts`，导致侧栏与首页均不可见（无机器拦截，靠 SOP 判据）。
- **死链与非法路径** — 站内链接包含 basePath、尾斜杠、`.md` 后缀或 `file:///...` 本地路径，触发构建死链拦截。
- **凭记忆重写代码** — 脱离仓库真实源码，臆造不存在的 schema/模块或修改测试指标。
- **规则硬拷贝** — 把根 AGENTS.md 规则抄进文档页，造成过期与认知漂移；只解释动机，规则留指针。
- **通用知识搬运** — 抄写第三方库基础 API 用法或通用教程，脱离 Electron 桌面端特殊约束导致水文膨胀。
- **篇幅膨胀** — 堆砌长篇理论推演脱离 1-2 屏速查定位，降低人机检索效率。
- **提交构建产物** — 误将 `src/pages.gen.ts` 或 `dist/` 提交入库。
