# Snapword 数据库 Schema 与迁移契约 v2.0（B-03）

> 文档状态：**已定稿，可据此实现**
> 数据库：SQLite（Node 内置 `node:sqlite` / `DatabaseSync`；JSON1）
> 文件：`%APPDATA%/Snapword/vocab.db`
> ORM：`drizzle-orm@1.0.0-rc.5` + `drizzle-kit@1.0.0-rc.5`（精确锁版本）
> 上游依据：`docs/PRD.md` FR-33~FR-38、10.1 数据实体、A-03/A-04/A-05/A-08；`docs/interaction-spec-v2.md` 13.4 RM-05/RM-06/RM-07、13.5 RX-10；`docs/adr/0003-use-drizzle-orm.md`
> 本契约解决：schema 事实源、表结构、唯一键、索引、搜索、软删除与撤销、同步（v1.1 预留）、导出映射、迁移、备份/损坏恢复、并发与隐私边界。
> 本版变更（v2.0，2026-11-04）：数据库访问改为 Drizzle ORM；驱动改为 `node:sqlite`；删除改为软删除 + 墓碑；新增 `setting` 表与同步预留字段；删除 `schema_version` / `user_version`。

---

## 1. 范围与原则

- 只持久化**用户主动收藏的生词**、**用户维护的术语表**、**可同步的设置项**。
- 收藏**仅适用于单词模式**；句子模式不提供收藏，本库不存储句子或译文。
- 会话历史、卡片当前结果、翻译页最近结果**不落盘**。
- API Key **不进数据库**；只在 `config.json` 以 `safeStorage` 密文保存。
- 数据库为明文 SQLite（本地个人数据）；README 明示路径；不包含完整原文段落。
- 单写者：只有 Electron 主进程写；导出/批量操作在 worker 线程执行，但写事务仍串行。
- `src/main/db/schema.ts` 是**唯一事实源**；DDL 由 `drizzle-kit generate` 生成；禁止手改生成的迁移 SQL。
- 所有时间字段为 ISO 8601 UTC 字符串（毫秒精度），例如 `2026-11-03T12:00:00.000Z`。

---

## 2. 技术栈与事实源

| 组件          | 版本/形态                          | 职责                            | 约束                                                                |
| ------------- | ---------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| `drizzle-orm` | `1.0.0-rc.5`，精确锁版本           | schema 定义、查询构建、迁移执行 | 0.x/RC 期间 API 会变；升级必须单独 PR                               |
| `drizzle-kit` | `1.0.0-rc.5`，**仅 devDependency** | 从 `schema.ts` 生成迁移 SQL     | 禁止在生产/Electron 运行时运行；禁止对用户库 `push`                 |
| `node:sqlite` | Node 内置 `DatabaseSync`           | 同步 SQLite 驱动                | 已在 Electron 42/45 实测可用；项目内复现失败则回退 `better-sqlite3` |
| `schema.ts`   | `src/main/db/schema.ts`            | 表、列、索引、CHECK 的唯一定义  | 所有 schema 变更从这里开始                                          |
| `drizzle/`    | 生成物，提交入库                   | 迁移 SQL + snapshot             | append-only；已应用的迁移文件禁止修改                               |

**工作流**：

```text
改 schema.ts
  → npx drizzle-kit generate
  → review 生成的 migration.sql
  → 提交 schema.ts + drizzle/
  → 运行时 migrate() 按目录名应用
```

**禁止**：

- 生产环境 `drizzle-kit push`（直接改库、无迁移历史、可能重建表丢数据）。
- 在 Electron 运行时调用 `drizzle-kit`（ABI/CLI 环境不匹配）。
- 手改已应用的迁移 SQL（Drizzle 不校验 hash，改了不会重跑也不会报错）。

---

## 3. 连接与 PRAGMA

主进程使用**两个连接**：迁移连接（外键关闭）与运行时连接（外键开启）。这不是洁癖，是 rc.5 的必需规避，见下。

```ts
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import * as schema from './schema';

// 1) 迁移连接：外键关闭
const migrationClient = new DatabaseSync(dbPath, {
  enableForeignKeyConstraints: false,
  timeout: 5000,
});
migrationClient.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
// §10.3 的版本守卫先在同一连接上执行，再调用 migrate()
migrate(drizzle({ client: migrationClient, schema }), { migrationsFolder });
migrationClient.close();

// 2) 运行时连接：外键开启
const client = new DatabaseSync(dbPath, { timeout: 5000 });
client.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
`);

export const db = drizzle({ client, schema });
```

- **迁移连接必须关外键**：rc.5 的 `migrate()` 把整批迁移放在一个 deferred `BEGIN` 里；SQLite 的 `PRAGMA foreign_keys=OFF` 在事务内是 no-op。drizzle-kit 生成的表重建会 `DROP TABLE`，若外键是开的，`ON DELETE CASCADE` 会静默删掉子表（#5782/#6621）。必须在**打开连接时**用 `enableForeignKeyConstraints: false`，迁移结束后用新的运行时连接开启外键。
- `node:sqlite` 没有 `pragma()` / `transaction()` 辅助方法：PRAGMA 写用 `exec`，读结果用 `prepare('PRAGMA ...').get()`；事务用 Drizzle 的 `db.transaction(fn, { behavior: 'immediate' })`，**回调必须是同步函数**（async 回调在 JS 下不会报错，会立即提交）。
- `db.$client` 是底层 `DatabaseSync`，用于 PRAGMA、`wal_checkpoint`、备份等。
- `WAL`：读写并发；退出前 `PRAGMA wal_checkpoint(TRUNCATE)`。WAL 只在数据库创建时设置一次；多个连接并发设置 `journal_mode=WAL` 可能抛 `SQLITE_BUSY`。
- `synchronous=NORMAL`：WAL 下的推荐值；崩溃最多丢最后一个事务，不损坏数据库。
- `busy_timeout=5000` / 构造选项 `timeout: 5000`：避免短暂写锁直接失败。`node:sqlite` 默认 `timeout=0`，第二个连接会立刻 `database is locked`。
- `foreign_keys=ON` 只在运行时连接设置；当前没有外键，v1.1 加 `sense` 表时行为从一开始一致。
- **不再设置 `PRAGMA user_version`**：版本守卫改用迁移名集合（见 §10）。
- 所有时间字段由应用层生成 ISO 字符串；不使用 SQLite 的 `strftime`。

---

## 4. Schema v2

### 4.1 Drizzle 定义（`src/main/db/schema.ts`）

```ts
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql, desc } from 'drizzle-orm';

export type Sense = { pos: string; def: string; example: string };
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const vocabulary = sqliteTable(
  'vocabulary',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    word: text('word').notNull(),
    wordNorm: text('word_norm').notNull(),
    phoneticUs: text('phonetic_us').notNull().default(''),
    phoneticUk: text('phonetic_uk'),
    contextSense: text('context_sense'),
    contextSnippet: text('context_snippet'),
    sensesJson: text('senses_json', { mode: 'json' }).$type<Sense[]>().notNull().default(sql`'[]'`),
    sourceTitle: text('source_title'),
    sourceDomain: text('source_domain'),
    tagsJson: text('tags_json', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    rev: integer('rev').notNull().default(0),
    deletedAt: text('deleted_at'),
    deletedBatch: text('deleted_batch'),
    originDevice: text('origin_device').notNull(),
  },
  (t) => [
    uniqueIndex('ux_vocabulary_word_norm').on(t.wordNorm),
    index('ix_vocabulary_created_at_live').on(desc(t.createdAt)).where(sql`${t.deletedAt} IS NULL`),
    index('ix_vocabulary_updated_at_live').on(desc(t.updatedAt)).where(sql`${t.deletedAt} IS NULL`),
    index('ix_vocabulary_deleted_at').on(t.deletedAt),

    check('ck_vocabulary_word_len', sql`length(trim(${t.word})) BETWEEN 1 AND 120`),
    check('ck_vocabulary_word_norm_len', sql`length(${t.wordNorm}) BETWEEN 1 AND 120`),
    check('ck_vocabulary_phonetic_us_len', sql`length(${t.phoneticUs}) <= 120`),
    check(
      'ck_vocabulary_phonetic_uk_len',
      sql`${t.phoneticUk} IS NULL OR length(${t.phoneticUk}) <= 120`,
    ),
    check(
      'ck_vocabulary_context_sense_len',
      sql`${t.contextSense} IS NULL OR length(${t.contextSense}) <= 1000`,
    ),
    check(
      'ck_vocabulary_context_snippet_len',
      sql`${t.contextSnippet} IS NULL OR length(${t.contextSnippet}) <= 300`,
    ),
    check(
      'ck_vocabulary_senses_json',
      sql`json_valid(${t.sensesJson}) AND json_type(${t.sensesJson}) = 'array'`,
    ),
    check('ck_vocabulary_senses_len', sql`json_array_length(${t.sensesJson}) <= 5`),
    check(
      'ck_vocabulary_tags_json',
      sql`json_valid(${t.tagsJson}) AND json_type(${t.tagsJson}) = 'array'`,
    ),
    check('ck_vocabulary_tags_len', sql`json_array_length(${t.tagsJson}) <= 5`),
    check(
      'ck_vocabulary_source_title_len',
      sql`${t.sourceTitle} IS NULL OR length(${t.sourceTitle}) <= 300`,
    ),
    check(
      'ck_vocabulary_source_domain_len',
      sql`${t.sourceDomain} IS NULL OR length(${t.sourceDomain}) <= 255`,
    ),
  ],
);

