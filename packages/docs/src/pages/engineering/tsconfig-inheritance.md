---

title: 编译配置继承（Tsconfig）
description: "@app/tsconfig 集中管理 base/node/react 三档，各包仅保留 extends 与 include。"
---

# 编译配置继承（Tsconfig）

> **TL;DR**：tsconfig 同样作为 Workspace 内部私有包（`@app/tsconfig`）管理，提供 `base.json`、`node.json`、`react.json` 三档分层模板；全仓路径别名统一指向各包源码目录 `src/*`，修改实时跨包联动。

## 1. 选型理由

Electron Monorepo 在 TypeScript 编译层面天生具备多态性：
- 主进程（Main）与构建脚本运行在 Node.js 运行时，需要最新的 Node 类型与原生语法支持。
- 渲染层（Renderer）运行在浏览器 Chromium 环境，需要 DOM API、React JSX 变换与前端资产扩展。
- 契约层（Shared）必须保持跨环境同构，严禁混入任何特定平台的全局环境声明。

若各包各自写 `tsconfig.json`，不仅数十行 `compilerOptions` 严重冗余，路径别名（paths）稍有不一致就会引发难以定位的跨包解析错误。

## 2. 核心机制

### 三档配置分层体系

→ 源码：[packages/tsconfig/base.json](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/tsconfig/base.json)

- **`base.json`**：声明公共严格模式与集中式路径别名，指向源码路径：
```json
{
  "compilerOptions": {
    "strict": true,
    "isolatedModules": true,
    "moduleResolution": "Bundler",
    "paths": {
      "@app/main/*": ["../main/src/*"],
      "@app/preload/*": ["../preload/src/*"],
      "@app/renderer/*": ["../renderer/src/*"],
      "@app/shared/*": ["../shared/src/*"],
      "@shared/*": ["../shared/src/*"],
      "@/*": ["../renderer/src/*"]
    }
  }
}
```

- **`node.json`**：继承 `base.json`，追加 `"types": ["node", "vite/client"]`，供 `main`、`preload`、`pr-review` 及构建脚本使用。
- **`react.json`**：继承 `base.json`，启用 `"jsx": "react-jsx"`、`"lib": ["DOM", "DOM.Iterable", "ES2023"]`，供 `renderer` 与组件包使用。

### 业务包的极简写法

业务子包的 `tsconfig.json` 无需重复声明别名与严格项，仅需指定继承档次与扫描范围：

→ 源码：[packages/main/tsconfig.json](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/tsconfig.json)

```json
{
  "extends": "@app/tsconfig/node.json",
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*", "vite.config.ts"]
}
```

## 3. 桌面端避坑注意事项

- **别名必须指向源码目录而非产物**：
  - `paths` 别名统一映射至 `../<pkg>/src/*` 而非 `dist/index.cjs`。这使得开发和重构时，对 `@app/shared` 的类型或逻辑变更会立即跨包生效，避免改一行逻辑就要先对 shared 跑一次全量 build。
- **渲染进程的 Node 类型隔离约定**：
  - 虽然 Vite 插件可能在渲染层带来微量环境类型注入，但必须杜绝在 `packages/renderer` 内使用 `import 'node:fs'` 或 `process.cwd()`。渲染进程纯属 Chromium 运行域，任何底层系统能力必须经由 Preload 白名单通道代理。
- **TypeScript `paths` 与 Vite `resolve.alias` 镜像对齐**：
  - 在修改路径别名时，必须保证 Vite 配置中的别名映射与 `base.json` 保持严格对齐，否则将出现「IDE 类型检查通过、但 Vite 打包时报模块未找到」的脱节现象。
