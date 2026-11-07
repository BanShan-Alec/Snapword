---

title: 源码映射隔离（Source-map）
description: 生产环境采用 hidden 模式生成 SourceMap，平台上传后就地物理删除，ASAR 全局排除。
---

# 源码映射隔离（Source-map）

> **TL;DR**：生产排障需要 SourceMap 反解堆栈，但绝对不能将源码送给最终用户。通过「`hidden` 生成模式 + Sentry 插件上传后物理删除 + `electron-builder` ASAR 最终排除」三道硬防线，彻底封堵源码泄露漏洞。

## 1. 选型理由

- **消除源码泄露风险**：若构建配置为 `sourcemap: true`，构建器会在 JS 文件末尾追加 `//# sourceMappingURL=...` 并随安装包分发，任何人解包 ASAR 即可还原出 100% 原始 TypeScript 源码。
- **保障线上崩溃可定位**：若直接全局关闭 `sourcemap: false`，线上产生崩溃时 Sentry 收集到的只能是一串完全混淆压缩过的无意义行号列号，无法排查疑难杂症。
- **三层冗余防御体系**：即便 CI 中忘记配置 Sentry 凭据或网络上传失败，下游的打包排除规则仍能坚实守住底线，确保 ASAR 绝对纯净。

## 2. 核心机制

### 第一道防线：Hidden 模式生成（无尾部暴露）

→ 源码：[packages/main/vite.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/vite.config.ts) · [packages/renderer/vite.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/vite.config.ts)

```ts
// 开发态内联便于断点，生产态严格使用 hidden 模式
sourcemap: isDev ? 'inline' : 'hidden',
```

> **hidden 模式作用**：Vite 会完整生成 `.map` 文件供监控系统上传，但**绝不在**编译后的 `.js`/`.cjs` 文件末尾追加 `sourceMappingURL` 注释，Chromium DevTools 无法自动关联。

### 第二道防线：Sentry 上传后自动物理删除

→ 源码：[packages/main/vite.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/vite.config.ts)

```ts
plugins: [
  sentryVitePlugin({
    org: sentryOptions.sentryOrg,
    project: sentryOptions.sentryProject,
    authToken: sentryOptions.sentryAuthToken,
    telemetry: false,
    disable: !sentryOptions.sentryAuthToken, // 无 token 时安全跳过
    release: { name: sentryOptions.releaseName },
    sourcemaps: {
      // 核心配置：上传成功后立即将 dist 下的所有 .map 文件物理销毁
      filesToDeleteAfterUpload: ['dist/**/*.map'],
    },
  }),
];
```

### 第三道防线：打包阶段绝对排除兜底

→ 源码：[build/electron-builder.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/build/electron-builder.ts)

```ts
files: [
  'LICENSE*',
  '!node_modules/@app/**',
  ...getListOfFilesFromEachWorkspace(['main', 'preload', 'renderer']),
  // 核心守卫：无论前序构建发生何种意外，严禁任何 .map 和 .d.ts 进入 asar 归档
  '!**/*.map',
  '!**/node_modules/**/*.d.ts',
  '!**/node_modules/**/*.d.cts',
  '!**/node_modules/**/*.d.mts',
];
```

## 3. 桌面端避坑注意事项

| 避坑要点                            | 事故表现与原因                                                             | 本仓库对齐方案                                                                      |
| :---------------------------------- | :------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| **`sourceMappingURL` 注释泄露**     | 使用 `sourcemap: true`，生成的 JS 包含映射注释，被终端反编译工具直接识别。 | 全仓生产配置必须使用 `'hidden'`。                                                   |
| **本地打包残留 `.map` 被打入 ASAR** | 本地未配置 Sentry Token 打包时，跳过上传导致 `.map` 依然留在 `dist/` 中。  | `build/electron-builder.ts` 的 `files` 规则硬性包含 `'!**/*.map'`，打包时自动抹除。 |
| **Sentry 插件在本地开发报错**       | 本地开发未配置环境变量导致构建器报缺少 AuthToken 失败。                    | 显式声明 `disable: !sentryOptions.sentryAuthToken`，未配置时静默降级为纯构建。      |
| **类型声明暴露接口结构**            | 第三方库中的 `.d.ts` 大量打入 ASAR，逆向工程师可轻松推测内部 IPC 协议。    | 打包白名单一并排除 `'!**/node_modules/**/*.d.ts*'`，进一步瘦身 ASAR 并加固安全。    |
