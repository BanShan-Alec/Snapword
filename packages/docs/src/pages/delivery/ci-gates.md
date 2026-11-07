---

title: CI 并行门禁（GitHub-Actions）
description: 5 大核心工作流并行校验，结合打包前置依赖与命名静态拦截，全绿方可合并。
---

# CI 并行门禁（GitHub-Actions）

> **TL;DR**：质量把控绝不依赖人肉。GitHub Actions 并行触发 5 大必绿门禁（`typecheck`、`lint`、`test`、`e2e`、`docs`）。其中 `lint` 阶段顺带执行 `verify:prebuild` 在 0ms 阶段拦截非法根依赖、命名违规与未授权样式，全方位守护主分支稳定。

## 1. 选型理由

- **并行化与高吞吐**：5 个 Job 完全解耦并行运行，耗时控制在最慢的 E2E 步骤以内（~5-8 分钟），无需串行排队。
- **分支保护硬性门禁（Required Checks）**：所有 5 个 Job 在 GitHub 仓库设置中均被列为保护分支的必要通过项，任何一项挂起或翻红均无法合并代码。
- **前置 0ms 拦截（Fail Fast）**：在跑昂贵的编译和打包之前，通过轻量级 Node 脚本立即验证工程命名规范、根依赖纯洁度与设计 Token 约束。

## 2. 核心机制

### GitHub Actions 5 路并行工作流

→ 源码：[.github/workflows/ci.yml](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.github/workflows/ci.yml)

```yaml
name: CI

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true # 自动取消旧提交的运行

jobs:
  typecheck:
    name: typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-env
      - run: pnpm run typecheck

  lint:
    name: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-env
      - run: pnpm run lint
      - run: pnpm run verify:prebuild # 前置静态依赖、命名与样式门禁
      - run: pnpm run i18n:check # 词条缺失校验

  test:
    name: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-env
      - run: pnpm run test

  e2e:
    name: e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-env
      - run: pnpm exec install-electron # 确保预下载无头二进制
      - run: pnpm run build # 必须先产出各包构建物
      - run: pnpm run test:e2e

  docs:
    name: docs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-env
      - run: pnpm --filter @app/docs run build # Vocs 静态构建与全站死链检查
```

### 打包前静态拦截脚本（verify:prebuild）

→ 源码：[scripts/verify-prebuild.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/verify-prebuild.ts)

```ts
// 门禁 1：校验根 package.json 的 name 是否符合小写中划线规则（防发布 404）
const nameRegex = /^[a-z0-9-_]+$/;
if (!nameRegex.test(rootPkg.name)) {
  errors.push(`根 package.json 的 name (${rootPkg.name}) 必须由小写字母、数字或连字符组成`);
}

// 门禁 2：校验根目录依赖是否严格保持纯净（防打包体积异常膨胀）
const rootDeps = Object.keys(rootPkg.dependencies || {});
const allowedRootDeps = ['@app/main'];
const illegalRootDeps = rootDeps.filter((dep) => !allowedRootDeps.includes(dep));
if (illegalRootDeps.length > 0) {
  errors.push(
    `根 package.json 的 dependencies 只能包含 @app/main，检测到非法依赖: ${illegalRootDeps.join(', ')}`,
  );
}

// 门禁 3：渲染层样式与 Token 静态扫描（禁止硬编码未经授权的 hex 颜色与离阶字号）
// 校验 rules: verifyStyleConventions(rendererDir, errors);
```

## 3. 桌面端避坑注意事项

| 避坑要点                      | 事故表现与原因                                                                               | 本仓库对齐方案                                                                                                    |
| :---------------------------- | :------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Linux E2E 缺少二进制挂起**  | Electron 42+ 改为惰性下载机制，在 CI 无缓存时直接启动 Playwright 会报错找不到二进制。        | 在 `e2e` Job 中显式执行 `pnpm exec install-electron`，通过镜像源预热二进制。                                      |
| **未构建即跑 E2E 报入口缺失** | `electron.launch` 依赖 `packages/main/dist/index.cjs` 等产物，漏跑 build 导致 E2E 启动失败。 | `e2e` Job 必须在前置步骤显式执行 `pnpm run build`。                                                               |
| **Vocs 文档死链漏检**         | 文档站内部跳错锚点或缺少页面，在开发态热更新时不报错，发布后出现 404。                       | `docs` Job 将 `pnpm --filter @app/docs run build` 设为分支必过门禁，Vocs 全静态编译时只要发现一处死链即构建失败。 |
| **并发任务堆积浪费 Runner**   | 频繁连续 push 代码导致 GitHub Actions Runner 队列被旧 commit 占满。                          | 启用 `concurrency: cancel-in-progress: true`，同一 PR 只要有新 push 立即取消旧任务。                              |
