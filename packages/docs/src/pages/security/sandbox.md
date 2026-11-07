---

title: 渲染进程沙箱（Sandbox）
description: webPreferences 写死沙箱隔离四件套，主窗口与辅助弹窗一视同仁。
---

# 渲染进程沙箱（Sandbox）

> **TL;DR**：所有 `BrowserWindow` 实例的 `webPreferences` 强制写死沙箱四件套（关闭 Node、开启上下文隔离、开启沙箱、禁用 Webview）；主窗口与更新弹窗一视同仁，渲染进程与操作系统完全物理隔离。

## 1. 选型理由

Electron 历史上最严重的漏洞多源于沙箱配置不严：
- **`nodeIntegration: true` 毁灭性隐患**：一旦页面被注入任何第三方 XSS 脚本，攻击者直接调用 `require('child_process')` 即可获取用户操作系统的全权限 Shell 执行能力。
- **上下文未隔离**：若未开启 `contextIsolation`，页面脚本可通过重写 `window.Array` 或原型链劫持 Preload 中的私有变量，进而绕过安全通道。

工程确立底座级安全准则：**任何窗口均作为非受信 Web 沙箱运行**。

## 2. 核心机制

### 强制写死沙箱四件套

→ 源码：[packages/main/src/modules/window/index.module.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/window/index.module.ts)

```ts
const browserWindow = new BrowserWindow({
  // ...窗口几何与样式配置
  webPreferences: {
    nodeIntegration: false, // 1. 彻底禁用渲染层 Node.js 能力
    contextIsolation: true, // 2. 开启上下文隔离（Preload 与页面脚本独立上下文）
    sandbox: true, // 3. 开启 Chromium 操作系统级进程沙箱
    webviewTag: false, // 4. 彻底禁用内嵌 <webview> 标签防止嵌套逃逸
    preload: this.preload.path,
    additionalArguments: [getPackedEnvArgument()],
  },
});
```

辅助小窗口（如 `updater-window.module.ts`）同样采用完全一致的配置，绝不因“只是轻量通知弹窗”而放松门禁。

## 3. 桌面端避坑注意事项

- **渲染层代码绝不碰 Node 原生模块**：
  - 在 `packages/renderer` 内严禁编写 `import 'node:fs'` 或 `process.platform`。虽然类型系统可能经由 Vite 透传部分声明，但运行时处于纯浏览器环境，任何底层硬件或文件交互必须经过 Preload 白名单通道。
- **ContextBridge 传参安全防逃逸**：
  - 通过 `contextBridge.exposeInMainWorld` 暴露的方法，其参数会被 Chromium 底层深度序列化拷贝。严禁向渲染层传递主进程未冻结的类实例或复杂的系统对象，只暴露纯函数与基础数据。
- **沙箱环境下 Preload 的行为限制**：
  - 开启 `sandbox: true` 后，Preload 脚本自身也无法调用大部分 Node 内部原生 API（仅保留少部分 IPC 与环境能力）。这一限制是刻意为之的纵深防御设计。
