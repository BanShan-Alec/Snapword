import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

/**
 * B-03 §3：主进程使用两个连接。
 * - 迁移连接：`enableForeignKeyConstraints: false`，规避 rc.5 #5782/#6621
 *   （`migrate()` 把整批迁移放在一个事务里，事务内 `PRAGMA foreign_keys=OFF` 是 no-op）。
 * - 运行时连接：`foreign_keys=ON`、`synchronous=NORMAL`、`busy_timeout=5000`。
 *
 * WAL 只在启动时由迁移连接设置一次；运行时连接不重复设置，避免并发
 * `journal_mode=WAL` 触发 SQLITE_BUSY（B-03 §3）。
 */

export type DatabaseInitOptions = {
  /** 数据库文件路径（开发期为 `app.getPath('userData')/vocab.db`） */
  dbPath: string;
  /** 迁移目录（包含 `<timestamp>_<name>/migration.sql`）；主进程接线时用 resolveMigrationsFolder() 计算 */
  migrationsFolder: string;
};

/** 迁移目录名格式（B-03 §10.3：只统计 `^\d{14}_`，忽略其他文件/目录） */
const MIGRATION_DIR_PATTERN = /^\d{14}_/;

/** 数据库来自更新版本：已应用的迁移在本地不存在（B-03 §10.3） */
export class DbNewerThanAppError extends Error {
  constructor(readonly unknownMigrations: string[]) {
    super(`database has migrations newer than this app: ${unknownMigrations.join(', ')}`);
    this.name = 'DbNewerThanAppError';
  }
}

/** 迁移未真正落库：本地迁移名未全部出现在 __drizzle_migrations（B-03 §10.3） */
export class MigrationIncompleteError extends Error {
  constructor(readonly missingMigrations: string[]) {
    super(`migrations were not applied: ${missingMigrations.join(', ')}`);
    this.name = 'MigrationIncompleteError';
  }
}

/** 旧版/损坏的迁移表：缺少 `name` 列，无法做版本守卫（B-03 §10.3） */
export class MigrationTableUnsupportedError extends Error {
  constructor() {
    super('__drizzle_migrations has no name column; database is from an unsupported version');
    this.name = 'MigrationTableUnsupportedError';
  }
}

export interface MigrationsFolderContext {
  isPackaged: boolean;
  /** 开发期 `app.getAppPath()` */
  appPath: string;
  /** 打包后 `process.resourcesPath` */
  resourcesPath: string;
}

/**
 * 计算迁移目录（B-03 §10.1）：迁移产物归 main 包所有——
 * 开发期 `app.getAppPath()/packages/main/drizzle`，
 * 打包后 `process.resourcesPath/drizzle`（electron-builder extraResources）。
 */
export function resolveMigrationsFolder({
  isPackaged,
  appPath,
  resourcesPath,
}: MigrationsFolderContext): string {
  return isPackaged
    ? path.join(resourcesPath, 'drizzle')
    : path.join(appPath, 'packages', 'main', 'drizzle');
}

/** 本地迁移目录名（升序）；目录不存在时直接抛错，避免 migrate() 读到空目录。 */
function localMigrationNames(migrationsFolder: string): string[] {
  return readdirSync(migrationsFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && MIGRATION_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** 已应用的迁移名；迁移表不存在（首次启动）时返回空数组。 */
function appliedMigrationNames(client: DatabaseSync): string[] {
  const migrationsTable = client
    .prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  if (!migrationsTable) {
    return [];
  }

  const columns = client.prepare('PRAGMA table_info(__drizzle_migrations);').all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === 'name')) {
    throw new MigrationTableUnsupportedError();
  }

  const rows = client.prepare('SELECT name FROM __drizzle_migrations ORDER BY id;').all() as Array<{
    name: string;
  }>;
  return rows.map((row) => row.name);
}

