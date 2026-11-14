# @app/shared 跨端通信契约

`@app/shared` 是全栈跨端通信契约的**单一事实源 (Single Source of Truth)**，负责在 Electron 的主进程 (`main`)、预加载脚本 (`preload`) 以及渲染进程 (`renderer`) 之间共享数据结构、校验模型与通信通道。

> 四层职能架构、设计原则与导出契约见 [AGENTS.md](./AGENTS.md)；全局红线与任务路由见 [根 AGENTS.md](../../AGENTS.md)。

---

## 跨包关联与后续开发

- **主进程实现**：在 [packages/main/README.md](../main/README.md) 中实现 Service 与 Controller 并挂载
- **Preload 桥接**：在 [packages/preload/README.md](../preload/README.md) 中将 API 挂载至 `apiBridge`
- **渲染层消费**：在 [packages/renderer/README.md](../renderer/README.md) 中通过 `useIpc` 消费
- **全局工程规范**：参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)
- **返回根目录**：[README.md](../../README.md)
