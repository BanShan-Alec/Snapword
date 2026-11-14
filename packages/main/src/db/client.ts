import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

export class DbNewerThanAppError extends Error {
  constructor(public unknownMigrations: string[]) {
    super(
      `Database schema is newer than application. Unknown migrations: ${unknownMigrations.join(', ')}`,
    );
    this.name = 'DbNewerThanAppError';
  }
}

export class MigrationIncompleteError extends Error {
  constructor(public missingMigrations: string[]) {
    super(
      `Database migrations were not completely applied. Missing: ${missingMigrations.join(', ')}`,
    );
    this.name = 'MigrationIncompleteError';
  }
}

export interface DatabaseInitOptions {
  dbPath?: string;
  migrationsFolder?: string;
  timeout?: number;
}

let currentDb: NodeSQLiteDatabase | null = null;
let currentClient: DatabaseSync | null = null;

export function getDefaultDbPath(): string {
  try {
    // Safe Electron app detection without static import failure in pure Node/tsx
    const electron = (globalThis as Record<string, unknown>).electron;
    if (electron && typeof electron === 'object' && 'app' in electron) {
      const app = (electron as { app: { getPath: (n: string) => string } }).app;
      return path.join(app.getPath('userData'), 'vocab.db');
    }
  } catch {
    // Not running inside Electron renderer / isolated environment
  }

  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  return path.join(appData, 'Snapword', 'vocab.db');
}

export function getDefaultMigrationsFolder(): string {
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'drizzle');
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }
  }

  const currentDir =
    typeof import.meta.dirname === 'string'
      ? import.meta.dirname
      : path.dirname(fileURLToPath(import.meta.url));

  return path.resolve(currentDir, '../../drizzle');
}

export function localMigrationNames(migrationsFolder: string): string[] {
  if (!fs.existsSync(migrationsFolder)) {
    return [];
  }
  return fs
    .readdirSync(migrationsFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function appliedMigrationNames(client: DatabaseSync): string[] {
  const tableExists = client
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!tableExists) {
    return [];
  }
  const rows = client
    .prepare('SELECT name FROM __drizzle_migrations ORDER BY id ASC')
    .all() as Array<{ name?: string }>;
  return rows.map((r) => r.name).filter((n): n is string => typeof n === 'string');
}

export function initDatabase(options?: DatabaseInitOptions): {
  db: NodeSQLiteDatabase;
  client: DatabaseSync;
} {
  const dbPath = options?.dbPath ?? getDefaultDbPath();
  const migrationsFolder = options?.migrationsFolder ?? getDefaultMigrationsFolder();
  const timeout = options?.timeout ?? 5000;

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Handle :memory: mode specifically (memory databases are destroyed when connection closes)
  if (dbPath === ':memory:') {
    const memClient = new DatabaseSync(':memory:', {
      enableForeignKeyConstraints: false,
      timeout,
    });
    const migrationDb = drizzle({ client: memClient });
    migrate(migrationDb, { migrationsFolder });

    memClient.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${timeout};
    `);

    const runtimeDb = drizzle({ client: memClient });
    currentClient = memClient;
    currentDb = runtimeDb;
    return { db: runtimeDb, client: memClient };
  }

  // 1. 迁移连接：外键关闭，执行版本守卫与 migrate()
  const migrationClient = new DatabaseSync(dbPath, {
    enableForeignKeyConstraints: false,
    timeout,
  });
  migrationClient.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = ${timeout};
  `);

  try {
    const local = localMigrationNames(migrationsFolder);
    const applied = appliedMigrationNames(migrationClient);

    const unknown = applied.filter((n) => !local.includes(n));
    if (unknown.length > 0) {
      throw new DbNewerThanAppError(unknown);
    }

    const pending = local.filter((n) => !applied.includes(n));
    if (pending.length > 0 && fs.existsSync(dbPath)) {
      try {
        migrationClient.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        const bakPath = `${dbPath}.bak-${Date.now()}-${applied.length}`;
        fs.copyFileSync(dbPath, bakPath);
      } catch {
        // Backup failure should not block initial empty migrations
      }
    }

    const migrationDb = drizzle({ client: migrationClient });
    migrate(migrationDb, { migrationsFolder });

    const after = appliedMigrationNames(migrationClient);
    const missing = local.filter((n) => !after.includes(n));
    if (missing.length > 0) {
      throw new MigrationIncompleteError(missing);
    }
  } finally {
    migrationClient.close();
  }

  // 2. 运行时连接：外键开启，启用 WAL 与正常同步级别
  const runtimeClient = new DatabaseSync(dbPath, { timeout });
  runtimeClient.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = ${timeout};
  `);

  const runtimeDb = drizzle({ client: runtimeClient });
  currentClient = runtimeClient;
  currentDb = runtimeDb;

  return { db: runtimeDb, client: runtimeClient };
}

export function closeDatabase(): void {
  if (currentClient) {
    try {
      currentClient.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // Ignore errors during shutdown checkpoint
    }
    currentClient.close();
    currentClient = null;
    currentDb = null;
  }
}

export function getDb(): NodeSQLiteDatabase {
  if (!currentDb) {
    throw new Error('Database has not been initialized. Call initDatabase() first.');
  }
  return currentDb;
}

export function getRawClient(): DatabaseSync {
  if (!currentClient) {
    throw new Error('Database has not been initialized. Call initDatabase() first.');
  }
  return currentClient;
}

export const db: NodeSQLiteDatabase = new Proxy({} as NodeSQLiteDatabase, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
