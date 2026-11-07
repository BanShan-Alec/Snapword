---

title: 分包与体积门禁（Chunk + Asar）
description: 渲染层按稳定性分块，前置校验根依赖白名单，后置硬门禁实测 ASAR 体积。
---

# 分包与体积门禁（Chunk + Asar）

> **TL;DR**：渲染端第三方依赖按稳定性精细分块；打包前由静态脚本拦截根目录非法生产依赖（前置门禁）；打包后实测 `app.asar` 归档物理体积（后置门禁，默认 10MB），超限立即阻断流水线并输出 Top 5 膨胀分析。

## 1. 选型理由

桌面客户端体积极易悄悄膨胀失控：
1. **依赖链污染**：开发者随手在根目录安装一个工具库，打包工具递归收集，几百 MB 垃圾依赖被全量卷进最终安装包。
2. **打包配置退化**：Vite 分包规则失效，所有第三方库全被揉进一个巨大的单体 JS 文件中，启动解析极其缓慢。

工程通过前置与后置双向硬门禁，构建对体积劣化的免疫机制。

## 2. 核心机制

### 渲染端精细路径分包（Vite manualChunks）

→ 源码：[packages/renderer/vite.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/vite.config.ts)

```ts
manualChunks(id) {
  if (id.includes('node_modules')) {
    // 1. 最核心 React 运行时（精准路径正则过滤，防外围包污染）
    if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
      return 'vendor-react';
    }
    // 2. UI 框架及其底层 RC 库
    if (/[\\/]node_modules[\\/](antd|@ant-design|rc-[a-z0-9-]+)[\\/]/.test(id)) {
      return 'vendor-antd';
    }
  }
}
```

### 前置根依赖白名单门禁（verify-prebuild）

→ 源码：[scripts/verify-prebuild.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/verify-prebuild.ts)

```ts
const rootDeps = Object.keys(rootPkg.dependencies || {});
const allowedRootDeps = ['@app/main'];

const illegalRootDeps = rootDeps.filter((dep) => !allowedRootDeps.includes(dep));
if (illegalRootDeps.length > 0) {
  console.error(`[verify:prebuild] 根目录存在非法生产依赖: ${illegalRootDeps.join(', ')}`);
  process.exit(1);
}
```

### 后置 ASAR 物理体积门禁（verify-postbuild）

→ 源码：[scripts/verify-postbuild.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/verify-postbuild.ts)

```ts
const maxAsarSizeMb = Number(getRepoEnvValue(repoEnv, 'MAX_ASAR_SIZE_MB') || 10);

if (asarSizeMb > maxAsarSizeMb) {
  // 输出体积构成分析（占比 + TOP 5 最大文件）
  printAsarCompositionBreakdown(asarPath);
  throw new Error(
    `❌ asar 体积超标 (${asarSizeMb.toFixed(2)} MB > ${maxAsarSizeMb} MB)，构建中断！`,
  );
}
```

## 3. 桌面端避坑注意事项

- **`MAX_ASAR_SIZE_MB` 阈值配置**：
  - 默认体积上限可在根 `.env` 中声明 `MAX_ASAR_SIZE_MB=15` 动态调整。若业务引入大尺寸本地静态模型或数据文件，应通过此变量明确提升门槛，而非绕过校验。
- **`--skip-verify` 仅作紧急逃生通道**：
  - 打包命令支持通过 `-- --skip-verify` 跳过后置体积门禁与冒烟测试。该选项仅供调试打包脚本本身时使用，正式发版流水线中严禁开启。
- **静态资源避免全量打包进 ASAR**：
  - 音视频大文件或 Native 可执行文件应通过 `extraResources` 放在 ASAR 外部，避免造成 ASAR 解压缩读取性能急剧下降。
