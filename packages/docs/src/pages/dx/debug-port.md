---

title: 远程调试端口（CDP）
description: 渲染层 CDP 端口与主进程断点端口集中管理，配置化控制开关与启动参数联动。
---

# 远程调试端口（CDP）

> **TL;DR**：渲染进程 CDP 端口（默认 `9222`）与主进程断点端口（默认 `9229`）集中声明在 `scripts/dev.ts` 的 `config` 对象中；字段注释即关闭该能力，启动参数与日志联动隐退。

## 1. 选型理由

Electron 包含 Chromium 渲染引擎与 Node.js 运行时，本地调试面临两类不同协议：
1. **渲染层断点与性能追踪**：需要向 Electron 注入 `--remote-debugging-port`，以便通过 Chrome 独立 DevTools 面板或自动化 CDP 客户端连接。
2. **主进程源码级断点**：需要向 Electron 注入 `--inspect` 或 `--inspect-brk`，以便 VS Code 等 IDE 附加 Node 调试器。

若每次排错都手动在命令行拼接参数，极易遗忘语法，且无法与端口冲突预检联动。

## 2. 核心机制

### 集中式调试端口配置

→ 源码：[scripts/dev.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/scripts/dev.ts)

```ts
const config: {
  mode: string;
  rendererPort: number;
  mainInspectPort?: number;
  rendererCdpPort?: number;
} = {
  mode: repoEnv.mode,
  rendererPort: 5173,

  // 主进程断点端口 (--inspect-brk)，解开注释即可在启动时阻断等待附加
  // mainInspectPort: 9229,

  // 渲染层 CDP 端口 (--remote-debugging-port)，供外部工具与性能面板连接
  rendererCdpPort: 9222,
};
```

### 启动参数联动组装

当配置项存在有效数值时，参数与指引日志同步生效；注释后自动跳过：

```ts
function buildElectronArgs(): string[] {
  const args: string[] = [];

  if (config.mainInspectPort) {
    args.push(`--inspect-brk=${config.mainInspectPort}`);
    console.log(`${LOG_PREFIX} 主进程断点监听: http://127.0.0.1:${config.mainInspectPort}`);
  }

  if (config.rendererCdpPort) {
    args.push(`--remote-debugging-port=${config.rendererCdpPort}`);
    console.log(`${LOG_PREFIX} 渲染进程 CDP 端点: http://127.0.0.1:${config.rendererCdpPort}`);
  }

  return args;
}
```

## 3. 桌面端避坑注意事项

- **单一真源联动**：
  - 启动前端口预检（`ensurePortsAvailable`）会自动过滤未定义的端口。例如注释掉 `mainInspectPort` 后，预检系统便不会检查 9229 端口，避免误杀无关进程。
- **Chrome 远程连接姿势**：
  - 启动后控制台打印 `renderer CDP endpoint`，在 Chrome 浏览器地址栏输入 `chrome://inspect`，即可在 "Remote Target" 列表中点击 "inspect" 打开完整的独立 Chrome DevTools 面板，支持查看 Memory 快照与 Performance 录制。
- **打包安装包严禁开启调试端口**：
  - `--remote-debugging-port` 与 `--inspect` 允许任何本地进程向应用注入任意 JavaScript 代码甚至执行系统 Shell。在 `build/electron-builder.ts` 与生产发布流程中，切勿将这些参数打入最终包的启动命令中。