export const term = sqliteTable(
  'term',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    term: text('term').notNull(),
    termNorm: text('term_norm').notNull(),
    matchType: text('match_type', { enum: ['exact', 'contains', 'regex'] }).notNull(),
    action: text('action', { enum: ['keep', 'translate'] }).notNull(),
    translation: text('translation'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    rev: integer('rev').notNull().default(0),
    deletedAt: text('deleted_at'),
    deletedBatch: text('deleted_batch'),
    originDevice: text('origin_device').notNull(),
  },
  (t) => [
    uniqueIndex('ux_term_norm_match').on(t.termNorm, t.matchType),
    index('ix_term_enabled_live').on(t.enabled).where(sql`${t.deletedAt} IS NULL`),
    index('ix_term_updated_at_live').on(desc(t.updatedAt)).where(sql`${t.deletedAt} IS NULL`),
    index('ix_term_deleted_at').on(t.deletedAt),

    check('ck_term_len', sql`length(trim(${t.term})) BETWEEN 1 AND 200`),
    check('ck_term_norm_len', sql`length(${t.termNorm}) BETWEEN 1 AND 200`),
    check('ck_term_match_type', sql`${t.matchType} IN ('exact','contains','regex')`),
    check('ck_term_action', sql`${t.action} IN ('keep','translate')`),
    check(
      'ck_term_translation_pair',
      sql`
    (${t.deletedAt} IS NOT NULL)
    OR (${t.action} = 'translate' AND ${t.translation} IS NOT NULL AND length(trim(${t.translation})) > 0)
    OR (${t.action} = 'keep' AND ${t.translation} IS NULL)
  `,
    ),
    check(
      'ck_term_translation_len',
      sql`${t.translation} IS NULL OR length(${t.translation}) <= 500`,
    ),
  ],
);

export const setting = sqliteTable(
  'setting',
  {
    key: text('key').primaryKey().notNull(),
    valueJson: text('value_json', { mode: 'json' }).$type<JsonValue>().notNull(),
    updatedAt: text('updated_at').notNull(),
    rev: integer('rev').notNull().default(0),
    originDevice: text('origin_device').notNull(),
  },
  (t) => [check('ck_setting_value_json', sql`json_valid(${t.valueJson})`)],
);
```

**说明**：

- 列名显式写出，不依赖 v1 RC 的 name-less 写法；升级 Drizzle 时更稳。
- `text({ mode: 'json' })` 负责序列化/反序列化；运行时不校验形状，形状由 §5 的应用层校验保证。
- `integer({ mode: 'boolean' })` 让 TS 侧是 `boolean`，SQLite 仍是 0/1。
- 不使用 `STRICT` 表：drizzle-kit 目前不支持，且类型亲和性已够用。
- `origin_device` 是同步预留字段：记录当前版本由哪台设备产生，用于 LWW 的确定性平局判定；本地写入时填当前 `deviceId`，应用远端记录时保留远端值。
- `rev` 是同步预留字段：同一行每次本地变更 +1，远端记录保留原值；`(updated_at, rev, origin_device)` 构成全序，解决同一毫秒内的平局。
- `deleted_batch` 只用于本地撤销，不进入同步文件。
- **`setting.key` 的 rc.5 已知缺陷**：#6165 会让 TEXT 主键丢掉 `NOT NULL`，SQLite 因此允许插入多行 `NULL`。初始迁移必须手工补 `NOT NULL`（§10.1 唯一允许的生成 SQL 补丁），CI 用 `PRAGMA table_info(setting)` 断言 `notnull=1`。
- 不使用 `onConflictDoNothing({ target, where })`：rc.5 在部分唯一索引上会生成非法 SQL（#6531）。我们的冲突目标是全量唯一索引，不受影响。

### 4.2 生成 DDL 参考

> 以下为 `drizzle-kit generate` 的预期输出，用于 review；**实际以生成文件为准**。P4 首次 generate 后若与此不一致，先改 `schema.ts`，不要手改 SQL。

```sql
CREATE TABLE `vocabulary` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `word` text NOT NULL,
  `word_norm` text NOT NULL,
  `phonetic_us` text DEFAULT '' NOT NULL,
  `phonetic_uk` text,
  `context_sense` text,
  `context_snippet` text,
  `senses_json` text DEFAULT '[]' NOT NULL,
  `source_title` text,
  `source_domain` text,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `rev` integer DEFAULT 0 NOT NULL,
  `deleted_at` text,
  `deleted_batch` text,
  `origin_device` text NOT NULL,
  CONSTRAINT `ck_vocabulary_word_len` CHECK(length(trim(`word`)) BETWEEN 1 AND 120),
  CONSTRAINT `ck_vocabulary_word_norm_len` CHECK(length(`word_norm`) BETWEEN 1 AND 120),
  CONSTRAINT `ck_vocabulary_phonetic_us_len` CHECK(length(`phonetic_us`) <= 120),
  CONSTRAINT `ck_vocabulary_phonetic_uk_len` CHECK(`phonetic_uk` IS NULL OR length(`phonetic_uk`) <= 120),
  CONSTRAINT `ck_vocabulary_context_sense_len` CHECK(`context_sense` IS NULL OR length(`context_sense`) <= 1000),
  CONSTRAINT `ck_vocabulary_context_snippet_len` CHECK(`context_snippet` IS NULL OR length(`context_snippet`) <= 300),
  CONSTRAINT `ck_vocabulary_senses_json` CHECK(json_valid(`senses_json`) AND json_type(`senses_json`) = 'array'),
  CONSTRAINT `ck_vocabulary_senses_len` CHECK(json_array_length(`senses_json`) <= 5),
  CONSTRAINT `ck_vocabulary_tags_json` CHECK(json_valid(`tags_json`) AND json_type(`tags_json`) = 'array'),
  CONSTRAINT `ck_vocabulary_tags_len` CHECK(json_array_length(`tags_json`) <= 5),
  CONSTRAINT `ck_vocabulary_source_title_len` CHECK(`source_title` IS NULL OR length(`source_title`) <= 300),
  CONSTRAINT `ck_vocabulary_source_domain_len` CHECK(`source_domain` IS NULL OR length(`source_domain`) <= 255)
);

CREATE UNIQUE INDEX `ux_vocabulary_word_norm` ON `vocabulary` (`word_norm`);
CREATE INDEX `ix_vocabulary_created_at_live` ON `vocabulary` (`created_at` DESC) WHERE `deleted_at` IS NULL;
CREATE INDEX `ix_vocabulary_updated_at_live` ON `vocabulary` (`updated_at` DESC) WHERE `deleted_at` IS NULL;
CREATE INDEX `ix_vocabulary_deleted_at` ON `vocabulary` (`deleted_at`);

