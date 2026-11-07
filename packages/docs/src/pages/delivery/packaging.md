---

title: 应用打包（Electron-builder）
description: electron-builder 采用 TypeScript 类型化配置，应用身份全仓收敛，基于依赖白名单自动外置与排除。
---

# 应用打包（Electron-builder）

> **TL;DR**：抛弃脆弱易错的手写 JSON 打包配置，全面采用 TypeScript 编写 `electron-builder` 配置。应用身份从根 `package.json` 单一真源推导，主进程依赖基于清单自动外置，严禁源码映射进入 ASAR，实现三平台标准自动化出包。

## 1. 选型理由

- **类型安全与逻辑复用**：`build/electron-builder.ts` 可直接导入 TypeScript 模块、执行路径运算与共享常量，配置错误在编译期即被拦截。
- **应用身份单一真源**：`appId`、`productName`、版本号与发布仓库坐标统一源自根 `package.json`，杜绝散落在不同文件中的手动复制和版本号漂移。
- **产物寻址强安全保障**：`artifactName` 遵循 `${name}-${version}-${os}-${arch}.${ext}` 命名契约，防止因项目名称带空格导致 GitHub Releases 上传自动转点从而使 `latest.yml` 寻址 404。

## 2. 核心机制

### TypeScript 打包配置与依赖放行

→ 源码：[build/electron-builder.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/build/electron-builder.ts)

```ts
import type { Configuration } from 'electron-builder';
import { APP_IDENTITY } from './lib/app-identity.ts';

const config: Configuration = {
  appId: APP_IDENTITY.appId,
  productName: APP_IDENTITY.productName,
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
  mac: { target: ['dmg', 'zip'] },
  linux: { target: ['deb'] },
  // 必须使用 package.json 的小写 ${name}，严禁使用含空格的 ${productName}
  // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder placeholder
  artifactName: '${name}-${version}-${os}-${arch}.${ext}',
  asarUnpack: ['**/*.node'],
  generateUpdatesFilesForAllChannels: true,
  files: [
    'LICENSE*',
    '!node_modules/@app/**',
    // 文件私有辅助函数：自动读取各子包 package.json 中的 files 声明字段打包
    ...getListOfFilesFromEachWorkspace(['main', 'preload', 'renderer']),
    '!**/*.map', // 严禁将 SourceMap 打入 asar，杜绝源码泄露
    '!**/node_modules/**/*.d.ts',
  ],
};
export default config;
```

### 主进程构建依赖自动外部化

→ 源码：[packages/main/vite.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/vite.config.ts)

```ts
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const runtimeDependencies = Object.keys(pkg.dependencies ?? {});

export default defineConfig({
  build: {
    target: 'node24',
    rolldownOptions: {
      // 自动从 packages/main/package.json 提取依赖设为 external（外加 electron）
      // 纯 JS 依赖装在 devDependencies 中由 Vite 自动打包内联进 index.cjs
      external: ['electron', ...runtimeDependencies],
    },
  },
  ssr: { noExternal: true },
});
```

### 跨平台打包命令矩阵

```bash
# 根目录执行标准打包
pnpm build:unpack    # 本地解包（快速验证，生成 dist/win-unpacked 等）
pnpm build:win       # 打包 Windows NSIS 安装包
pnpm build:mac       # 打包 macOS dmg / zip
pnpm build:linux     # 打包 Linux deb 安装包
```

## 3. 桌面端避坑注意事项

| 避坑要点                    | 事故表现与原因                                                                                                                                              | 本仓库对齐方案                                                                          |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **`artifactName` 包含空格** | 使用 `${productName}` 作为文件名（如 `My App Setup.exe`），GitHub Releases 上传时自动将空格替换为点号，导致客户端拉取 `latest.yml` 校验 SHA512 失败或 404。 | `artifactName` 统一强制使用小写无空格的 `${name}`（对应 package.json 的 `name` 字段）。 |
| **根目录依赖污染**          | 在根目录 `package.json` 安装业务依赖，打包器会将整个庞大的 `node_modules` 连同冗余开发包全部打包进 ASAR。                                                   | `verify-prebuild` 门禁严查：根目录 `dependencies` **只能且仅能包含 `@app/main`**。      |
| **C++ 原生模块损坏**        | 包含 `.node` 的模块被封装进 ASAR 后由于无法直接通过操作系统 `dlopen` 加载而报错。                                                                           | 打包配置中强制声明 `asarUnpack: ['**/*.node']`，自动解包至 `app.asar.unpacked/`。       |
| **SourceMap 随包发布**      | 忽视打包排除规则，导致 `.map` 源码映射文件流入最终安装包，逆向反编译一览无遗。                                                                              | 打包文件白名单中严格注入 `'!**/*.map'` 与 `'!**/node_modules/**/*.d.ts'`。              |
