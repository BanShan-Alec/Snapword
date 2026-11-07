# 项目贡献与工程规范指南 (Engineering Standards)

本项目采用严格的现代工程规范与自动化工具链，保障代码质量、提交历史一致性与版本发布的可靠性。

全局架构红线与任务路由见 [AGENTS.md](AGENTS.md)；各包内部业务规则以各包目录下的 `AGENTS.md` 为唯一真源。本文档作为**工程底座与协作工作流的披露参考（Disclosed Reference）**，阐明自动化机制、避坑原因与执行 SOP。

---

## 一、代码风格与静态检查规范 (Biome)

本项目使用 **[Biome](https://biomejs.dev/)** 作为统一的代码格式化器与静态检查器（Formatter & Linter），单二进制极速运行，替代繁重的 ESLint + Prettier。

### 1. 核心约定与真源

代码格式化与 Lint 规则的唯一真源为 [`.config/biome.json`](.config/biome.json)，由 pre-commit 钩子自动执行。

- **全仓多格式纳管**：Biome 统一负责 JS/TS/JSX、JSON/JSONC 以及全仓 Markdown（`.md`）与 YAML（`.yml`/`.yaml`）资产的格式化与校验，严禁在仓库内引入 Prettier 或 ESLint 依赖。
- **桶文件禁令（Barrel Files Ban）**：全库默认禁止只做重导出的桶文件（`index.ts` / `index.module.ts`），由 Biome `performance.noBarrelFile: "error"` 与配套 `noReExportAll` / `noImportCycles` 硬拦截。跨模块一律直达具体文件导入。
  - **例外澄清**：组件目录内的本体实现 `Xxx/index.tsx`（一组件一文件夹形态，内部包含真实组件实现）**不是桶文件**，不受此限。
  - 确需引入桶文件的合法流程：评审 + 单条 override 豁免 + 显式命名导出 + 台账登记。

### 2. 常用开发指令

```bash
# 检查全仓代码风格与静态规则
pnpm lint

# 自动修复所有可修复的格式与 Lint 问题
pnpm lint:fix

# 仅执行全局代码格式化
pnpm format
```

### 3. 构建工具链时代规则（Vite 8 / Rolldown / Oxc）

本仓已进入 Vite 8（rolldown 内核）时代：**新增构建期转换、插件与编译能力一律使用 Vite 8 / Rolldown / Oxc 原生 API**，禁止引入 esbuild、babel 等旧工具链依赖。存量 `@rolldown/plugin-babel` 仅限 lingui 既有用途，不扩用。选型参照 ADR-0002（启动壳构建期内联决策）：单文件转译用 `transformWithOxc`（注意不打包 import），需打包时用程序化 `build()`（`configFile:false` + `write:false`）内存产出。

---

## 二、Git Commit 提交规范 (Conventional Commits)

本项目遵循 **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/)** 规范，并通过 **Commitlint** 与 **Husky** 在本地提交时进行自动化硬校验。

### 1. 提交格式与硬性约束

```text
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

规则细节以 [`.config/commitlint.config.ts`](.config/commitlint.config.ts) 为唯一真源：

- **Subject 强制包含简体中文**：`description`（Subject 部分）**必须包含简体中文**，杜绝使用英文或无意义拼音敷衍，否则会被 Commitlint 钩子硬拦截。
- **全小写 Type**：`type` 必须全小写（如 `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `revert`）。
- **标点与空格**：冒号 `:` 后必须紧跟一个英文空格。
- **示例**：
  - `feat: 增加文件选择原生对话框`
  - `fix(ipc): 修复外部链接协议未校验的安全隐患`

### 2. PR 工作流（`pnpm pr-review`）

feature 分支一律经 PR 合入 `main`：分支保护锁死五个 required checks（typecheck / lint / test / e2e / docs）与 squash-only、拒绝直推。使 `main` 上每个提交都对应一个完整 PR——历史可回溯、回滚粒度为一个功能、CHANGELOG 也能按 PR 逐条生成。完整流程见 [.github/CICD.md](.github/CICD.md) 与 [packages/pr-review/README.md](packages/pr-review/README.md)。

