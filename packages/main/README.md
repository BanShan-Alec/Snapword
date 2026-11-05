# @app/main 主进程架构与 AI 开发指南

主进程充当运行在 Node.js 环境下的**本地微型后端**，负责操作系统底层交互、窗口生命周期管理以及对渲染进程提供强契约的 IPC 接口。

> 🤖 **AI 协作者**：本包的目录结构 / 铁律 / 严禁清单 / 开发 SOP 已收敛至 [AGENTS.md](./AGENTS.md)，动手前必读；全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。

---

## 跨包关联

- 契约源头：参见 [packages/shared/README.md](../shared/README.md)
- 安全桥接：参见 [packages/preload/README.md](../preload/README.md)
- 渲染层消费：参见 [packages/renderer/README.md](../renderer/README.md)
- 工程与提交规范：参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)
- 返回根目录：[README.md](../../README.md)
