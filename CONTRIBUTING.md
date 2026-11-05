# 项目贡献与工程规范指南 (Engineering Standards)

本项目采用严格的现代工程规范，通过自动化工具链保障代码质量、提交历史一致性与版本发布的规范性。

> 🤖 **AI 协作者入口**：先读 [AGENTS.md](AGENTS.md)（全局红线 + 包规则索引 + 任务路由），再按需查阅本文件对应章节。本文件是人类向全局规范；包级规则的唯一真源在各包 `AGENTS.md`。

---

## 一、代码风格与静态检查规范 (Biome)

本项目使用 **[Biome](https://biomejs.dev/)** 作为统一的代码格式化器与静态检查器（Formatter & Linter），单二进制极速运行，替代繁重的 ESLint + Prettier。

### 1. 核心格式约定

- **缩进**：2 个空格（Space）
- **单行宽度**：100 字符
- **引号风格**：JS/TS 统一使用单引号（`single`），JSX 属性使用双引号（`double`）
- **语句结尾**：强制显式分号（`semicolons: "always"`）
- **尾随逗号**：多行自动补充（`trailingCommas: "all"`）
- **Import 组织**：自动按依赖类型与字典序整理导入顺序
- **全仓多格式纳管**：Biome 2.6+ 统一负责 JS/TS/JSX、JSON/JSONC 以及全仓 Markdown（`.md`）与 YAML（`.yml`/`.yaml`）资产的格式化与校验，无需额外引入 Prettier

### 2. 常用开发指令

```bash
# 检查整个项目的代码风格与规范
pnpm lint

# 自动修复所有可修复的格式与 Lint 问题
pnpm lint:fix

# 仅执行全局代码格式化
pnpm format
```

### 3. 桶文件禁令（Barrel Files Ban）

本仓库**默认禁止桶文件**（只做重导出的 `index.ts` / `index.module.ts`），由 Biome `performance.noBarrelFile: "error"` 全库强制，不设白名单；配套 `noReExportAll` / `noImportCycles` 同为 error。跨模块一律直达具体文件导入。

**例外澄清**：组件的 `Xxx/index.tsx`（一组件一文件夹形态，index 内是组件本体实现，见 [packages/renderer/AGENTS.md](packages/renderer/AGENTS.md) §5）**不是桶文件**，不受本条约束；`noBarrelFile` 针对的仅是"只做重导出"的 index。

确需引入桶文件的唯一合法流程：评审 + 单条 override 豁免 + 显式命名导出 + 台账登记。

> 包内落地形态与例外（组件 `Xxx/index.tsx`、shared 子路径直出）见各包 AGENTS.md，如 [packages/renderer/AGENTS.md](packages/renderer/AGENTS.md)；全局红线见 [AGENTS.md](AGENTS.md)。

### 4. 请求 Hook 约束（manual-only）

渲染层异步数据请求一律使用 `useManualRequest`（ahooks `useRequest` 的 manual-only 封装），**一切自动触发能力一律禁止**。完整规则（manual-only 铁律、三层强制、触发点写法）已下沉至 [packages/renderer/AGENTS.md](packages/renderer/AGENTS.md)「请求层」，以该文件为唯一真源。

### 5. 构建工具链时代规则（Vite 8 / Rolldown / Oxc）

本仓已进入 Vite 8（rolldown 内核）时代：**新增构建期转换、插件与编译能力一律使用 Vite 8 / Rolldown / Oxc 原生 API**，禁止引入 esbuild、babel 等旧工具链依赖。存量 `@rolldown/plugin-babel` 仅限 lingui 既有用途，不扩用。单文件转译用 `transformWithOxc`（注意不打包 import），需打包时用程序化 `build()`（`configFile:false` + `write:false`）内存产出。

---

## 二、Git Commit 提交规范 (Conventional Commits)

本项目遵循国际通用的 **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/)** 规范，并通过 **Commitlint** 与 **Husky** 在本地提交时进行自动化硬校验。

### 1. 提交信息结构

