# @app/preload 安全桥接与 API 契约实现

Preload 脚本运行在拥有部分 Node.js 能力的独立预加载环境中，充当渲染进程与主进程之间的**安全隔离网关**。

> 🤖 **AI 协作者**：本包的目录结构 / 编写规则已收敛至 [AGENTS.md](./AGENTS.md)，动手前必读；全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。

---

## 1. 核心定位与职责

- **安全沙箱隔离**：在 `contextIsolation: true` 与 `sandbox: true` 约束下，严禁向渲染进程泄露任何 Node.js 原生模块（如 `fs`、`child_process`、`electron` 原始对象）。
- **契约对齐**：实现 [`@app/shared/types/api`](../shared/src/types/api.ts) 中定义的 `ElectronApi` 接口，通过 `contextBridge.exposeInMainWorld('api', apiBridge)` 暴露类型安全的 `window.api`。
- **文件路径安全桥接**：遵循 Electron 官方安全实践，通过 `webUtils.getPathForFile(file)` 获取拖拽或选中的真实系统文件路径，而非直接暴露文件对象属性。

---

## 2. 跨包关联

- 契约源头：参见 [packages/shared/README.md](../shared/README.md)
- 主进程实现：参见 [packages/main/README.md](../main/README.md)
- 前端消费层：参见 [packages/renderer/README.md](../renderer/README.md)
- 返回根目录：[README.md](../../README.md)
