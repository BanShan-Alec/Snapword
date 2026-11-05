import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { findRepoRoot } from '../build/lib/repo-paths.ts';
import { closeDatabase, getDb, initializeDatabase } from '../packages/main/src/db/client.ts';

/**
 * B-03 v2.0 数据库冒烟：
 * 临时目录建空库 → 迁移名集合守卫（§10.3）→ migrate() → DDL / 迁移表断言。
 * 必须真实走 migrate()，不得用 drizzle-kit push 代替。
 */

const MIGRATION_DIR_PATTERN = /^\d{14}_/;

function localMigrationNames(migrationsFolder: string): string[] {
  return fs
    .readdirSync(migrationsFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && MIGRATION_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function appliedMigrationNames(client: DatabaseSync): string[] {
  const migrationsTable = client
    .prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  if (!migrationsTable) {
    return [];
  }

  const rows = client.prepare('SELECT name FROM __drizzle_migrations ORDER BY id;').all() as Array<{
    name: string;
  }>;
  return rows.map((row) => row.name);
}

/** §10.3 守卫：数据库里不能有本地不存在的迁移（库比代码新）。 */
function assertNoUnknownMigrations(client: DatabaseSync, local: string[]): void {
  const applied = appliedMigrationNames(client);
  const unknown = applied.filter((name) => !local.includes(name));
  assert.deepEqual(
    unknown,
    [],
    `database has migrations newer than this app: ${unknown.join(', ')}`,
  );
}

function tableNames(client: DatabaseSync): string[] {
  const rows = client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;")
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

const repoRoot = findRepoRoot(__dirname);
const migrationsFolder = path.join(repoRoot, 'drizzle');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapword-db-smoke-'));
const dbPath = path.join(tempDir, 'vocab.db');

try {
  const local = localMigrationNames(migrationsFolder);
  assert.equal(
    local.length,
    1,
    `expected exactly one local migration at this stage, got: ${local.join(', ') || '(none)'}`,
  );

  // 1) 空库 + 迁移名守卫（必须在 migrate() 之前）
  const guardClient = new DatabaseSync(dbPath, {
    enableForeignKeyConstraints: false,
    timeout: 5000,
  });
  try {
    guardClient.exec('PRAGMA busy_timeout = 5000;');
    assertNoUnknownMigrations(guardClient, local);
    assert.deepEqual(
      appliedMigrationNames(guardClient),
      [],
      'fresh database must have no applied migrations',
    );
  } finally {
    guardClient.close();
  }

  // 2) 真实迁移 + 运行时连接
  initializeDatabase({ dbPath, migrationsFolder });
  const db = getDb();
  const client = db.$client;

  // 3) 三张表存在
  const tables = tableNames(client);
  for (const expected of ['setting', 'term', 'vocabulary']) {
    assert.ok(tables.includes(expected), `missing table: ${expected} (got: ${tables.join(', ')})`);
  }

  // 4) rc.5 #6165：setting.key 必须是 NOT NULL
  const settingColumns = client.prepare('PRAGMA table_info(setting);').all() as Array<{
    name: string;
    notnull: number;
  }>;
  const keyColumn = settingColumns.find((column) => column.name === 'key');
  assert.ok(keyColumn, 'setting.key column not found');
  assert.equal(keyColumn.notnull, 1, 'setting.key must be NOT NULL (rc.5 #6165 patch)');

  // 5) __drizzle_migrations 恰好一行，且 name 与本地迁移目录名一致
  const applied = appliedMigrationNames(client);
  assert.deepEqual(
    applied,
    local,
    `applied migrations ${applied.join(', ')} != local ${local.join(', ')}`,
  );
  const migrationCount = client
    .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations;')
    .get() as { count: number };
  assert.equal(migrationCount.count, 1, '__drizzle_migrations must contain exactly one row');

  // 6) 运行时连接 PRAGMA
  const foreignKeys = client.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
  assert.equal(foreignKeys.foreign_keys, 1, 'runtime connection must have foreign_keys=ON');
  const journalMode = client.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
  assert.equal(journalMode.journal_mode.toLowerCase(), 'wal', 'journal_mode must be wal');

  console.log(`DB_SMOKE_OK migrations=${applied.join(',')} tables=${tables.join(',')}`);
} finally {
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