CREATE TABLE `term` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `term` text NOT NULL,
  `term_norm` text NOT NULL,
  `match_type` text NOT NULL,
  `action` text NOT NULL,
  `translation` text,
  `enabled` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `rev` integer DEFAULT 0 NOT NULL,
  `deleted_at` text,
  `deleted_batch` text,
  `origin_device` text NOT NULL,
  CONSTRAINT `ck_term_len` CHECK(length(trim(`term`)) BETWEEN 1 AND 200),
  CONSTRAINT `ck_term_norm_len` CHECK(length(`term_norm`) BETWEEN 1 AND 200),
  CONSTRAINT `ck_term_match_type` CHECK(`match_type` IN ('exact','contains','regex')),
  CONSTRAINT `ck_term_action` CHECK(`action` IN ('keep','translate')),
  CONSTRAINT `ck_term_translation_pair` CHECK(
    (`deleted_at` IS NOT NULL)
    OR (`action` = 'translate' AND `translation` IS NOT NULL AND length(trim(`translation`)) > 0)
    OR (`action` = 'keep' AND `translation` IS NULL)
  ),
  CONSTRAINT `ck_term_translation_len` CHECK(`translation` IS NULL OR length(`translation`) <= 500)
);

CREATE UNIQUE INDEX `ux_term_norm_match` ON `term` (`term_norm`, `match_type`);
CREATE INDEX `ix_term_enabled_live` ON `term` (`enabled`) WHERE `deleted_at` IS NULL;
CREATE INDEX `ix_term_updated_at_live` ON `term` (`updated_at` DESC) WHERE `deleted_at` IS NULL;
CREATE INDEX `ix_term_deleted_at` ON `term` (`deleted_at`);

CREATE TABLE `setting` (
  `key` text PRIMARY KEY NOT NULL,
  `value_json` text NOT NULL,
  `updated_at` text NOT NULL,
  `rev` integer DEFAULT 0 NOT NULL,
  `origin_device` text NOT NULL,
  CONSTRAINT `ck_setting_value_json` CHECK(json_valid(`value_json`))
);
```

> `senses_json` 的 CHECK 只限制 ≤5 条，不限制 ≥1 条：墓碑会把内容清成 `'[]'`，数据库必须允许空数组；"live 行必须有 1–5 条义项"由应用层校验保证。

### 4.3 字段字典：`vocabulary`

| 字段              | 类型    | 空  | 说明                                                   |
| ----------------- | ------- | --- | ------------------------------------------------------ |
| `id`              | INTEGER | 否  | 自增主键；仅本地使用，不导出、不同步                   |
| `word`            | TEXT    | 否  | 展示用词条，保留用户收藏时的拼写                       |
| `word_norm`       | TEXT    | 否  | `trim + NFC + toLowerCase`；唯一键；同步合并键         |
| `phonetic_us`     | TEXT    | 否  | 美式音标；无则空串；UI 标「AI 生成」                   |
| `phonetic_uk`     | TEXT    | 是  | 英式音标；无则 NULL                                    |
| `context_sense`   | TEXT    | 是  | 语境义（中文）；无语境时 NULL                          |
| `context_snippet` | TEXT    | 是  | 语境片段，≤300 字符；设置关闭时不写入；墓碑 5 秒后清空 |
| `senses_json`     | TEXT    | 否  | JSON 数组，≤5 条；见 §4.5；墓碑清为 `[]`               |
| `source_title`    | TEXT    | 是  | 来源页面标题；不含完整 URL                             |
| `source_domain`   | TEXT    | 是  | 来源域名；只保留 host，不含路径/查询参数               |
| `tags_json`       | TEXT    | 否  | JSON 字符串数组，≤5 个；每个 ≤32 字符                  |
| `created_at`      | TEXT    | 否  | 首次收藏时间；复活墓碑时保留原值                       |
| `updated_at`      | TEXT    | 否  | 最近一次变更（内容、删除、撤销都算）                   |
| `rev`             | INTEGER | 否  | 同一行每次本地变更 +1；同步平局判定；默认 0            |
| `deleted_at`      | TEXT    | 是  | 软删除时间；NULL = 存活                                |
| `deleted_batch`   | TEXT    | 是  | 本地撤销批次 UUID；不同步、不导出                      |
| `origin_device`   | TEXT    | 否  | 当前版本的来源设备 UUID；同步 LWW 平局判定             |

### 4.4 字段字典：`term`

| 字段            | 类型    | 空  | 说明                                                   |
| --------------- | ------- | --- | ------------------------------------------------------ |
| `id`            | INTEGER | 否  | 自增主键；不导出、不同步                               |
| `term`          | TEXT    | 否  | 展示用词条                                             |
| `term_norm`     | TEXT    | 否  | `trim + NFC + toLowerCase`；与 `match_type` 组成唯一键 |
| `match_type`    | TEXT    | 否  | `exact` / `contains` / `regex`                         |
| `action`        | TEXT    | 否  | `keep`（不译）/ `translate`（固定译法）                |
| `translation`   | TEXT    | 是  | `action=translate` 时必填；`keep` 时必须 NULL          |
| `enabled`       | INTEGER | 否  | 0/1；默认 1                                            |
| `created_at`    | TEXT    | 否  | 创建时间                                               |
| `updated_at`    | TEXT    | 否  | 最近一次变更                                           |
| `rev`           | INTEGER | 否  | 同一行每次本地变更 +1；同步平局判定；默认 0            |
| `deleted_at`    | TEXT    | 是  | 软删除时间                                             |
| `deleted_batch` | TEXT    | 是  | 本地撤销批次；不同步                                   |
| `origin_device` | TEXT    | 否  | 同步 LWW 平局判定                                      |

> MVP 不存 `domain` / `origin`；术语只来自用户手动维护。术语自动抽取与 domain 延后 v1.1，届时再加可空列与迁移。

### 4.5 字段字典：`setting`

| 字段            | 类型    | 空  | 说明                                        |
| --------------- | ------- | --- | ------------------------------------------- |
| `key`           | TEXT    | 否  | 设置键，点分命名，如 `ui.theme`             |
| `value_json`    | TEXT    | 否  | JSON 值；标量或对象                         |
| `updated_at`    | TEXT    | 否  | 最近一次显式修改                            |
| `rev`           | INTEGER | 否  | 同一键每次本地变更 +1；同步平局判定；默认 0 |
| `origin_device` | TEXT    | 否  | 来源设备 UUID                               |

**只存可同步设置**；密钥与设备本地项仍在 `config.json`。默认值**不落行**：键不存在 = "本设备没有意见"，避免新设备用默认值覆盖远端设置。

**可同步设置白名单**：

| key                             | 类型    | 默认值   |
| ------------------------------- | ------- | -------- |
| `ui.theme`                      | string  | `system` |
| `ui.fontSize`                   | number  | `14`     |
| `ui.language`                   | string  | `system` |
| `capture.dotEnabled`            | boolean | `true`   |
| `capture.fullscreenSuppression` | boolean | `true`   |
| `capture.snippetEnabled`        | boolean | `true`   |
| `api.model`                     | string  | `''`     |
| `api.temperature`               | number  | `0`      |
| `api.timeoutMs`                 | number  | `30000`  |

**不同步**：`api.key`、`api.baseUrl`（可能含凭据或指向本机代理）、全局热键、白名单进程、开机自启、托盘提示、TTS 引擎/语音/语速、窗口大小/位置、数据库路径、同步目录/设备 ID、日志。

### 4.6 JSON 形状

`senses_json`：

```json
[
  { "pos": "n.", "def": "线索；思路", "example": "I lost the thread of the argument." },
  { "pos": "n.", "def": "线程", "example": "The worker thread is blocked on I/O." }
]
```

- 数组长度 1–5；`pos` / `def` 非空；`example` 为非空英文例句。
- 模型未返回 `example` 时写空串，并在 UI 显示「例句暂缺」；不因此拒绝收藏。
- 超过 5 条：应用层截断到 5 条（提示词已要求 ≤5）。
- 解析失败：该条收藏拒绝写入，返回内联错误；不写半成品。
- 墓碑：清为 `[]`，不参与 UI。

`tags_json`：

```json
["技术", "后端"]
```

- 字符串数组；最多 5 个；每个 ≤32 字符；去重、trim、忽略空串。

### 4.7 索引与约束清单

| 名称                            | 解决什么                                                                  |
| ------------------------------- | ------------------------------------------------------------------------- |
| `ux_vocabulary_word_norm`       | A-03 去重；upsert 冲突目标；复活墓碑；同步合并键稳定                      |
| `ix_vocabulary_created_at_live` | 生词本默认按收藏时间倒序，只索引存活行                                    |
| `ix_vocabulary_updated_at_live` | 最近更新列表；只索引存活行                                                |
| `ix_vocabulary_deleted_at`      | 清理任务按 `deleted_at` 扫描                                              |
| `ux_term_norm_match`            | 同一词不同匹配方式可共存；同一匹配方式不重复                              |
| `ix_term_enabled_live`          | 启动时加载 `enabled=1` 的存活术语                                         |
| `ix_term_updated_at_live`       | 术语列表按更新时间倒序                                                    |
| `ix_term_deleted_at`            | 清理任务                                                                  |
| `ck_*_json`                     | 防手写 SQL/导入写坏 JSON；`json_valid` 不够，必须再加 `json_type='array'` |
| `ck_*_len`                      | 防模型输出超长撑爆 UI/导出                                                |
| `ck_term_translation_pair`      | 数据库层面保证 keep/translate 配对，不写半成品                            |

---

## 5. 归一化与校验

### 5.1 归一化

- `word_norm = word.trim().normalize('NFC').toLowerCase()`；`term_norm` 同理。
- 只做大小写、首尾空白、Unicode NFC 归一；**不做词形还原**（`thread` 与 `threads` 是不同词）。
- 不用 SQLite 的 `lower()`：它只处理 ASCII；JS 的 `toLowerCase()` 是 Unicode-aware。
- 不用生成列：归一化是产品规则，要单测、要与搜索 pattern 共用同一函数；生成列会把规则藏进 DDL。
- `source_domain` 只保留 host（如 `martinfowler.com`），**禁止**存完整 URL。
- `tags_json` 去重、trim、忽略空串；最多 5 个。

### 5.2 写入前校验

模型输出是 untrusted；以下校验在 `db/validate.ts` 完成，与 B-04 的解析校验共用同一套规则：

- `senses` 1–5 条；`pos`/`def` 非空；`example` 允许空串；每条 ≤ 约定长度。
- `tags` ≤5 个、每个 ≤32 字符、去重。
- `context_snippet` ≤300；`context_sense` ≤1000。
- `term` 非空、≤200；`action=translate` 时 `translation` 非空；`action=keep` 时 `translation` 必须为空。
- `match_type=regex` 保存前必须能被 JS `RegExp` 编译；非法正则拒绝写入。
- 校验失败：返回内联错误，不写半成品。

数据库 CHECK 是第二道防线，覆盖 worker、未来导入、手工修库等绕过应用层的路径。

---

## 6. 写入语义

### 6.1 收藏（upsert + 复活）

```ts
const now = new Date().toISOString();
const rows = db
  .insert(vocabulary)
  .values({
    word,
    wordNorm,
    phoneticUs,
    phoneticUk,
    contextSense,
    contextSnippet,
    sensesJson,
    sourceTitle,
    sourceDomain,
    tagsJson,
    createdAt: now,
    updatedAt: now,
    rev: 1,
    deletedAt: null,
    deletedBatch: null,
    originDevice: deviceId,
  })
  .onConflictDoUpdate({
    target: vocabulary.wordNorm,
    set: {
      word: sql`excluded.word`,
      phoneticUs: sql`excluded.phonetic_us`,
      phoneticUk: sql`excluded.phonetic_uk`,
      contextSense: sql`excluded.context_sense`,
      contextSnippet: sql`excluded.context_snippet`,
      sensesJson: sql`excluded.senses_json`,
      sourceTitle: sql`excluded.source_title`,
      sourceDomain: sql`excluded.source_domain`,
      tagsJson: sql`CASE WHEN excluded.tags_json = '[]' THEN ${vocabulary.tagsJson} ELSE excluded.tags_json END`,
      deletedAt: sql`NULL`,
      deletedBatch: sql`NULL`,
      updatedAt: sql`excluded.updated_at`,
      rev: sql`${vocabulary.rev} + 1`,
      originDevice: sql`excluded.origin_device`,
    },
  })
  .returning({
    id: vocabulary.id,
    createdAt: vocabulary.createdAt,
    updatedAt: vocabulary.updatedAt,
  })
  .all();