| 命令                    | 用途                                                      |
| :---------------------- | :-------------------------------------------------------- |
| `pnpm pr-review create` | 前置检查 → push → 开 PR（标题取分支首个提交，正文读模板） |
| `pnpm pr-review merge`  | 等门禁全绿 → squash 合并 → 删远端分支                     |
| `pnpm pr-review status` | 当前仓库 PR 与 checks 概览                                |

PR 标题沿用 Conventional Commits 格式（squash 后即 main 提交信息、直接沉淀进 CHANGELOG），分支首个提交的 subject 请按此措辞。由于 GitHub Release 正文直接由合并的 PR 列表生成，标题需表述为用户可理解的一句话；一个 PR 只做一件事，严禁混入无关改动。

---

## 三、Git 自动化工作流 (Husky + lint-staged)

代码提交时将自动触发两道质量守卫：

1. **Pre-commit 钩子 (`.husky/pre-commit`)**：
   - 触发 `lint-staged`，对本次暂存区（Git Staged）的文件（涵盖代码、JSON、Markdown 与 YAML）运行 `biome check --write --no-errors-on-unmatched`。
   - 自动格式化被修改的文件，若存在无法自动修复的语法/Lint 报错则中断提交。
2. **Commit-msg 钩子 (`.husky/commit-msg`)**：
   - 触发 `commitlint` 检验提交信息：必须符合 Conventional Commits 规范且**必须包含简体中文说明**。

---

## 四、版本号与 CHANGELOG 自动化管理 (changelogen)

