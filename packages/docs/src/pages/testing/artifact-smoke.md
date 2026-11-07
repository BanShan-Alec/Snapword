---

title: 产物冒烟测试（Dist-smoke）
description: 打包后真实拉起解包产物，断言启动揭幕门禁并捕获运行时异常，环境受限显式跳过。
---

# 产物冒烟测试（Dist-smoke）

> **TL;DR**：打包构建成功不等于可运行。通过 Playwright 真实拉起解包二进制，断言 `body.app-startup-ready` 协调器类名挂载并捕获 `pageerror` 运行时异常，结合 ASAR 体积硬防线，白屏与 ASAR 结构损坏 100% 阻断在发版之前。

## 1. 选型理由

- **打包命令成功不等于产物可用**：`electron-builder` 退出码为 0 仅代表静态资源打包流程完成；若原生模块架构不匹配、ASAR 解包路径缺失、或构建期发生 SyntaxError，用户下载后会直接白屏或崩溃。
- **杜绝 `#root` 静态假断言**：HTML 模板原本就包含 `<div id="root"></div>`，即使 React 运行时抛错挂死，DOM 依然能找到该节点。必须以 React 与主进程双向揭幕门禁（`body.app-startup-ready`）作为唯一真源。
- **环境受限显式跳过而非误报**：在 Linux 交叉编译 Windows exe 或无 Xvfb 桌面显示服务时，守卫自动安全跳过启动，同时严格保留 ASAR 体积门禁。

## 2. 核心机制

### 冒烟脚本实现与启动断言

→ 源码：[scripts/verify-postbuild.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/verify-postbuild.ts)

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';
import { loadRepoEnv, getRepoEnvValue } from '../build/lib/env.ts';
import { getDistDir } from '../build/lib/repo-paths.ts';

export async function verifyPostbuild(options: PostbuildVerificationOptions = {}): Promise<void> {
  const repoEnv = loadRepoEnv(__dirname, 'production');
  const distDir = options.distDir
    ? path.resolve(repoEnv.rootDir, options.distDir)
    : getDistDir(repoEnv.rootDir);
  const maxAsarSizeMb =
    options.maxAsarSizeMb ?? Number(getRepoEnvValue(repoEnv, 'MAX_ASAR_SIZE_MB') || 10);

  const artifact = detectUnpackedArtifact(distDir);
  if (!artifact) {
    throw new Error(`[verify-postbuild] 未在 ${distDir} 找到解包产物`);
  }

  // 1. asar 体积门禁校验（防止产物异常膨胀，上限 10MB）
  const asarStat = fs.statSync(artifact.asarPath);
  const asarSizeMb = asarStat.size / (1024 * 1024);
  if (asarSizeMb > maxAsarSizeMb) {
    throw new Error(
      `[verify-postbuild] asar 体积超标 (${asarSizeMb.toFixed(2)} MB > ${maxAsarSizeMb} MB)`,
    );
  }

  // 2. 跨平台宿主与桌面显示服务兼容性守卫
  if (process.platform !== artifact.platform) {
    console.warn(
      `⚠️ [verify-postbuild] 目标平台 (${artifact.platform}) 与宿主不一致，跳过真实启动测试。`,
    );
    return;
  }
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    console.warn('⚠️ [verify-postbuild] Linux 环境无可用 DISPLAY，跳过进程拉起测试。');
    return;
  }

  // 3. 真实启动打包二进制进行 Smoke 校验
  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-smoke-test-'));
  try {
    const app = await electron.launch({
      executablePath: artifact.executablePath,
      args: [
        `--user-data-dir=${tempUserDataDir}`,
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
      timeout: 30000,
    });

    try {
      const pageErrors: Error[] = [];
      const errorFingerprints = new Set<string>();
      const attachedPages = new WeakSet<Page>();

      const recordPageError = (err: Error) => {
        const fingerprint = `${err.name}:${err.message}\n${err.stack ?? ''}`;
        if (errorFingerprints.has(fingerprint)) return;
        errorFingerprints.add(fingerprint);
        pageErrors.push(err);
        console.error('❌ [verify-postbuild] 捕获到页面未处理异常 (pageerror):', err);
      };

      const attachPage = (p: Page) => {
        if (attachedPages.has(p)) return;
        attachedPages.add(p);
        p.on('pageerror', recordPageError);
      };

      app.on('window', attachPage);
      const page = await app.firstWindow();
      attachPage(page);

      // 核心断言：必须等待启动协调器揭幕成功，坚决不用脆弱的 #root
      await page.waitForSelector('body.app-startup-ready', { timeout: 15000 });

      if (pageErrors.length > 0) {
        throw new Error(`[verify-postbuild] 启动阶段捕获到 ${pageErrors.length} 个未处理异常`);
      }
    } finally {
      await app.close();
    }
  } finally {
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  }
}
```

### 打包链路自动串联

→ 源码：[scripts/build.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/build.ts)

```ts
// 4. 打包完成后默认触发验真，发版前必过；可通过 --skip-verify 参数作为逃生门
if (!values['skip-verify']) {
  await verifyPostbuild({ distDir: getDistDir(ROOT_DIR) });
}
```

## 3. 桌面端避坑注意事项

| 避坑要点                     | 事故表现与原因                                                                                                                                        | 本仓库对齐方案                                                                                                                |
| :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **禁止 `#root` 假阳性**      | 若仅断言 `#root`，React 抛出全局语法错误导致白屏时，由于 index.html 预置了该 DOM 节点，冒烟测试依然判定为成功通过。                                   | 必须断言 `body.app-startup-ready` 协调器类名挂载（React 首帧 commit 且主进程双门禁解锁后注入），并全局捕获 `pageerror` 堆栈。 |
| **首次窗口与多窗口异常去重** | Playwright 的 `app.on('window')` 无法捕获在此之前已创建的窗口，故需显式监听 `firstWindow()`；若两处均挂载监听，同一异常会被触发两次导致计数翻倍误报。 | 使用 `WeakSet<Page>` 确保每个窗口只注册一次监听，并结合 `errorFingerprints` 对错误内容幂等去重。                              |
| **单实例锁污染**             | 若直接拉起产物而未传独立配置，测试实例会尝试激活本地已运行的开发态进程并立即退出，导致冒烟误报或挂死。                                                | 每次必须通过 `fs.mkdtempSync` 创建独立的 `tempUserDataDir` 并于 `finally` 强制安全清理。                                      |
| **无头 CI 平台隔离**         | Linux 交叉编译构建出的 Windows exe 或 macOS 无头 runner 强行 `electron.launch` 会直接触发 SIGSEGV。                                                   | `process.platform !== artifact.platform` 时显式安全跳过启动测试，但 ASAR 静态体积门禁照常执行。                               |
| **ASAR 产物发现差异**        | 各系统产物路径不同（Windows 在 `win-unpacked/*.exe`，macOS 在 `mac*/*.app/Contents/MacOS/*`）。                                                       | `detectUnpackedArtifact` 集中抹平平台路径差异，统一返回 `{ executablePath, asarPath, platform }`。                            |