```

- **单语句原子**：避免“查不到→插入”之间的竞态；唯一索引是最终防线。
- **复活墓碑**：`deleted_at = NULL`、`deleted_batch = NULL`；保留 `created_at`。
- **标签合并**：模型不返回标签时（`'[]'`）保留用户旧标签；一条语句完成，避免读-改-写。
- **新增/更新判定**：`created_at === now` → 新增；否则更新/复活。`changes()` 对 upsert 恒为 1，`lastInsertRowid` 在冲突更新时不可靠，均不使用。
- **版本号 `rev`**：每次本地写入 +1；应用远端记录时保留远端 `rev`。同步比较 `(updated_at, rev, origin_device)`，同一毫秒内的两次写入也能分出先后，不需要为了时间戳严格递增而先读旧行。

### 6.2 术语 upsert

```ts
db.insert(term)
  .values({
    term,
    termNorm,
    matchType,
    action,
    translation,
    enabled,
    createdAt: now,
    updatedAt: now,
    rev: 1,
    deletedAt: null,
    deletedBatch: null,
    originDevice: deviceId,
  })
  .onConflictDoUpdate({
    target: [term.termNorm, term.matchType],
    set: {
      term: sql`excluded.term`,
      action: sql`excluded.action`,
      translation: sql`excluded.translation`,
      enabled: sql`excluded.enabled`,
      deletedAt: sql`NULL`,
      deletedBatch: sql`NULL`,
      updatedAt: sql`excluded.updated_at`,
      rev: sql`${term.rev} + 1`,
      originDevice: sql`excluded.origin_device`,
    },
  })
  .run();
```

- `action=keep` 时 `translation` 必须 NULL；`action=translate` 时必须非空。
- 正则 `match_type=regex` 保存前必须可编译；非法正则拒绝写入。
- 术语语义冲突（如 `thread` exact keep 与 `thread` contains translate）由应用层提示，不交给 DB。

### 6.3 删除与撤销

**删除（单条 / 批量 / 清空生词本）**：

```ts
const batch = crypto.randomUUID();
const now = new Date().toISOString();
db.update(vocabulary)
  .set({
    deletedAt: now,
    deletedBatch: batch,
    updatedAt: now,
    rev: sql`${vocabulary.rev} + 1`,
    originDevice: deviceId,
  })
  .where(and(isNull(vocabulary.deletedAt), inArray(vocabulary.id, ids)))
  .run();
```

- 一个操作一个 `batch`，即使分 500 条/批执行，撤销时仍按同一个 batch 还原。
- 返回 `{ batch, count }`；渲染层显示「已删除 N 个单词 · 撤销」，5 秒。
- 删除的确认交互按 PRD/交互规格执行（批量删除需确认；清空生词本需输入 `delete`）；本契约只定义确认之后的数据语义。
- 清空生词本：`WHERE deleted_at IS NULL` 全量打墓碑，同一 batch；确认之后仍给 5 秒撤销。

**撤销**：

```ts
db.update(vocabulary)
  .set({
    deletedAt: null,
    deletedBatch: null,
    updatedAt: now,
    rev: sql`${vocabulary.rev} + 1`,
    originDevice: deviceId,
  })
  .where(eq(vocabulary.deletedBatch, batch))
  .run();