```text
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

### 2. 允许的 Type 类型与中文示例

| Type       | 说明                                          | 示例                                                   |
| :--------- | :-------------------------------------------- | :----------------------------------------------------- |
| `feat`     | 新增功能 / 新特性                             | `feat(router): 增加系统托盘与原生交互能力`             |
| `fix`      | 修复缺陷或 Bug                                | `fix(window): 解决应用启动时的白屏闪烁问题`            |
| `refactor` | 重构（既不新增功能，也不修复 Bug 的代码变动） | `refactor(scripts): 将启动与打包脚本迁移至 TypeScript` |
| `perf`     | 性能提升与优化                                | `perf(renderer): 优化翻译卡片的渲染性能`               |
| `style`    | 不影响代码逻辑的样式/格式变动                 | `style: 依据 Biome 规范调整代码格式`                   |
| `docs`     | 仅文档变动                                    | `docs: 完善项目规范与版本发布指南`                     |
| `test`     | 增加或修改测试用例                            | `test: 增加取词服务的单元测试`                         |
| `build`    | 构建系统、打包配置或外部依赖变动              | `build: 升级 electron-builder 构建配置`                |
| `ci`       | CI/CD 持续集成配置变更                        | `ci: 优化 GitHub Actions 缓存机制`                     |
| `chore`    | 日常维护、辅助工具或杂项                      | `chore: 接入 changelogen 自动化版本管理`               |
| `revert`   | 回滚先前的提交                                | `revert: 回滚提交 32cb089`                             |

### 3. 硬性要求

- **提交说明强制使用简体中文**：`description`（Subject 部分）**必须包含简体中文**，杜绝使用英文或无意义拼音敷衍，否则会被 Commitlint 钩子硬拦截；
- `type` 必须全小写；
- 冒号 `:` 后面必须有一个英文空格；
- 示例：`feat: 增加文件选择原生对话框` 或 `fix(ipc): 修复外部链接协议未校验的安全隐患`。

### 4. PR 工作流（`pnpm pr-review`）

feature 分支一律经 PR 合入 `main`：分支保护锁死四个 required checks（typecheck / lint / test / e2e）与 squash-only、拒绝直推。这样定的原因是让 `main` 上每个提交都对应一个完整 PR——历史可回溯、回滚粒度是一个功能、changelog 也能按 PR 逐条生成。完整流程见 [.github/CICD.md](.github/CICD.md) 与 [packages/pr-review/README.md](packages/pr-review/README.md)。

| 命令                    | 用途                                                      |
| :---------------------- | :-------------------------------------------------------- |
| `pnpm pr-review create` | 前置检查 → push → 开 PR（标题取分支首个提交，正文读模板） |
| `pnpm pr-review merge`  | 等门禁全绿 → squash 合并 → 删远端分支                     |
| `pnpm pr-review status` | 当前仓库 PR 与 checks 概览                                |

PR 标题沿用本节 Conventional Commits 格式（squash 后即 main 提交信息、进 changelog），分支首个提交的 subject 请按此措辞。由于 changelog 按 PR 逐条生成、GitHub Release 正文直接取自 changelog，标题请写成用户能看懂的一句话；一个 PR 只做一件事，避免「顺便」混入无关改动。

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

本项目采用 **[changelogen](https://github.com/unjs/changelogen)** 自动化解析 Git 提交记录、智能推导版本演进并生成美观的变更日志。

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

### 2. 发布流程规范（PR 化）

main 受分支保护禁直推，发版走 PR 形态：

1. 从 main 切 `chore/release-vX.Y.Z` 分支；确认 lint / typecheck 为 0 错误后运行 Release 命令（如 `pnpm release:minor`，生成版本号与 CHANGELOG 提交）；
2. `pnpm pr-review create` 开发版 PR；**删除分支上的本地 tag**（`git tag -d vX.Y.Z`，squash 合并会改变提交 SHA，旧 tag 作废）；
3. PR 合并后在 main 上重新打 tag 并推送：

   ```bash
   git pull && git tag vX.Y.Z && git push origin vX.Y.Z
   ```
4. GitHub Actions 将监听推送到远端的版本 Tag（如 `v1.1.0`），自动构建 Windows 安装包并发布到 GitHub Releases。

### 3. GitHub Release 正文

Release 正文由 GitHub 按本版合并的 PR 自动生成（`generate_release_notes`），标题为 `<productName> <tag>`，productName 读根 `package.json`（与安装包、快捷方式名同源）。

- **PR 标题就是 release 条目**：写成用户能看懂的一句话（见 §二.4），这是正文质量唯一的杠杆。
- **破坏性变更**：PR 标题加 `!`，迁移步骤写进 PR 正文——release 页只显示标题，细节靠条目里的 PR 链接。
- **CHANGELOG 仍是完整档案**：release 页只列 PR；逐条变更与破坏性标记以 `CHANGELOG.md` 为准。
- **不分组**：GitHub 的分类依赖 PR label；本仓不使用 label，因此列表是单组。需要分组时先补 label 策略，再加 `.github/release.yml`。
- **不回填**：历史 release 保持原样，新规范从下一版开始。

---

## 五、工程配置文件收拢规范 (.config/ 与 build/)

为保持项目根目录极致清爽，工具链配置与构建资产按职责收拢存放。

`.config/` —— Lint、测试与版本发布工具链配置：
- [`.config/biome.json`](.config/biome.json)：Biome 代码格式化与 Lint 校验规则
- [`.config/commitlint.config.ts`](.config/commitlint.config.ts)：Conventional Commits 校验与简体中文要求插件
- [`.config/changelog.config.ts`](.config/changelog.config.ts)：changelogen 变更日志分类映射与版本推导配置
- [`.config/vitest.config.ts`](.config/vitest.config.ts)：单元测试与基准测试配置（别名从 `packages/tsconfig/base.json` 派生）
- [`.config/playwright.config.ts`](.config/playwright.config.ts)：Electron E2E 配置

`build/` —— 声明式打包配置与资产：
- [`build/electron-builder.ts`](build/electron-builder.ts)：Electron 生产环境打包配置与过滤规则（无顶层副作用）
- [`build/resources/`](build/resources)：打包资源（应用图标、签名 entitlements 等），经 `extraResources` 复制进安装包

`build/lib/` —— 可复用构建期库（可安全 import，不启动子进程、不读写产物）：
- [`build/lib/app-identity.ts`](build/lib/app-identity.ts)：应用身份与 OTA 仓库坐标唯一解析器（根 `package.json`）
- [`build/lib/env.ts`](build/lib/env.ts)：构建期环境变量统一加载器（外部注入优先于 `.env`）
- [`build/lib/repo-paths.ts`](build/lib/repo-paths.ts)：仓库根目录与产物目录解析（禁止 `process.cwd()`）
- [`build/lib/sentry-options.ts`](build/lib/sentry-options.ts)：Sentry 构建期参数与 DSN 注入器

---

## 六、依赖管理与安装规范 (pnpm Workspace)

本项目为 pnpm 12 monorepo（`packageManager: pnpm@12.15.0`），子包位于 `packages/{main,preload,renderer,shared,pr-review,tsconfig}`，`pnpm-workspace.yaml` 统一收敛跨包共享依赖版本（`catalog:`）与全部非 auth/registry 设置（`nodeLinker` / `allowBuilds` 等；v12 起 `.npmrc` 只读 registry 与 auth），依赖实体统一落在根 `node_modules/.pnpm`。以下命令均在**根目录**执行。

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

`pnpm add` 默认写入**当前目录所属**的 `package.json`：根目录执行即落在根；子包目录下执行则落在该子包。消除歧义——装到根统一加 `-w`，装到子包统一 `pnpm -F <包名> add`，无需 cd 进子包。

### 3. catalog 版本收敛

安装的包命中 `pnpm-workspace.yaml` 的 `catalog:`（如 `typescript` / `vite` / `zod` / `react` / `react-dom` / `@types/react` / `tailwindcss` / `vitest`）时，`pnpm add` 自动使用 `catalog:` 协议，真实版本收敛到 workspace 根。需在 `package.json` 写死版本、不跟随 catalog 时，指定与 catalog 不同的版本即可（catalog 中没有的包自然写成普通 semver 区间）：

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

### 5. pnpm 12 构建审批与缓存设置

- **构建脚本审批**：`strictDepBuilds` 默认开启，未列入 `allowBuilds` 且带构建脚本的依赖会直接让安装失败（`ERR_PNPM_IGNORED_BUILDS`）——这是故意的快速失败，避免重演「electron 二进制静默缺失」。处置：`pnpm ignored-builds` 查看全部待审批包 → `pnpm approve-builds <包名>` 审批，决策写入 `pnpm-workspace.yaml` 的 `allowBuilds`。
- **electron 二进制兜底**：electron 42+ 起 npm 包无 install 生命周期脚本，二进制惰性下载——全新工作区装完不带 dist，`require('electron')` 直接报错。根 `postinstall` 用 `cross-env ELECTRON_MIRROR=… install-electron` 在每次安装后调用官方安装器（内部自带版本/dist 判定：就绪时约 100ms 空转，缺失时命中机器级 zip 缓存约 2 秒）；二进制损坏或 electron 升级后同样自动重装。CI 侧由 setup-env 的 `actions/cache` 预热 electron 缓存目录，e2e job 另留一步显式安装作保险冗余。国内镜像就写在这个 postinstall 命令里（npmmirror，开箱即走），**只作用于这一次二进制安装**：`@electron/get` 的镜像查找顺序把 npm 注入的 `npm_package_config_electron_mirror` / `npm_config_electron_mirror` 排在调用方显式 URL 之前，所以镜像绝不能写成根 `package.json` 的 `config.electron_mirror`——那会让 electron-builder 打包时把辅助包也改写到 electron 镜像路径下，直接 404；同理也别挪进 `.npmrc`。换源改 postinstall 这一处即可。
- **minimumReleaseAge: 1440**：发布不满 24 小时的依赖禁止安装（供应链防护）。确需安装全新冠名版本时，用 `minimumReleaseAgeExclude` 按包临时豁免，不要全局关闭。

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

## 八、文档同步纪律（README 与代码同源）

包级 README 是该包的架构契约文档，与代码同源维护，不允许长期处于“写着 A、做着 B”的状态：

- 新增 / 删除目录、模块、导出、脚本或依赖时，必须在同一 PR 内同步更新对应包的 `README.md`（目录树、exports 片段、命令表、铁律表述）；
- 新增跨端能力（新 IPC 域、新契约类型）时，同步 `packages/shared/README.md` 的契约速览与 `packages/main/README.md` 的 SOP 模板；
- 规范类表述（铁律 / 禁令）与代码现实冲突时，先改文档使其可执行，再评估是否值得改代码；
- 根 `README.md` 特性区的每条论断以源码为准，行为变更后同步核对；`docs/` 下的产品契约（PRD / IPC / DB / 提示词）与实现冲突时，以代码为准并回写文档或 ADR。
