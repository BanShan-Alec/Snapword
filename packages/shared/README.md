# @app/shared 架构分层与开发指南

`@app/shared` 是全栈跨端通信契约的**单一事实源 (Single Source of Truth)**，负责在 Electron 的主进程 (`main`)、预加载脚本 (`preload`) 以及渲染进程 (`renderer`) 之间共享数据结构、校验模型与通信通道。

> 🤖 **AI 协作者**：本包的目录架构 / 设计原则 / 命名规范 / 开发 SOP 已收敛至 [AGENTS.md](./AGENTS.md)，动手前必读；全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。

---

## 跨包关联与后续开发

- **主进程实现**：在 [packages/main/README.md](../main/README.md) 中实现 Service 与 Controller 并挂载
- **Preload 桥接**：在 [packages/preload/README.md](../preload/README.md) 中将 API 挂载至 `apiBridge`
- **渲染层消费**：在 [packages/renderer/README.md](../renderer/README.md) 中通过 `lib/ipc.ts` 消费
- **全局工程规范**：参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)
- **返回根目录**：[README.md](../../README.md)