```

- 只保留**最近一次**删除操作的 toast；新的删除替换旧 toast。
- 撤销窗口 5 秒；窗口过后 toast 消失，墓碑仍在。
- 撤销后 `updated_at` 更新，下一次同步会把"复活"传播出去。

**两阶段清理**：

1. **5 秒后清内容**：把墓碑的内容字段清空，只留 key + 时间戳 + `rev` + `origin_device` + `deleted_batch`，供同步和审计使用：

```ts
db.update(vocabulary)
  .set({
    phoneticUs: '',
    phoneticUk: null,
    contextSense: null,
    contextSnippet: null,
    sensesJson: [],
    sourceTitle: null,
    sourceDomain: null,
    tagsJson: [],
  })
  .where(and(isNotNull(vocabulary.deletedAt), lt(vocabulary.deletedAt, fiveSecondsAgo)))
  .run();

// 术语墓碑：只清 translation；term / term_norm / match_type / action / enabled 保留
db.update(term)
  .set({ translation: null })
  .where(and(isNotNull(term.deletedAt), lt(term.deletedAt, fiveSecondsAgo)))
  .run();
```

2. **保留期后硬删除**：

```ts
db.delete(vocabulary)
  .where(and(isNotNull(vocabulary.deletedAt), lt(vocabulary.deletedAt, purgeCutoff)))
  .run();
```

- 保留期：同步关闭 30 天；同步开启 90 天（给离线设备留同步窗口）。
- 清理任务在启动时与每天一次执行；`deleted_at` 有索引。
- 超过保留期未同步的设备可能把已删除的词"复活"；设置页需写明。

**边界**：

- 删除后 5 秒内重新收藏同一个词：upsert 复活同一行并清掉 `deleted_batch`；toast 应主动消失，撤销成为 no-op。
- 撤销时该行已被远端同步改写：`deleted_batch` 已不匹配，撤销为 no-op；UI 静默关闭 toast。
- 远端墓碑：应用时立即删除并清内容（没有本地撤销条）；若本地记录更新，则本地赢，保留。
- 清空全部数据：不提供 5 秒撤销；要求输入 `delete`，并在清空前自动写一份完整备份（DB + config.json）。
- 术语删除：同一套字段与撤销逻辑。术语墓碑在 5 秒后把 `translation` 清为 NULL；`ck_term_translation_pair` 已允许 `deleted_at IS NOT NULL` 时跳过 keep/translate 配对约束。

### 6.4 设置写入

- 设置页自动保存；写 `setting` 表：插入时 `updated_at = now`、`rev = 1`、`origin_device = deviceId`；更新时 `rev = rev + 1`。
- 键不存在 = 使用默认值，**不落行**；只有用户显式修改才插入。
- 恢复默认：写入默认值 + 新 `updated_at`（显式操作，会同步出去）。
- 写失败：内联错误 + 重试，不阻塞其他设置。

---

## 7. 查询与索引

### 7.1 通用规则

- 所有生词本/术语查询必须带 `deleted_at IS NULL`；过滤集中在 repository 层。
- 列表默认 50 条/页；字母序 `ORDER BY word_norm ASC`（数据量小，允许 filesort）。
- 导出、计数、搜索一律排除墓碑。

### 7.2 生词本列表

```ts
db.select()
  .from(vocabulary)
  .where(isNull(vocabulary.deletedAt))
  .orderBy(desc(vocabulary.createdAt))
  .limit(limit)
  .offset(offset)
  .all();
```

- 走 `ix_vocabulary_created_at_live`。

### 7.3 搜索

```ts
const pattern = `%${escapeLike(query.trim().toLowerCase())}%`;
db.select()
  .from(vocabulary)
  .where(
    and(
      isNull(vocabulary.deletedAt),
      or(
        sql`${vocabulary.wordNorm} LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(coalesce(${vocabulary.contextSense}, '')) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${vocabulary.sensesJson}) LIKE ${pattern} ESCAPE '\\'`,
      ),
    ),
  )
  .orderBy(desc(vocabulary.createdAt))
  .limit(200)
  .all();
```

- `escapeLike` 转义 `\`、`%`、`_`。
- 搜索匹配词条、语境义、义项 JSON 文本；不搜标签（标签单独筛选）。
- 输入防抖 200ms；本地查询 ≤50ms；禁止网络请求。
- 数据量 >10,000 条时再评估 FTS5；v1 不引入。
- Drizzle 的 `like()` 不支持 `ESCAPE`，这里用 `sql` 模板；不为用 builder 牺牲语义。

### 7.4 标签筛选

```ts
sql`EXISTS (
  SELECT 1 FROM json_each(${vocabulary.tagsJson})
  WHERE json_each.value = ${tag}
)`;
```

- 精确匹配，天然处理引号/通配符；比 `LIKE '%"tag"%'` 正确。
- 多选标签：应用层取交集/并集（默认并集），最多 5 个。
- 标签筛选本身结果集小，无索引可接受。

### 7.5 术语列表与快照

```ts
db.select()
  .from(term)
  .where(and(isNull(term.deletedAt), eq(term.enabled, true)))
  .all();
```

- 启动时把 `enabled=1` 的存活术语全量加载进内存快照；写后重建。
- 这是唯一允许的"缓存"；列表/搜索结果不缓存。

### 7.6 不用的能力

- 不启用 Drizzle Relations / `db.query`：两张表无关联，core builder 足够。
- 不使用 FTS5：<10k 行 LIKE 足够。
- 不使用视图：过滤集中在 repository 一层，review 一个文件即可。

---

## 8. 导出

- 只导出存活行（`deleted_at IS NULL`）；墓碑不出现。
- 不导出 `id`、`rev`、`deleted_at`、`deleted_batch`、`origin_device`。
- CSV：UTF-8 with BOM；逗号分隔；RFC 4180；列顺序不变：

```text
word,phonetic_us,phonetic_uk,context_sense,context_snippet,senses_json,source_title,source_domain,tags,created_at
```

- JSON：`schemaVersion: 1` 不变；`senses` / `tags` 为数组；字段名保持 camelCase。
- **导出格式不因实现层更换而升版**：Drizzle/软删除是内部变化，不是数据契约变化。
- 导出前提示「包含你收藏的单词与语境片段」；系统保存对话框；失败内联错误 + 重试。
- 导出 1000 条 ≤2s；超过显示进度；worker 流式写，不阻塞主进程。
- **禁止**包含 API Key、Base URL、日志、完整原文。

---

## 9. 同步（v1.1，schema 已预留）

> MVP 不实现同步；`deleted_at` / `deleted_batch` / `rev` / `origin_device` / `setting` 表先落，避免 v1.1 二次迁移。

### 9.1 目标与非目标

- 目标：设置项与生词本（含术语）通过用户已有的云盘文件夹在多台 Windows 设备间同步；无服务器、无账号、无 OAuth。
- 非目标：实时协作、字段级合并、冲突解决 UI、加密同步、移动端。

### 9.2 架构

```text
本地 vocab.db（主进程唯一写者）
   ↕ 合并 / 导出
