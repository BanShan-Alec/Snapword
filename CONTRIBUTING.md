# 项目贡献与工程规范指南 (Engineering Standards)

本文档只写环境里查不到的判据、原因和坑。能直接查到的以环境为准，例如：

- 有哪些命令 → 根 `package.json` 的 `scripts`（如 `build:win`、`test:e2e`）
- 校验规则是什么 → `.config/`（如 `.config/biome.json`、`.config/commitlint.config.ts`）

全局红线与任务路由见 [AGENTS.md](AGENTS.md)，包级规则入口见对应 `packages/*/AGENTS.md`；专项细则以这些入口明确链接的文档为真源。

---

## 一、代码风格与工具链 (Biome + Vite 8)

校验规则真源：[`.config/biome.json`](.config/biome.json)，提交时自动执行。

- **桶文件**：只做重导出的 `index.ts` 禁止新增（Biome 硬拦截）。组件目录里的 `Xxx/index.tsx` 是组件本体，不算桶文件；确实需要桶时，走评审 + 单条 override 豁免 + 显式命名导出。
- **构建期转换**（需要自己写转译 / 插件时）：只用 Vite 8 / Rolldown / Oxc 原生 API，不引 esbuild / babel。

## 二、提交与 PR

- **Commit**：Conventional Commits，subject 必须含简体中文；规则真源 [`.config/commitlint.config.ts`](.config/commitlint.config.ts)。提交时 pre-commit（lint-staged + Biome）与 commit-msg（commitlint）自动校验，失败即中断。
- **PR**：所有改动经 PR 合入 `main`（squash-only，required checks 任一失败即阻断）。`main` 上每个提交对应一个完整 PR——回滚以功能为单位，CHANGELOG 按 PR 生成。PR 标题就是 release 条目，写成一句用户能看懂的话；一个 PR 只做一件事。
- **门禁与发版**：见 [.github/CICD.md](.github/CICD.md)；PR 操作统一用 `pnpm pr-review <cmd>`（用法见 `.agents/skills/pr-review/SKILL.md`）。

## 三、配置与依赖归属

新加配置文件或依赖时，按顺序判断放哪：

**配置文件**

1. 工具要求固定位置（tsc 要根 `tsconfig.json`、pnpm 要 `pnpm-workspace.yaml`、husky 要 `.husky/`）→ 放它要求的位置。根目录只允许这些固定项：`package.json`、`tsconfig.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`.npmrc`、`.nvmrc`、`.env` / `.env.example`、`.gitignore`、`.gitattributes`、`.editorconfig`、`.husky/`。其它配置不许放根。
2. 配置有明确归属包 → 跟着代码进包。例：只服务主进程的工具，配置进 `packages/main/`，生成/校验命令收敛为该包的 `scripts`。
3. 服务全仓、不属于任何包的工具 → 配置放 `.config/`，依赖放根 `devDependencies`（Biome、Vitest、Playwright、commitlint、changelogen）。

**依赖**

1. 运行时要从 `node_modules` 加载的 → 该包 `dependencies`（例：`electron-updater`）。
2. 故意打进 bundle、运行时不需要外部加载的纯 JS 库 → 该包 `devDependencies`（例：`electron-log`、`electron-store`、`zod`）。判断依据是「打包后运行时要不要从 `node_modules` 解析」，不是「代码里 import 了没有」。
3. 跨包的工具依赖 → 根 `devDependencies`；根 `dependencies` 只允许 `@app/main`。
4. 版本：多个包共用、或必须保持同版本的框架族（React 全家桶）→ 写进 `pnpm-workspace.yaml` 的 `catalog:`；只有一个包用 → 包内写死。

## 四、pnpm 运行时机制

- pnpm 12 起，非 auth/registry 的设置只从 `pnpm-workspace.yaml` 读（`.npmrc` 只剩 registry）；构建审批、`minimumReleaseAge` 等机制以该文件内联注释为准。
- **electron 镜像**：写在根 `postinstall` 的 `ELECTRON_MIRROR` 里；不要写进 `package.json` 的 `config.electron_mirror`，也不要放 `.npmrc`。

## 五、Node 脚本与构建配置

- 脚本与构建配置统一 ESM（`import` / `export`）：`scripts/*.ts`、`build/*.ts`、各包 `vite.config.ts`。
- 仓库根一律用 `build/lib/repo-paths.ts` 的 `findRepoRoot()` 推导，不要用 `process.cwd()`；环境变量统一用 `build/lib/env.ts` 的 `loadRepoEnv()`，不要各自调 `loadEnv`。

## 六、文档同步纪律（架构规约与代码同源）

各包 `AGENTS.md` 是包级规则入口，也是包级架构与日常规则的唯一真源；明确链接的专项文档承载限定范围的细则。规则不得「写着 A、做着 B」：

- 新增 / 删除目录、模块、导出、脚本或依赖时，同一 PR 内更新对应包 `AGENTS.md`；
- 包级 `README.md` 只承载高层定位与导航索引，不要复制 `AGENTS.md` 或其指向的专项文档中的规则细节；
- 规范表述与代码现实冲突时，先改文档使其可执行，再评估是否值得改代码；
- **会变事实只写一处**：实际命令以 `package.json` 为准，校验规则以 `.config/` 为准；规范性门禁、平台范围与版本事实只在 CONTRIBUTING、根 / 包级 `AGENTS.md` 或其明确链接的专项文档中维护一次，其它文档只写指针。
