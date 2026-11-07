# @app/docs 文档站

本项目解决方案合集文档站，基于 Vocs 静态站点生成器构建，展示桌面端踩坑经验与架构落地指南。

> 站点架构、页面三段式规范与避坑清单见 [AGENTS.md](./AGENTS.md)；全局红线与任务路由见 [根 AGENTS.md](../../AGENTS.md)。

---

## 快速开始

```bash
pnpm docs:dev    # 启动文档站本地预览（默认端口 5174）
pnpm docs:build  # 生产构建（同时校验站内死链与语法）
```

---

## 跨包与文档关联

- 全局工程与提交规范：参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)
- 返回根目录：[README.md](../../README.md)
