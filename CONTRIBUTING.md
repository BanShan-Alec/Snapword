# 项目贡献与工程规范指南 (Engineering Standards)

本文档是**工程底座与协作工作流的披露参考**：只写环境里查不到的判据、原因与坑；查得到的以 `package.json` scripts、`.config/`、目录布局为准，本文不复述。全局红线与任务路由见 [AGENTS.md](AGENTS.md)，各包规则真源在包级 `AGENTS.md`。

---

## 一、代码风格与工具链 (Biome + Vite 8)

真源：[`.config/biome.json`](.config/biome.json)，pre-commit 自动执行。

- **桶文件例外流程**：组件目录内的本体实现 `Xxx/index.tsx`（一组件一文件夹，内部含真实实现）不是桶文件；确需新增重导出桶时，走评审 + 单条 override 豁免 + 显式命名导出。
- **构建期转换一律走 Vite 8 / Rolldown / Oxc 原生 API**：单文件转译用 `transformWithOxc`（注意不打包 import），需打包时用程序化 `build()`（`configFile:false` + `write:false`）内存产出；现有实现见 [`packages/renderer/plugins/startup/`](packages/renderer/plugins/startup/)。

## 二、提交与 PR

- **Commit 格式**：Conventional Commits，subject 必含简体中文；真源 [`.config/commitlint.config.ts`](.config/commitlint.config.ts)。提交时 pre-commit（lint-staged + Biome）与 commit-msg（commitlint）两道钩子自动校验，失败即中断。
- **PR 闭环**：feature 分支一律经 PR 合入 `main`（squash-only，required checks 任一失败即阻断）。`main` 上每个提交对应一个完整 PR——回滚粒度为一个功能，CHANGELOG 按 PR 逐条生成。PR 标题即 release 条目：写成用户可理解的一句话，一个 PR 只做一件事。
- **门禁清单与发布**：见 [.github/CICD.md](.github/CICD.md)；PR 操作经 `pnpm pr-review <cmd>`（用法见 `.agents/skills/pr-review/SKILL.md`）。

## 三、配置与依赖归属（所有权原则）

**新配置文件的放置判定（按序执行，前者优先）**：

1. **机制强制**：工具只能从约定路径发现配置时，放它要求的位置，并在此备案。根目录仅允许以下"机制强制"项（新增须走评审）：`package.json`、`tsconfig.json`（tsc solution 入口）、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`.npmrc`、`.nvmrc`、`.env` / `.env.example`（`build/lib/env.ts` 统一加载）、`.gitignore`、`.gitattributes`、`.editorconfig`、`.husky/`（钩子目录）。**清单外的根级配置一律拒绝**。
2. **有归属包**：配置随消费方进包。判例：Drizzle 迁移生成归属 `@app/main`——`drizzle.config.ts` 与 `drizzle/` 迁移产物都在 `packages/main/`，命令收敛为 `pnpm --filter @app/main db:generate`。
3. **跨包编排工具**：无单一归属包、服务全仓的工具（Biome / Vitest / Playwright / commitlint / changelogen）→ 配置进 `.config/`，依赖进根 `devDependencies`。

**依赖归属判定（按序执行）**：

1. **包的运行时依赖 → 该包 `dependencies`**：进入 Vite `external`，打包后从 `node_modules` 运行时解析（判例：`drizzle-orm`、`electron-updater`）。
2. **刻意内联进 bundle 的纯 JS 依赖 → 该包 `devDependencies`**：经 `ssr.noExternal` 内联，运行时零外部依赖。判断标准是「是否需要运行时从 node_modules 解析」，不是「代码里有没有 import」——放错会改变打包产物的解析方式（判例：`electron-log`、`electron-store`）。
3. **跨包编排工具 → 根 `devDependencies`**；根 `dependencies` 永远只有 `@app/main`。
4. **版本口径**：≥2 包共享或必须版本联动的框架族（React 全家桶）→ `pnpm-workspace.yaml` 的 `catalog:`；单包工具 → 包内显式 pin；`rc` 版本必须精确锁（`1.0.0-rc.5`，不带 `^`）。

> 教训：`drizzle.config.ts` 曾放在根目录并连带 `drizzle-kit` 进根 devDeps（2026-11-09 已收编回 `packages/main/`）。机制不强制时，根目录不是默认位置。

## 四、pnpm 运行时机制

- **pnpm 12 起，非 auth/registry 设置只从 `pnpm-workspace.yaml` 读取**（`.npmrc` 只剩 registry）；构建脚本审批（`allowBuilds`）、`minimumReleaseAge` 等机制的含义以该文件内联注释为准。
- **electron 镜像只能写在根 `postinstall` 的 `ELECTRON_MIRROR` 里**：`@electron/get` 的查找顺序把 npm 注入的 `npm_config_electron_mirror` 排在调用方显式 URL 之前；若写成 `package.json` 的 `config.electron_mirror`，electron-builder 打包期经 `@electron/get` 拉取的辅助包也会被改道到 electron 镜像，直接 404；同理别挪进 `.npmrc`。

## 五、Node 脚本与构建配置

- **ESM-only**：`scripts/*.ts`、`build/*.ts`、各包 `vite.config.ts` 统一 `import` / `export`。
- **路径唯一入口**：仓库根一律经 `build/lib/repo-paths.ts` 的 `findRepoRoot()` 推导，严禁 `process.cwd()`；环境变量统一经 `build/lib/env.ts` 的 `loadRepoEnv()`，不得各自调用 `loadEnv`。

## 六、文档同步纪律（架构规约与代码同源）

各包 `AGENTS.md` 是该包规则唯一真源，不允许「写着 A、做着 B」：

- 新增 / 删除目录、模块、导出、脚本或依赖时，同一 PR 内同步更新对应包 `AGENTS.md`；
- 包级 `README.md` 只承载高层定位与导航索引，禁止反向复制 `AGENTS.md` 规则细节；
- 规范表述与代码现实冲突时，先改文档使其可执行，再评估是否值得改代码；
- **会变事实只写一处**：门禁项、命令、平台范围、版本示例等随代码演进的事实，仅在 CONTRIBUTING（或对应包 `AGENTS.md`）保留唯一真源；其余文档只写指针、不复述细节（2026-11-09 修正 5 处模板时代过时断言即为实例）。
