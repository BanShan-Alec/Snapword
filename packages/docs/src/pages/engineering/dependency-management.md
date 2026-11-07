---

title: 依赖管理（Monorepo）
description: pnpm workspace + catalog 收拢版本，根依赖硬性白名单由 CI 门禁拦截，严格隔离打包体积。
---

# 依赖管理（Monorepo）

> **TL;DR**：公共依赖统一声明在 `pnpm-workspace.yaml` 的 `catalog:`；根目录 `dependencies` 仅允许 `@app/main`，违规安装直接中断构建；Electron 二进制由 `postinstall` 惰性按需拉取。

## 1. 选型理由

在多包 Electron 工程中，依赖管理往往引发三大灾难：
1. **版本漂移**：各包独立声明 TypeScript、Vite、Zod 版本，升级时逐个搜索替换，极易造成局部版本不兼容。
2. **打包体积失控**：开发者顺手在根目录安装运行时库，打包工具（如 electron-builder）默认递归收集根目录依赖，导致未使用的依赖被全量打包进 `app.asar`。
3. **供应链构建风险与幻影依赖**：第三方依赖的安装脚本可能存在隐蔽风险；而扁平化依赖结构允许代码悄悄 `import` 未声明的次级依赖。

## 2. 核心机制

### pnpm workspace 与依赖版本收拢

→ 源码：[pnpm-workspace.yaml](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/pnpm-workspace.yaml)

```yaml
packages:
  - "packages/*"

catalog:
  typescript: ^6.0.0
  vite: ^8.3.5
  zod: ^4.5.4
  react: ^19.3.1
  react-dom: ^19.3.1
  "@types/react": ^19.2.14
  "@types/react-dom": ^19.2.3
  "@types/node": ^24.19.2
  vitest: ^5.1.0
  tailwindcss: ^4.3.4

nodeLinker: isolated
autoInstallPeers: true
publicHoistPattern:
  - "@node-usb/*"
  - "*usb*"

allowBuilds:
  "@sentry/cli": true
  "electron-winstaller": true
  esbuild: true
```

各包在引用公共工具链与跨包核心库（如 TypeScript、React 生态、TailwindCSS 等）时，版本号直接使用 `"catalog:"`，版本升级仅需修改 `pnpm-workspace.yaml` 一处。

### 根目录依赖硬性白名单门禁（单一真源）

为防止根目录被随意塞入运行时依赖污染最终安装包，项目设置了预打包静态校验：

→ 源码：[scripts/verify-prebuild.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/verify-prebuild.ts)

```ts
// 根目录 package.json dependencies 边界校验（防退化门禁）
const rootDeps = Object.keys(rootPkg.dependencies || {});
const allowedRootDeps = ['@app/main'];

const illegalRootDeps = rootDeps.filter((dep) => !allowedRootDeps.includes(dep));
if (illegalRootDeps.length > 0) {
  console.error(
    `[verify:prebuild] 根目录 package.json 存在非法生产依赖: ${illegalRootDeps.join(', ')}`,
  );
  console.error('[verify:prebuild] 生产依赖只能声明在对应子包中，根目录仅允许包含 @app/main');
  process.exit(1);
}
```

### Electron 预编译二进制惰性下载与镜像隔离

自 Electron 42+ 起，npm 包不再自带 postinstall 下载脚本，全新 clone 项目若缺失二进制会导致本地 `require('electron')` 抛错。仓库在根目录声明安全的惰性拉取：

→ 源码：[package.json](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/package.json)

```json
"scripts": {
  "postinstall": "cross-env ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ install-electron"
}
```

## 3. 桌面端避坑注意事项

- **新依赖安装归属规则**：
  - **主进程纯 JS 工具库**：如无需运行时特殊查找，使用 `pnpm --filter @app/main add -D <pkg>`，打包时直接内联进 `index.cjs`。
  - **主进程外部运行依赖 / 原生模块**：如需运行时 `require`（例如 `usb`），声明在 `packages/main` 的 `dependencies`，并在 `packages/main/vite.config.ts` 的 `rolldownOptions.external` 声明外置。
  - **渲染层前端库**：按常规前端项目使用 `pnpm --filter @app/renderer add <pkg>`，由 Vite 单独完成打包。
- **镜像环境变量切勿注入全局 `.npmrc`**：
  - 不要把 `ELECTRON_MIRROR` 写进 `.npmrc` 或系统环境变量。`@electron/get` 会优先读取该变量，在打包 macOS DMG 时连带劫持辅助工具（如 `dmgbuild`），导致下载请求指向错误的 Electron 镜像目录而引发 404 崩溃。
- **Native 原生模块提升**：
  - 若使用包含 `.node` 二进制文件的库（如 `@node-usb`），必须在 `pnpm-workspace.yaml` 的 `publicHoistPattern` 中显式放行提升，否则打包工具无法正确拷贝原生动态库。