每设备快照 snapword-<deviceId>.json  →  用户选择的云盘文件夹
```

- **不把 `vocab.db` 放进云盘**：WAL/-shm、写锁、冲突副本、半同步文件会损坏数据库。
- **每设备只写自己的文件**：云盘不会出现两个写者；单实例锁避免同一设备多开。
- 云盘只负责搬文件；合并规则完全在应用里。

### 9.3 文件格式

```json
{
  "schemaVersion": 1,
  "deviceId": "0f0c2c9e-...",
  "generatedAt": "2026-11-04T12:00:00.000Z",
  "vocabulary": [
    {
      "word": "thread",
      "wordNorm": "thread",
      "phoneticUs": "/θred/",
      "phoneticUk": null,
      "contextSense": "讨论串",
      "contextSnippet": "a long thread about...",
      "senses": [{ "pos": "n.", "def": "讨论串", "example": "..." }],
      "sourceTitle": "Example page",
      "sourceDomain": "example.com",
      "tags": ["技术"],
      "createdAt": "2026-11-03T12:00:00.000Z",
      "updatedAt": "2026-11-03T12:00:00.000Z",
      "rev": 3,
      "deletedAt": null,
      "originDevice": "0f0c2c9e-..."
    }
  ],
  "terms": [],
  "settings": {
    "ui.theme": {
      "value": "dark",
      "updatedAt": "2026-11-03T12:00:00.000Z",
      "rev": 1,
      "originDevice": "0f0c2c9e-..."
    }
  }
}
```

- 数组按 key 排序，输出确定性、可 diff。
- 墓碑只保留 key + 时间戳 + `rev` + `originDevice`，**不包含**释义、音标、语境、来源、标签。
- 不包含 `id`、`deleted_batch`。
- `contextSnippet` 受"同步语境片段"开关控制；关闭时省略该字段。
- 原子写：临时文件 + rename；失败重试 3 次（Windows 下云盘客户端可能短暂锁文件）。

### 9.4 合并规则

- 合并键：`word_norm`、`(term_norm, match_type)`、setting `key`。
- 冲突：按记录 LWW，比较 `(updatedAt, rev, originDevice)` 字典序；大的赢。
- 应用远端记录时**保留远端 `updatedAt` / `rev` / `originDevice`**，不 bump；本地编辑才 bump。
- 远端墓碑比本地记录新 → 本地打墓碑并立即清内容；本地更新则本地赢。
- 远端存活记录比本地墓碑新 → 复活并写入远端内容。
- **"远端没有这条记录" ≠ 删除**；只有显式墓碑才删除。
- 应用远端记录在单个 `BEGIN IMMEDIATE` 事务内完成；失败整批回滚。
- 合并完成后写自己的快照；重复合并幂等。

### 9.5 触发与状态

- 启动后（迁移完成）同步一次。
- 本地写后 10 秒防抖；**防抖 > 5 秒撤销窗口**，快速撤销通常不会把墓碑发出去。
- 每 5 分钟一次；手动「立即同步」；退出前 flush。
- 不用 `fs.watch`：云盘客户端写入是异步的，watch 不可靠。
- 状态：`lastSyncAt`、`state`（idle/syncing/error）、`lastError`、`deviceCount`。
- 读取时按 `deviceId` 分组；同一设备多个文件（云盘冲突副本）取 `generatedAt` 最新的一个。
- `schemaVersion` 高于本地 → 跳过该文件并提示"另一台设备的版本更新"；JSON 解析失败 → 跳过并记录状态，不应用半截数据。
- 时钟偏差：远端 `generatedAt` 与本地差 >5 分钟时警告；LWW 可能丢编辑，文档要求系统时间自动同步。

### 9.6 隐私

- 云盘文件夹是**明文**；启用时明确提示。
- **语境片段默认不同步**，提供设备本地开关（独立于「语境片段是否入库」）；该开关不参与同步。
- API Key、Base URL、日志永不进同步文件。
- 墓碑只同步元数据，不同步被删除词的内容。
- 加密同步（口令派生密钥 + AES-GCM）不做进 MVP；作为独立功能评估。

---

## 10. 迁移

### 10.1 事实源与生成

- `schema.ts` → `drizzle-kit generate` → `drizzle/<timestamp>_<name>/migration.sql` + `snapshot.json`。
- v1 RC 的目录格式：**一迁移一目录、无 `_journal.json`**；`migrate()` 按目录名排序并匹配已应用记录。已实测确认。
- 生成物提交入库；迁移是用户数据的契约，必须 code review。
- 运行时绝不生成迁移；`drizzle-kit` 只作 devDependency。
- `packages/main/drizzle/`（迁移产物归 main 包所有）随安装包分发（`extraResources`）；开发期用 `app.getAppPath()/packages/main/drizzle` 定位，打包后用 `process.resourcesPath/drizzle`。`migrate()` 用 `fs` 读盘，目录缺失会直接失败；asar 内也能读，但必须确保目录真的被拷进包。
- **唯一允许手改生成 SQL 的场景**：rc.5 的 #6165 会让 `setting.key` 这种 TEXT 主键丢掉 `NOT NULL`。初始迁移生成后手工补 `NOT NULL`，并在迁移目录注释里记录原因；snapshot 会把两边归一化，不会产生漂移；CI 用 `PRAGMA table_info(setting)` 断言 `notnull=1`。除此之外禁止手改。

### 10.2 运行时

```ts
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

migrate(db, { migrationsFolder }); // 同步；不要放进 async 回调
```

- node:sqlite 是同步驱动，`migrate()` **同步执行**；`await` 也能跑，但没有必要。
- 实测：整批 pending 迁移在**一个 deferred `BEGIN`** 里执行，任一失败全部回滚（不是每个迁移一个事务）。
- 迁移选择按**目录名**匹配 `__drizzle_migrations.name`；**不校验 hash**；数据库里有本地不存在的已应用迁移时，`migrate()` 会**忽略**而不是报错——所以必须在调用前用 §10.3 的守卫自己检测。
- 迁移记录表：`__drizzle_migrations`（由 migrator 创建，v1 列为 `id`、`hash`、`created_at`、`name`、`applied_at`）。
- 把该表当半黑盒：只读 `name` 做版本守卫，不按 `id`/`hash` 查询。
- 旧 v0 三列表会被自动升级；本项目从 v1 RC 新库开始，不依赖这条路径。

### 10.3 版本守卫（替代 `user_version`）

> 以下 `client` 指迁移连接（`enableForeignKeyConstraints: false`），守卫必须在 `migrate()` 之前执行。

```ts
const local = localMigrationNames(migrationsFolder); // 目录名，升序
const applied = appliedMigrationNames(client); // __drizzle_migrations.name

const unknown = applied.filter((n) => !local.includes(n));
if (unknown.length > 0) {
  throw new DbNewerThanAppError(unknown); // 数据库来自更新版本
}

const pending = local.filter((n) => !applied.includes(n));
if (pending.length > 0) backupDatabase();

migrate(db, { migrationsFolder }); // 同步