本项目采用 **[changelogen](https://github.com/unjs/changelogen)** 自动化解析 Git 提交记录、智能推导版本演进并生成变更日志。

### 1. 常用版本管理指令

```bash
# 1. 预览即将生成的 CHANGELOG（不修改任何文件）
pnpm changelog

# 2. 自动根据 Commit 历史推导语义化版本（feat 触发 minor，fix 触发 patch），
#    并自动更新 package.json、生成 CHANGELOG.md、执行 git commit 以及创建 git tag
pnpm release

# 3. 显式指定版本步长进行 Release：
pnpm release:patch   # 补丁升级（如 3.1.0 -> 3.1.1）
pnpm release:minor   # 次版本升级（如 3.1.0 -> 3.2.0）
pnpm release:major   # 主版本升级（如 3.1.0 -> 4.0.0）
```

### 2. 发布流程规范（PR 化 SOP）

main 受分支保护禁直推，发版走 PR 形态：

1. 从 main 切 `chore/release-vX.Y.Z` 分支；确认 lint / typecheck 为 0 错误后运行 Release 命令（如 `pnpm release:minor`，生成版本号与 CHANGELOG 提交）；
2. `pnpm pr-review create` 开 PR；**删除分支上的本地 tag**（`git tag -d vX.Y.Z`，squash 合并会改变提交 SHA，旧 tag 作废）；
3. PR 合并后在 main 上重新打 tag 并推送：

   ```bash
   git pull && git tag vX.Y.Z && git push origin vX.Y.Z
   ```
4. GitHub Actions 将监听推送到远端的版本 Tag（如 `v1.1.0`），自动构建 Windows、macOS 与 Linux 原生安装包并发布到 GitHub Releases。

### 3. GitHub Release 正文机制

Release 正文首行是 CHANGELOG 导航链接，其余由 GitHub 按本版合并的 PR 自动生成（`generate_release_notes`）；标题为 `<productName> <tag>`，productName 读根 `package.json`（与安装包、快捷方式名同源）。

- **PR 标题就是 release 条目**：写成清晰的一句话，这是正文质量唯一的杠杆。
- **破坏性变更**：PR 标题加 `!`，迁移步骤写进 PR 正文。
- **CHANGELOG 仍是完整档案**：release 页列出 PR 清单；逐条细粒度变更以 `CHANGELOG.md` 为准。
- **不分组**：GitHub 分类依赖 PR label；本仓不引入 label，列表为单组。
- **不回填**：历史 release 保持原样，新规范从当前版开始生效。

---

## 五、工程配置与构建基础设施收拢 (.config/ 与 build/)

为保持项目根目录极致清爽，配置与构建资产收拢存放：

- **`.config/`**：收拢 Lint、测试与版本发布工具链配置（[`.config/biome.json`](.config/biome.json)、[`.config/commitlint.config.ts`](.config/commitlint.config.ts)、[`.config/changelog.config.ts`](.config/changelog.config.ts)、[`.config/vitest.config.ts`](.config/vitest.config.ts)、[`.config/playwright.config.ts`](.config/playwright.config.ts)）。
- **`build/`**：Electron 打包配置 [`build/electron-builder.ts`](build/electron-builder.ts) 与应用图标、entitlements 等原生资源（[`build/resources/`](build/resources)）。
- **`build/lib/`**：可复用构建期基础设施库（安全纯函数模块，禁止顶层副作用、不启动子进程）：
  - [`build/lib/app-identity.ts`](build/lib/app-identity.ts)：应用身份与 OTA 仓库坐标解析（从根 `package.json` 读取）。
  - [`build/lib/env.ts`](build/lib/env.ts)：构建期环境变量统一加载器（外部注入优先于 `.env`）。
  - [`build/lib/repo-paths.ts`](build/lib/repo-paths.ts)：仓库根目录与产物目录唯一解析器（严禁使用 `process.cwd()`）。
  - [`build/lib/sentry-options.ts`](build/lib/sentry-options.ts)：Sentry 构建期参数与 DSN 注入器。

---

## 六、依赖管理与安装规范 (pnpm Workspace)

本项目为 pnpm 12 monorepo（`packageManager: pnpm@12.15.0`），子包位于 `packages/{main,preload,renderer,shared,tsconfig}`，`pnpm-workspace.yaml` 统一收敛跨包共享依赖版本（`catalog:`）与全部非 auth/registry 设置（`nodeLinker` / `allowBuilds` 等；v12 起 `.npmrc` 只读 registry 与 auth），依赖实体统一落在根 `node_modules/.pnpm`。以下命令均在**根目录**执行。

### 1. 常用命令速查

| 场景                        | 命令                               |
| :-------------------------- | :--------------------------------- |
| 全量安装 / 同步 lockfile    | `pnpm install`                     |
| 根 package.json 加 dev 依赖 | `pnpm add -Dw <包名>`              |
| 根 package.json 加生产依赖  | `pnpm add -w <包名>`               |
| 指定子包装依赖              | `pnpm -F @app/renderer add <包名>` |
| 写死版本、不走 catalog      | `pnpm add -Dw <包名>@<版本>`       |

### 2. 常用缩写与安装位置规则

`-w`（`--workspace-root`，装到 workspace 根）、`-D`（`--save-dev`）、`-P`（`--save-prod`，默认）、`-E`（`--save-exact`，锁精确版本）、`-O`（`--save-optional`）、`-F`（`--filter`，指定子包，如 `-F @app/renderer`）、`-r`（`--recursive`）。

`pnpm add` 默认写入**当前目录所属**的 `package.json`：装到根统一加 `-w`，装到子包统一 `pnpm -F <包名> add`，无需 cd 进子包。

### 3. catalog 版本收敛

安装的包命中 `pnpm-workspace.yaml` 的 `catalog:`（如 `typescript` / `vite` / `zod` / `react` / `@types/react` / `tailwindcss`）时，`pnpm add` 自动使用 `catalog:` 协议，真实版本收敛到 workspace 根。需在 `package.json` 写死版本、不跟随 catalog 时，指定与 catalog 不同的版本即可：

```bash
pnpm add -Dw zod@4.7.1
```

### 4. 升级与卸载

```bash
pnpm up -wri                       # 交互式升级（-w 根，-r 递归，-i 交互）
pnpm up -w zod@latest              # 升级指定包
pnpm -F @app/main up electron-log  # 子包升级
pnpm remove -w <包名>             # 卸载（-F 同理卸载子包依赖）
pnpm -F @app/renderer remove <包名>
```

### 5. pnpm 12 构建审批与缓存设置机制

- **构建脚本审批**：`strictDepBuilds` 默认开启，未列入 `allowBuilds` 且带构建脚本的依赖会直接让安装失败（`ERR_PNPM_IGNORED_BUILDS`）——故意快速失败，避免重演「electron 二进制静默缺失」。处置 SOP：`pnpm ignored-builds` 查看全部待审批包 → `pnpm approve-builds <包名>` 审批，决策自动写入 `pnpm-workspace.yaml` 的 `allowBuilds`。
- **electron 二进制兜底**：electron 42+ 起 npm 包无 install 生命周期脚本，二进制惰性下载——全新工作区装完不带 dist，`require('electron')` 直接报错。根 `postinstall` 用 `cross-env ELECTRON_MIRROR=… install-electron` 在每次安装后调用官方安装器（内部自带版本/dist 判定：就绪时约 100ms 空转，缺失时命中机器级 zip 缓存约 2 秒）；二进制损坏或 electron 升级后同样自动重装。CI 侧由 setup-env 的 `actions/cache` 预热三平台 electron 缓存目录，e2e job 另留一步显式安装作保险冗余。国内镜像就写在这个 postinstall 命令里（npmmirror，开箱即走），**只作用于这一次二进制安装**：`@electron/get` 的镜像查找顺序把 npm 注入的 `npm_package_config_electron_mirror` / `npm_config_electron_mirror` 排在调用方显式 URL 之前，所以镜像绝不能写成根 `package.json` 的 `config.electron_mirror`——那会让 electron-builder 打 macOS DMG 时把 dmgbuild 辅助包也改写到 electron 镜像路径下，直接 404；同理也别挪进 `.npmrc`。换源改 postinstall 这一处即可。
- **minimumReleaseAge: 1440**：发布不满 24 小时的依赖禁止安装（供应链投毒防护）。确需安装全新冠名版本时，用 `minimumReleaseAgeExclude` 按包临时豁免，不要全局关闭。

---

## 七、Node 脚本与构建配置规范 (ESM + 仓库根路径唯一入口)

全仓脚本与构建配置统一使用 ESM（`import` / `export`），不再维护 CommonJS 写法：

### 1. 运行环境与模块标准划分

| 目录与文件                                                                                                     | 模块标准                           | 规范要求与说明                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| :------------------------------------------------------------------------------------------------------------- | :--------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node 脚本与构建配置**<br>`scripts/*.ts`<br>`build/*.ts`<br>`packages/{main,preload,renderer}/vite.config.ts` | **原生 ESM** (`import` / `export`) | • 统一使用 `import` 引入依赖，禁止 `require` / `module.exports`。<br>• 仓库根目录一律经 `build/lib/repo-paths.ts` 的 `findRepoRoot()` 解析，严禁 `process.cwd()` 推导相对路径。<br>• 环境变量统一经 `build/lib/env.ts` 的 `loadRepoEnv()` 加载，不得各自调用 `loadEnv`。<br>• `__dirname` / `import.meta.dirname` 由配置加载器（Vite / electron-builder / tsx）提供，就地使用，不写兼容垫片。<br>• TypeScript 类型引入使用零运行时的 `import type { ... } from '...'`。 |
| **纯前端渲染进程**<br>`packages/renderer/`（含 `vite.config.ts`）                                              | **原生 ESM** (`import` / `export`) | • `packages/renderer/package.json` 显式声明 `"type": "module"`，完整支持 Vite 与 React 前端生态。<br>• 可直接 `import` `build/` 下的构建期模块（均为 ESM）。                                                                                                                                                                                                                                                                                                            |

### 2. TypeScript 隔离配置

`scripts/tsconfig.json` 配置了 `"moduleDetection": "force"`，确保即使未显式声明顶层 `export` 的脚本也能在 TypeScript 中保持独立的模块作用域，杜绝跨文件全局变量污染（如全局 `const fs` 冲突）。

---

## 八、文档同步纪律（架构规约与代码同源）

各包的 `AGENTS.md` 是该包的架构契约与规则唯一真源，与代码同源维护，不允许长期处于“写着 A、做着 B”的状态：

- 新增 / 删除目录、模块、导出、脚本或依赖时，必须在同一 PR 内同步更新对应包的 `AGENTS.md`（目录分层、架构铁律与开发范式）；
- 新增跨端业务领域（新 IPC 域、新契约类型）时，严格遵循全栈 SOP，同步更新 `packages/shared/AGENTS.md` 的契约速览与 `packages/main/AGENTS.md` 的骨架模板；
- 包级 `README.md` 仅承载高层定位与导航索引，严禁反向复制 `AGENTS.md` 的规则细节造成双重事实源；
- 规范类表述（铁律 / 禁令）与代码现实冲突时，先改文档使其可执行，再评估是否值得改代码；
- 根 `README.md` 特性区的每条论断以源码为准，行为变更后同步核对。
