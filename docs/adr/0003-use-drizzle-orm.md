# ADR-0003：数据库访问改用 Drizzle ORM + node:sqlite

- 状态：已接受
- 日期：2026-11-04
- 相关：B-03 `docs/data-model.md` v2.0、B-01 `docs/architecture.md` §5.2/§11、PRD-v2 RM-07/RX-10

## 背景

B-03 v1.0 的结论是 `better-sqlite3` + 手写 SQL + 纯 SQL 迁移，并明确写着“不引入 ORM”。当时的理由是只有两张业务表，ORM 只是多一层抽象。

2026-11-04 用户拍板改用 Drizzle ORM，并同时提出两个新需求：

1. 删除支持短时间撤销（类 Microsoft To Do），不能是假撤销；
2. 设置项与生词本支持低成本云盘同步（OneDrive / Google Drive / Dropbox / iCloud 等）。

重新评估时的关键事实：

- 产品代码为 0，没有已发布数据库，可以直接定 v1 的最终形态，不需要兼容旧 DDL。
- 云盘同步要求删除能跨设备传播，硬删除做不到；必须有墓碑。
- 撤销要求真实可恢复；内存撤销栈在刷新/崩溃后即丢。
- Electron 打包希望减少原生模块，Node 内置的 `node:sqlite` 可以省掉 better-sqlite3 的 ABI rebuild 与 `asarUnpack`。

## 决策

1. 使用 `drizzle-orm@1.0.0-rc.5` + `drizzle-kit@1.0.0-rc.5`，**精确锁版本**；`schema.ts` 是唯一事实源，迁移 SQL 由 `drizzle-kit generate` 生成并提交。
2. 驱动使用 Node 内置 `node:sqlite`（`DatabaseSync`），通过 `drizzle-orm/node-sqlite`。若 P4 验证发现 Electron 未暴露 `node:sqlite`，回退 `better-sqlite3`；schema、迁移、同步设计不变。
3. 启动时由 `drizzle-orm/node-sqlite/migrator` 执行迁移；删除自研 `schema_version` 表与 `PRAGMA user_version`，改用“本地迁移名集合 vs `__drizzle_migrations.name`”做版本守卫。
4. 生产禁止 `drizzle-kit push`；`drizzle-kit` 只作 devDependency，只在 Node 环境/CI 运行，不在 Electron 运行时运行。
5. 仓储层对外返回领域类型；Drizzle 的 `$inferSelect` / `$inferInsert` 不出 `repositories/`。
6. 删除采用软删除 + 墓碑：`deleted_at`、`deleted_batch`；保留全量唯一索引，upsert 时复活墓碑。
7. 同步（v1.1）采用“每设备一份快照 JSON + 自然键 + 按记录 LWW”，不把 `vocab.db` 放进云盘。
8. 可同步设置迁到 SQLite `setting` 表；`config.json` 只保留密钥、设备本地项与启动所需配置。

## 理由

- **单一事实源**：schema-as-code 同时产出 TS 类型与迁移 SQL；改字段编译器会报错。手写 SQL + 手写类型是两套事实源，必然漂移。
- **Drizzle 无运行时引擎/二进制**：Prisma 的 query engine 要为每个平台打包，Electron + asar 路径复杂；Drizzle 只是查询构建器 + 迁移生成器。
- **node:sqlite 少一个原生依赖**：不需要为 Electron ABI rebuild，也不需要 `asarUnpack` better-sqlite3；同步 API 与主进程写入模型一致。
- **墓碑同时解决撤销与同步删除传播**：硬删除无法让另一台设备知道“这条被删了”；软删除一列同时服务两个需求。
- **全量唯一索引 + 复活**：避免“删除后重新添加”产生两条同 `word_norm` 记录，保证同步键稳定。
- **每设备快照避免云盘写冲突**：单文件共享快照在两台设备同时写时会产生冲突副本或后写覆盖先写；每设备只写自己的文件，云盘只负责搬文件。
- **`setting` 表统一合并路径**：生词本、术语、设置共用一套事务/时间戳/LWW；`config.json` 继续承担密钥与设备本地项。

## 后果

- B-03 升 v2.0；字段字典、DDL、迁移、备份、并发、隐私全部重写。
- 所有查询必须过滤 `deleted_at IS NULL`；导出排除墓碑。
- 墓碑分两阶段：5 秒内保留完整内容供撤销；之后清空内容字段，只留 key + 时间戳供同步；保留期后硬删除。
- 同步是 v1.1；v2 schema 先落 `deleted_at` / `deleted_batch` / `setting` 表，避免二次迁移。
- RC 风险：v1 仍是 RC，迁移目录格式/API 可能再变；升级必须单独 PR + 重跑生成与迁移测试。
- 时钟偏差会影响 LWW；同步状态在偏差 >5 分钟时警告，文档要求系统时间自动同步。
- 不再维护 `schema_version` / `user_version`；版本守卫依赖 `__drizzle_migrations.name`，升级 Drizzle 大版本时要复核该表结构。

## 备选方案

- **继续手写 SQL + better-sqlite3**：否决。双事实源；撤销/同步需要额外的墓碑与合并层，手写成本更高。
- **Prisma**：否决。query engine 二进制、Electron 打包复杂。
- **TypeORM**：否决。装饰器/反射、抽象重，SQL 不透明。
- **Kysely**：否决。只有查询层，没有 schema→迁移生成。
- **同步 DB 文件到云盘**：否决。WAL/-shm、写锁、冲突副本、半同步文件会损坏数据库。
- **单文件共享快照**：否决。两台设备同时写会产生冲突副本或后写覆盖先写。
- **内存撤销栈**：否决。刷新/崩溃即丢；清空生词本需要整表快照；同步仍需墓碑。
- **独立回收站表**：否决。多一张表 + 复制 + 恢复冲突；软删除两列即可。
- **字段级同步合并**：否决。每字段时间戳，复杂度和收益不成比例。

## 风险与验证

P4 骨架第一项必须验证，验证结果回填 B-03 §15：

1. Electron 主进程 `require('node:sqlite')` 是否可用；不可用则回退 `better-sqlite3`。
2. `migrate()` 在 node:sqlite 下是同步还是异步、整批还是逐迁移事务、数据库存在未知迁移时的行为。
3. `db.$client` 是否为 `DatabaseSync`、PRAGMA 是否只能走 `exec`、只读连接是否可用。
4. `RETURNING`、`json_type`、部分索引在目标 SQLite 版本上是否可用。

若 RC 在正式版前再改迁移目录格式，按 `drizzle-kit up` 升级并重跑迁移测试。