const after = appliedMigrationNames(client);
const missing = local.filter((n) => !after.includes(n));
if (missing.length > 0) {
  throw new MigrationIncompleteError(missing); // 迁移未真正应用
}
```

- **库比代码新**：拒绝写入，提示「数据库来自更新版本」，只读/退出。`migrate()` 自己不会报错，守卫必须在调用前做。
- **迁移没真正应用**：报错并恢复迁移前备份，不带着半迁移的库继续运行。
- `localMigrationNames` 只统计 `^\d{14}_` 的目录，忽略其他文件/目录；`appliedMigrationNames` 在 `__drizzle_migrations` 不存在时返回空数组（首次启动）。
- 本项目从 v1 RC 新库开始，不兼容 v0 三列迁移表；若检测到 `name` 列不存在，按旧版本/损坏处理，不做自动升级。
- 这比 `user_version` 更直接：v1 的迁移表自带 `name`，不需要再维护一个整数版本号。
- 若未来升级 Drizzle 大版本改变了该表结构，必须复核守卫并更新本契约。

### 10.4 备份

1. 检测到 pending 迁移时，先 `PRAGMA wal_checkpoint(TRUNCATE)`。
2. 复制 `vocab.db` → `vocab.db.bak-<timestamp>-<appliedCount>`。
3. 执行迁移。
4. 失败：恢复备份；保留损坏副本；提示用户。
5. 备份保留最近 3 份；迁移备份不计入 3 份上限。

### 10.5 失败与回滚

- 迁移失败：`ROLLBACK`；用备份覆盖 `vocab.db`；保留损坏副本；提示。
- 迁移只向前，不写 down migration：SQLite 的 down 在有损场景（删列/改类型）无法真正还原；文件备份才是可靠降级。
- 已应用的迁移文件**禁止修改**：Drizzle 不校验 hash，改了不会重跑也不会报错；**禁止重命名**迁移目录（会按新名字重跑）。
- **迁移连接必须关外键**：rc.5 的 `migrate()` 整批在一个事务里；`PRAGMA foreign_keys=OFF` 在事务内是 no-op，drizzle-kit 生成的表重建会 `DROP TABLE`，若外键开着，`ON DELETE CASCADE` 会静默删子表（#5782/#6621）。用 `new DatabaseSync(path, { enableForeignKeyConstraints: false })` 打开迁移连接，迁移完关闭，再用运行时连接开启外键。
- 生成 SQL 出现 `__new_` 表重建时，必须人工 review；v1.1 加外键时**不用 `ON DELETE CASCADE`**，改为显式删除；即使如此，迁移连接仍保持外键关闭。

### 10.6 CI 检查

- `drizzle-kit generate` 后 `git diff --exit-code packages/main/drizzle`：schema 改了但迁移没提交 → 失败。
- 每个迁移目录必须有非空 `migration.sql`；禁止空文件（Drizzle 会向驱动传空语句导致崩溃）。
- 禁止尾部 `--> statement-breakpoint` 或空白语句；手写/自定义迁移的每条语句之间必须有 `--> statement-breakpoint`，否则 `prepare()` 只执行第一条，后面的静默丢失。
- 迁移目录名严格递增；禁止删除/重命名已提交的迁移目录。
- 已有迁移文件只允许新增，不允许修改/删除（`git diff --name-status` 检查 `M`/`D`）；唯一例外是 #6165 的 `setting.key` NOT NULL 补丁，需在迁移目录注释中记录。
- 迁移后跑 `PRAGMA table_info(setting)`，断言 `key` 的 `notnull=1`。
- `*.sql` 强制 LF（`.gitattributes`），避免 CRLF 改变 hash。
- `drizzle-kit` 在 Node 环境/CI 运行，不在 Electron 运行时运行：它是 CLI + esbuild，不是应用依赖；node:sqlite 下不存在 better-sqlite3 的 ABI 问题，但把 kit 打进运行时仍然会引入不必要的体积与攻击面。
- 打包冒烟：确认 `node:sqlite` 被当作内置模块 external；若用 rspack/webpack，给 `drizzle-orm` 标记 side-effectful 或关闭 scope hoisting（#5387 的 `entityKind` 问题）。

---

## 11. 备份、损坏与恢复

| 场景                        | 处理                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| `SQLITE_CORRUPT` / 无法打开 | 关闭连接；文件重命名为 `vocab.corrupt-<timestamp>.db`；新建空库；托盘提示 |
| 迁移失败                    | 回滚；恢复迁移前备份；保留损坏副本；提示                                  |
| 迁移未完整应用              | 报错；恢复备份；不继续启动写入                                            |
| 数据库来自更新版本          | 拒绝写入；提示；只读/退出                                                 |
| 写锁超时                    | 重试 1 次（50ms/150ms）；仍失败内联错误「保存失败 · 重试」                |
| 磁盘满                      | 内联错误；不删除旧数据；提示清理                                          |
| 用户误删                    | 5 秒撤销；之后从备份恢复（README 说明备份路径）                           |
| 清空全部数据                | 输入 `delete` 确认；清空前自动备份 DB + config.json                       |

备份文件保留最近 3 份；迁移备份不计入 3 份上限。

---

## 12. 并发与事务

- 单写者：只有主进程写；worker 只读。
- 迁移连接与运行时连接分开：迁移连接 `enableForeignKeyConstraints: false`，运行时连接 `foreign_keys=ON`；迁移完关闭迁移连接。
- 收藏/术语保存：单条 `BEGIN IMMEDIATE` 事务；批量删除单事务（可分 500 条/批，但共享一个 batch）。
- 事务回调必须同步；`db.transaction(async (tx) => ...)` 在 JS 下不会报错，会立即提交并留下未处理的 Promise rejection。
- 导出：只读事务/快照，避免长事务阻塞写。
- 同步合并：主进程单事务应用；文件读取可在事务外。
- `SQLITE_BUSY` 最多重试 2 次，间隔 50ms/150ms；每个连接都要设置 `timeout`/`busy_timeout`（默认 0 会立刻失败）。
- `WAL` 只在数据库创建时设置一次；多连接并发设置 `journal_mode=WAL` 可能抛 `SQLITE_BUSY`。
- 退出前 `wal_checkpoint(TRUNCATE)`；异常退出由 SQLite 恢复。
- `node:sqlite` 的 `DatabaseSync` 连接不跨线程共享；worker 自己打开只读连接（`new DatabaseSync(path, { readOnly: true, timeout: 5000 })`，已实测只读连接能看到已提交的 WAL 数据）。

---

## 13. 隐私与保留

| 数据           | 保留                                                      | 说明                                           |
| -------------- | --------------------------------------------------------- | ---------------------------------------------- |
| 生词本（存活） | 直到用户删除                                              | 明文 SQLite；README 明示路径                   |
| 生词本墓碑     | 内容 5 秒后清空；元数据 30/90 天                          | 5 秒内供撤销；之后只留 key + 时间戳供同步      |
| 术语表（存活） | 直到用户删除                                              | 明文 SQLite                                    |
| 术语墓碑       | 内容 5 秒后清空（`translation` 置 NULL）；元数据 30/90 天 | 5 秒内供撤销；之后只留 key + 时间戳供同步      |
| 可同步设置     | 直到用户修改/删除                                         | `setting` 表；不含密钥                         |
| 语境片段       | 直到用户删除/关闭开关                                     | ≤300 字符；关闭后新收藏不写入；墓碑 5 秒后清空 |
| 同步文件       | 直到用户删除/关闭同步                                     | 云盘明文；墓碑仅元数据；片段默认不同步         |
| 会话历史       | 应用运行期                                                | 内存；退出清空                                 |
| 日志           | 7 天                                                      | 文件；脱敏；不含原文/译文/Key                  |
| 临时音频       | 退出清理                                                  | `temp/`                                        |

**禁止**：数据库存完整原文段落、API Key、Base URL、日志正文；同步文件存 API Key、Base URL、日志、被删除词的内容。

---

## 14. 测试与 CI

| 测试         | 内容                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| 迁移测试     | 内存库跑真实 `migrate()`；断言表/索引/约束；不用 `push` 建测试库                                               |
| 迁移安全测试 | 迁移连接外键关闭；构造带 `ON DELETE CASCADE` 的表重建迁移，断言子表数据仍在（#5782/#6621）                     |
| 主键测试     | `PRAGMA table_info(setting)` 断言 `key` 的 `notnull=1`（#6165 补丁生效）                                       |
| 仓储测试     | 收藏 upsert、复活、标签合并、搜索、标签筛选、术语 CHECK                                                        |
| 撤销测试     | 删除 → 5 秒内撤销；超时 → 内容清空；保留期 → 硬删除；重复收藏 → 撤销条失效                                     |
| 同步测试     | 双/三设备快照、LWW、墓碑、缺席不删除、冲突副本、schemaVersion、时钟偏差                                        |
| 打包冒烟     | Electron 主进程 `require('node:sqlite')`；`migrate()` 从 asar/extraResources 读迁移；`node:sqlite` 被 external |
| DDL 快照     | 迁移后的 `sqlite_master` 规范化快照；schema 变更必须显式更新                                                   |
| 恢复测试     | 损坏文件、迁移失败、库比代码新、磁盘满                                                                         |
| 性能         | 单条查询 <5ms；搜索 <50ms（<10k 行）；导出 1000 条 ≤2s                                                         |

---

## 15. 验收 SQL

> 在 `drizzle-kit generate` + `migrate()` 之后执行；实际 DDL 以生成文件为准。

```sql
-- 1. 表存在
SELECT name FROM sqlite_master
WHERE type = 'table' AND name IN ('vocabulary', 'term', 'setting');

-- 2. 唯一键 + 复活（第二次应更新而非新增，且 deleted_at 为 NULL）
INSERT INTO vocabulary (
  word, word_norm, phonetic_us, senses_json, tags_json,
  created_at, updated_at, origin_device
) VALUES (
  'Thread', 'thread', '/θred/',
  '[{"pos":"n.","def":"线索","example":"I lost the thread of the argument."}]',
  '[]', '2026-11-03T12:00:00.000Z', '2026-11-03T12:00:00.000Z', 'test-device'
)
ON CONFLICT(word_norm) DO UPDATE SET
  deleted_at = NULL, deleted_batch = NULL,
  updated_at = excluded.updated_at, origin_device = excluded.origin_device;

SELECT count(*) FROM vocabulary WHERE word_norm = 'thread'; -- 1

-- 3. JSON 标量必须被拒绝（应失败）
INSERT INTO vocabulary (word, word_norm, senses_json, tags_json, created_at, updated_at, origin_device)
VALUES ('bad', 'bad', '5', '[]', '2026-11-03T12:00:00.000Z', '2026-11-03T12:00:00.000Z', 'test-device');