/** 迁移前备份（B-03 §10.4）：先 checkpoint，再复制 db 文件。 */
function backupDatabase(client: DatabaseSync, dbPath: string, appliedCount: number): string {
  client.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const backupPath = `${dbPath}.bak-${Date.now()}-${appliedCount}`;
  copyFileSync(dbPath, backupPath);
  return backupPath;
}

// drizzle-orm rc.5 的 `drizzle()` 配置只接受 `relations`（1.0 起不再接受 `schema`）；
// `schema.ts` 仍是 drizzle-kit 生成与查询构建的唯一事实源。
const createDb = (client: DatabaseSync) => drizzle({ client });

export type AppDb = ReturnType<typeof createDb>;

let db: AppDb | null = null;

function readJournalMode(client: DatabaseSync): string | undefined {
  const row = client.prepare('PRAGMA journal_mode;').get() as { journal_mode?: string } | undefined;
  return row?.journal_mode;
}

function enableWalOnce(client: DatabaseSync): void {
  // 只在数据库尚未处于 WAL 时设置；已创建过的库不再重复设置。
  if (readJournalMode(client)?.toLowerCase() === 'wal') {
    return;
  }
  client.exec('PRAGMA journal_mode = WAL;');
}

/**
 * 打开数据库并把所有 pending 迁移应用完，然后建立运行时连接。
 * 迁移连接在 `migrate()` 返回后立即关闭（B-03 §3）。
 */
export function initializeDatabase({ dbPath, migrationsFolder }: DatabaseInitOptions): AppDb {
  if (db) {
    throw new Error('Database is already initialized; call closeDatabase() first.');
  }

  mkdirSync(path.dirname(dbPath), { recursive: true });

  // 1) 迁移连接：外键关闭；rc.5 的 migrator 整批迁移在一个 deferred 事务中执行。
  const migrationClient = new DatabaseSync(dbPath, {
    enableForeignKeyConstraints: false,
    timeout: 5000,
  });
  try {
    enableWalOnce(migrationClient);
    migrationClient.exec('PRAGMA busy_timeout = 5000;');

    // B-03 §10.3：migrate() 会静默忽略「库比代码新」，必须先做迁移名守卫。
    const local = localMigrationNames(migrationsFolder);
    const applied = appliedMigrationNames(migrationClient);
    const unknown = applied.filter((name) => !local.includes(name));
    if (unknown.length > 0) {
      throw new DbNewerThanAppError(unknown);
    }

    // B-03 §10.4：有 pending 迁移时先 checkpoint + 备份，失败可回退到迁移前文件。
    const pending = local.filter((name) => !applied.includes(name));
    if (pending.length > 0) {
      backupDatabase(migrationClient, dbPath, applied.length);
    }

    migrate(drizzle({ client: migrationClient }), { migrationsFolder });

    // B-03 §10.3：migrate() 返回不代表全部落库，必须断言本地迁移名都在表中。
    const after = appliedMigrationNames(migrationClient);
    const missing = local.filter((name) => !after.includes(name));
    if (missing.length > 0) {
      throw new MigrationIncompleteError(missing);
    }
  } finally {
    migrationClient.close();
  }

  // 2) 运行时连接：外键开启；WAL 已由迁移连接设置，这里不再设置 journal_mode。
  const client = new DatabaseSync(dbPath, { timeout: 5000 });
  client.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);

  db = createDb(client);
  return db;
}

/** 获取已初始化的运行时 Drizzle 实例。 */
export function getDb(): AppDb {
  if (!db) {
    throw new Error('Database is not initialized: call initializeDatabase() first.');
  }
  return db;
}

/** 退出前 checkpoint 并关闭运行时连接（B-03 §3）。 */
export function closeDatabase(): void {
  if (!db) {
    return;
  }

  const client = db.$client;
  db = null;
  try {
    client.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // checkpoint 只是退出前的尽力而为，不能阻止连接关闭。
  } finally {
    client.close();
  }
}