-- 4. 术语 keep 不允许 translation
INSERT INTO term (term, term_norm, match_type, action, translation, enabled, created_at, updated_at, origin_device)
VALUES ('thread', 'thread', 'exact', 'keep', NULL, 1, '2026-11-03T12:00:00.000Z', '2026-11-03T12:00:00.000Z', 'test-device');

-- 5. 术语 translate 必须有译文（应失败）
INSERT INTO term (term, term_norm, match_type, action, translation, enabled, created_at, updated_at, origin_device)
VALUES ('hook', 'hook', 'exact', 'translate', NULL, 1, '2026-11-03T12:00:00.000Z', '2026-11-03T12:00:00.000Z', 'test-device');

-- 6. 搜索（只搜存活行）
SELECT word FROM vocabulary
WHERE deleted_at IS NULL AND word_norm LIKE '%thread%' ESCAPE '\';

-- 7. 标签精确筛选
SELECT v.word FROM vocabulary v
WHERE v.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM json_each(v.tags_json) WHERE json_each.value = '技术');

-- 8. 迁移记录
SELECT name FROM __drizzle_migrations ORDER BY name;
```

---

## 16. 与 UI/提示词的对应

| 字段                             | UI 位置               | 提示词字段               |
| -------------------------------- | --------------------- | ------------------------ |
| `word`                           | 卡片词头 / 生词本列表 | `word`                   |
| `phonetic_us`                    | 词头下方              | `phonetic_us`            |
| `phonetic_uk`                    | 词头下方（弱化）      | `phonetic_uk`            |
| `context_sense`                  | 语境义置顶块          | `context_sense`          |
| `context_snippet`                | 语境义下方原句片段    | `context_snippet`（≤50） |
| `senses_json`                    | 全部义项（≤5）        | `senses`                 |
| `source_title` / `source_domain` | 生词本详情来源        | 不由模型生成             |
| `tags_json`                      | 生词本标签            | 不由模型生成             |
| `created_at` / `updated_at`      | 列表时间              | 不由模型生成             |
| `deleted_at` / `deleted_batch`   | 删除撤销条 / 撤销     | 不由模型生成             |
| `setting.*`                      | 设置页（可同步项）    | 不由模型生成             |

> 提示词返回的 `context_snippet` ≤50 字符；保存时优先使用本地语境片段（≤300），缺失时回退到模型返回的 ≤50 片段。

---

## 17. 已核对与待回填

### 17.1 已核对（2026-11-04）

以下在 Windows 上用 Electron 38.8.6 / 39.8.10 / 40.10.6 / 41.10.7 / 42.11.18 / 45.2.2，配合 `drizzle-orm@1.0.0-rc.5` + `drizzle-kit@1.0.0-rc.5` 实测通过：

- **Electron 版本**：推荐 **42.11.18 或 45.2.2**（Node 24.19/24.22，SQLite 3.53.3/3.53.4，`node:sqlite` 无 `ExperimentalWarning`）。38/39 可用但 Node 22 会打 experimental warning；**37.2.0–37.2.2 不可用**（`No such binding: sqlite`，37.2.3 修复）；34 及更早没有 `node:sqlite`。
- **可用位置**：主进程与 `utilityProcess.fork()` 都能 `require('node:sqlite')`；renderer/preload 不可用，DB 操作必须留在主进程。
- **`DatabaseSync`**：支持 `readOnly`、`enableForeignKeyConstraints`、`timeout`；没有 `pragma()` / `transaction()` 辅助方法；`exec` 执行多语句并丢弃结果；读 PRAGMA 结果用 `prepare().get()`；`.run()` 返回 `{ changes, lastInsertRowid }`；`.all()` / `.get()` 正常；worker 线程各自打开连接，不能共享对象。
- **Drizzle rc.5**：`drizzle-orm/node-sqlite`；`drizzle({ client })` 后 `db.$client === client`；`migrate()` **同步**；事务同步，支持 `behavior: 'immediate'`；`.returning()` 正常。
- **`migrate()` 行为**：整批 pending 迁移在一个 deferred 事务里；按目录名匹配 `__drizzle_migrations.name`；不校验 hash；数据库有本地不存在的已应用迁移时**忽略**（所以 §10.3 的守卫必须自己检测）；v0 三列表会自动升级。
- **SQLite 能力**：`RETURNING`、JSON1、`json_type`、部分索引、生成列、WAL、只读连接（能看到已提交 WAL 数据）均可用；Electron 42/45 的 SQLite 3.53.x 满足全部要求。
- **打包**：CJS/ESM 都可；asar 内可以读迁移；esbuild 会把 `node:sqlite` 当内置模块 external。

**本项目 P4 仍需复现的 4 件事**：

1. 锁 Electron 42.11.18 或 45.2.2。
2. 用真实 `schema.ts` 跑 `drizzle-kit generate` + `migrate()`，确认 DDL 与 §4.2 一致，并补上 `setting.key` 的 `NOT NULL` 补丁。
3. 选 bundler（electron-vite/esbuild），确认 `node:sqlite` external；若用 rspack/webpack，处理 #5387。
4. 确认 rc.5 的缺陷可接受；不可接受则回退 `drizzle-orm@0.45.4` + `better-sqlite3`（或同 RC + better-sqlite3）。

### 17.2 文档回填

已完成（2026-11-04）：

- `docs/interaction-spec-v2.md`：13.4 RM-05/RM-06 删除撤销、RM-07a 云盘同步（v1.1）、RM-12 数据安全、13.5 RX-10 持久化边界、IA-37~IA-41、SY-01~SY-06。
- `docs/interaction-spec-v2.md`：§6.5/§6.6 删除与撤销条、§6.7.1 云盘同步、§6.10 边界三问；验收见 `docs/PRD.md` 第十五章（IA-01~IA-44 + SY-01~SY-06）。
- `docs/progress-checklist.md`：B-03 升 v2.0；撤销进 MVP；同步作为 v1.1 里程碑；验收编号同步。
- `README.md`：数据与隐私路径、备份、同步边界。

仍待回填：

- `docs/PRD.md`（v3.0）不回溯合并前的历史口径；如需核对旧版，以 git 历史为准。
- B-05 测试用例集需要新增撤销与同步用例（同步用例可标 v1.1）。

### 17.3 rc.5 已知缺陷与规避

| 缺陷                                                           | 影响                                      | 规避                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| #5782 / #6621：SQLite 表重建 + `ON DELETE CASCADE`             | 静默删除子表数据，迁移仍报告成功          | 迁移连接 `enableForeignKeyConstraints: false`；review `__new_` 重建；v1.1 不用 CASCADE |
| #6165：TEXT / 非整数主键丢掉 `NOT NULL`                        | SQLite 允许多行 `NULL` 主键               | `setting.key` 初始迁移手工补 `NOT NULL`；CI 断言 `PRAGMA table_info`                   |
| #6531：`onConflictDoNothing({ target, where })` + 部分唯一索引 | 生成非法 SQL                              | 不用部分索引作为冲突目标；我们的 upsert 用全量唯一索引                                 |
| #5387：`sideEffects: false` + `entityKind`                     | rspack/webpack 生产包 `ReferenceError`    | 用 esbuild/Rollup，或标记 `drizzle-orm` side-effectful / 关闭 scope hoisting           |
| 不校验 hash、按名字选择                                        | 改已应用迁移被静默忽略；重命名目录会重跑  | 迁移 append-only；禁止改名                                                             |
| 整批一个事务                                                   | 任一迁移失败回滚整批                      | 迁移保持小步；迁移前备份                                                               |
| 默认 `busy_timeout=0`                                          | 并发时立刻 `SQLITE_BUSY`                  | 每个连接设 `timeout` / `PRAGMA busy_timeout`                                           |
| `prepare()` 只执行第一条语句                                   | 手写迁移静默丢语句                        | 每条语句之间加 `--> statement-breakpoint`                                              |
| Node 26 类名 `DatabaseSync` → `Database`                       | 未来 Electron 版本可能出 deprecation 提示 | 关注 Electron 的 Node 版本；rc.5 仍用 `DatabaseSync`                                   |
