import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  DbNewerThanAppError,
  getDefaultMigrationsFolder,
  initDatabase,
} from '@app/main/db/client';
import {
  escapeLike,
  normalizeTerm,
  normalizeWord,
  SettingRepository,
  TermRepository,
  VocabularyRepository,
} from '@app/main/db/repository';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Drizzle ORM Database & Repository Layer (Slice-03)', () => {
  let tmpDbPath: string;
  let migrationsFolder: string;

  beforeEach(() => {
    tmpDbPath = path.join(
      os.tmpdir(),
      `snapword-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    migrationsFolder = getDefaultMigrationsFolder();
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch {
        // Ignore file lock release lag on Windows
      }
    }
  });

  describe('Dual Connection Migration & Defenses', () => {
    it('should initialize database with dual connections and create all core tables', () => {
      const { client, db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });

      expect(db).toBeDefined();
      expect(client).toBeDefined();

      const tables = client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;
      const tableNames = new Set(tables.map((t) => t.name));

      expect(tableNames.has('vocabulary')).toBe(true);
      expect(tableNames.has('term')).toBe(true);
      expect(tableNames.has('setting')).toBe(true);
      expect(tableNames.has('__drizzle_migrations')).toBe(true);
    });

    it('should verify Issue #6165 defense: setting.key must be NOT NULL', () => {
      const { client } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });

      const cols = client.prepare("PRAGMA table_info('setting')").all() as Array<{
        name: string;
        notnull: number;
        pk: number;
      }>;
      const keyCol = cols.find((c) => c.name === 'key');

      expect(keyCol).toBeDefined();
      expect(keyCol?.notnull).toBe(1);
      expect(keyCol?.pk).toBe(1);
    });

    it('should verify SQLite PRAGMAs on runtime connection', () => {
      const { client } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });

      const fk = client.prepare('PRAGMA foreign_keys').get() as {
        foreign_keys: number;
      };
      expect(fk.foreign_keys).toBe(1);

      const jm = client.prepare('PRAGMA journal_mode').get() as {
        journal_mode: string;
      };
      expect(jm.journal_mode.toLowerCase()).toBe('wal');
    });

    it('should throw DbNewerThanAppError when database contains unknown future migrations', () => {
      // 1. First init standard DB
      const { client } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });

      // 2. Inject an unknown future migration record
      client
        .prepare(
          "INSERT INTO __drizzle_migrations (hash, created_at, name, applied_at) VALUES ('dummy_hash', 9999999999999, '20991231235959_future_migration', '2099-12-31T23:59:59.000Z')",
        )
        .run();
      closeDatabase();

      // 3. Re-opening should trigger version guard
      expect(() => {
        initDatabase({
          dbPath: tmpDbPath,
          migrationsFolder,
        });
      }).toThrow(DbNewerThanAppError);
    });

    it('should enforce CHECK constraint on invalid senses_json', () => {
      const { client } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });

      expect(() => {
        client
          .prepare(
            `INSERT INTO vocabulary (word, word_norm, senses_json, tags_json, created_at, updated_at, origin_device)
             VALUES ('test', 'test', 'invalid json string', '[]', '2026-11-14T12:00:00.000Z', '2026-11-14T12:00:00.000Z', 'dev-1')`,
          )
          .run();
      }).toThrow();
    });

    it('should enforce CHECK constraint on word length', () => {
      const { client } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });

      expect(() => {
        client
          .prepare(
            `INSERT INTO vocabulary (word, word_norm, senses_json, tags_json, created_at, updated_at, origin_device)
             VALUES ('', '', '[]', '[]', '2026-11-14T12:00:00.000Z', '2026-11-14T12:00:00.000Z', 'dev-1')`,
          )
          .run();
      }).toThrow();
    });
  });

  describe('VocabularyRepository CRUD & Queries', () => {
    it('should upsert a new word and return domain record', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new VocabularyRepository(db);

      const result = repo.upsertWord({
        word: '  Asynchronous  ',
        phoneticUs: '/eɪˈsɪŋkrənəs/',
        phoneticUk: '/eɪˈsɪŋkrənəs/',
        contextSense: '异步执行模式',
        contextSnippet: 'asynchronous execution in Node.js',
        senses: [
          {
            pos: 'adj.',
            def: '异步的；不同时的',
            example: 'asynchronous operations',
          },
        ],
        tags: ['async', 'node'],
        sourceTitle: 'Node.js Docs',
        sourceDomain: 'nodejs.org',
        originDevice: 'test-device',
      });

      expect(result.isNew).toBe(true);
      expect(result.record.id).toBeGreaterThan(0);
      expect(result.record.word).toBe('Asynchronous');
      expect(result.record.wordNorm).toBe('asynchronous');
      expect(result.record.phoneticUs).toBe('/eɪˈsɪŋkrənəs/');
      expect(result.record.phoneticUk).toBe('/eɪˈsɪŋkrənəs/');
      expect(result.record.contextSense).toBe('异步执行模式');
      expect(result.record.senses).toHaveLength(1);
      expect(result.record.tags).toEqual(['async', 'node']);
      expect(result.record.rev).toBe(1);
      expect(result.record.deletedAt).toBeNull();
      expect(result.record.deletedBatch).toBeNull();
    });

    it('should query live words with pagination and tag filtering', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new VocabularyRepository(db);

      repo.upsertWord({
        word: 'alpha',
        senses: [{ pos: 'n.', def: '希腊首字母', example: 'alpha release' }],
        tags: ['version'],
      });

      repo.upsertWord({
        word: 'beta',
        senses: [{ pos: 'n.', def: '测试版', example: 'beta testing' }],
        tags: ['version', 'testing'],
      });

      repo.upsertWord({
        word: 'gamma',
        senses: [{ pos: 'n.', def: '伽马', example: 'gamma radiation' }],
        tags: ['science'],
      });

      const allWords = repo.getWords();
      expect(allWords).toHaveLength(3);

      const paged = repo.getWords({ limit: 2, offset: 1 });
      expect(paged).toHaveLength(2);

      const versionWords = repo.getWords({ tag: 'version' });
      expect(versionWords).toHaveLength(2);

      const scienceWords = repo.getWords({ tag: 'science' });
      expect(scienceWords).toHaveLength(1);
      expect(scienceWords[0].wordNorm).toBe('gamma');
    });

    it('should search across wordNorm, contextSense, and sensesJson with wildcard escaping', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new VocabularyRepository(db);

      repo.upsertWord({
        word: '100%_guaranteed',
        senses: [{ pos: 'adj.', def: '完全保证的', example: '100% reliable' }],
        contextSense: '高可靠场景',
      });

      repo.upsertWord({
        word: 'pipeline',
        senses: [{ pos: 'n.', def: '流水线；管道', example: 'data processing pipeline' }],
        contextSense: '处理流程',
      });

      // Search matching word with % literal
      const literalSearch = repo.searchWords('100%_');
      expect(literalSearch).toHaveLength(1);
      expect(literalSearch[0].wordNorm).toBe('100%_guaranteed');

      // Search matching context sense
      const senseSearch = repo.searchWords('可靠');
      expect(senseSearch).toHaveLength(1);
      expect(senseSearch[0].wordNorm).toBe('100%_guaranteed');

      // Search matching senses definition
      const defSearch = repo.searchWords('流水线');
      expect(defSearch).toHaveLength(1);
      expect(defSearch[0].wordNorm).toBe('pipeline');
    });
  });

  describe('Soft Deletion and 5-Second Undo', () => {
    it('should mark deleted_at, deleted_batch and exclude from live queries', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new VocabularyRepository(db);

      const w1 = repo.upsertWord({
        word: 'deleteMe',
        senses: [{ pos: 'v.', def: '删除', example: 'delete this record' }],
      });

      const delRes = repo.softDeleteWord(w1.record.id, 'device-1');
      expect(delRes.affectedCount).toBe(1);
      expect(delRes.batchId).toBeDefined();

      // Should be excluded from live list and search
      expect(repo.getWords()).toHaveLength(0);
      expect(repo.searchWords('delete')).toHaveLength(0);

      // Raw inspection should show soft-delete tombstone
      const tombstone = repo.getWordByNorm('deleteme', true);
      expect(tombstone).toBeDefined();
      expect(tombstone?.deletedAt).not.toBeNull();
      expect(tombstone?.deletedBatch).toBe(delRes.batchId);
      expect(tombstone?.rev).toBe(2);
    });

    it('should restore words within 5s undo window', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new VocabularyRepository(db);

      const w1 = repo.upsertWord({
        word: 'undoMe',
        senses: [{ pos: 'v.', def: '撤销', example: 'undo this' }],
      });

      const delRes = repo.softDeleteWord(w1.record.id, 'device-1');
      expect(repo.getWords()).toHaveLength(0);

      const undoRes = repo.undoBatch(delRes.batchId, 'device-1');
      expect(undoRes.restoredCount).toBe(1);

      const restoredList = repo.getWords();
      expect(restoredList).toHaveLength(1);
      expect(restoredList[0].wordNorm).toBe('undome');
      expect(restoredList[0].deletedAt).toBeNull();
      expect(restoredList[0].deletedBatch).toBeNull();
      expect(restoredList[0].rev).toBe(3); // 1 -> 2 (delete) -> 3 (undo)
    });
  });

  describe('Unique Key Revival', () => {
    it('should revive soft-deleted word when added again and update definitions', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new VocabularyRepository(db);

      // 1. Initial creation
      const initial = repo.upsertWord({
        word: 'thread',
        phoneticUs: '/θred/',
        senses: [{ pos: 'n.', def: '线索', example: 'lose the thread' }],
        tags: ['reading'],
        contextSense: '思路线索',
        contextSnippet: 'I lost the thread of conversation',
      });
      const initialId = initial.record.id;
      const initialCreatedAt = initial.record.createdAt;

      // 2. Soft delete
      const delRes = repo.softDeleteWord(initialId, 'device-1');
      expect(delRes.affectedCount).toBe(1);
      expect(repo.getWords()).toHaveLength(0);

      // 3. Re-add same normalized word with new context & sense
      const revived = repo.upsertWord({
        word: 'Thread',
        phoneticUs: '/θred/',
        senses: [{ pos: 'n.', def: '线程', example: 'worker thread' }],
        tags: [], // Empty tags should preserve previous tags ['reading']
        contextSense: '操作系统线程',
        contextSnippet: 'spawn a worker thread',
      });

      expect(revived.isNew).toBe(false);
      expect(revived.record.id).toBe(initialId);
      expect(revived.record.createdAt).toBe(initialCreatedAt);
      expect(revived.record.deletedAt).toBeNull();
      expect(revived.record.deletedBatch).toBeNull();
      expect(revived.record.contextSense).toBe('操作系统线程');
      expect(revived.record.contextSnippet).toBe('spawn a worker thread');
      expect(revived.record.senses[0].def).toBe('线程');
      expect(revived.record.tags).toEqual(['reading']);
      expect(revived.record.rev).toBe(3); // 1 (create) -> 2 (delete) -> 3 (revive)

      // 4. Must be visible in live queries again
      const liveWords = repo.getWords();
      expect(liveWords).toHaveLength(1);
      expect(liveWords[0].id).toBe(initialId);
    });
  });

  describe('Two-Phase Tombstone Purge', () => {
    it('should clear sensitive content in phase 1 and hard delete in phase 2', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new VocabularyRepository(db);

      const w1 = repo.upsertWord({
        word: 'ephemeral',
        phoneticUs: '/ɪˈfemərəl/',
        phoneticUk: '/ɪˈfemərəl/',
        contextSense: '短暂的',
        contextSnippet: 'ephemeral data snippet',
        senses: [{ pos: 'adj.', def: '短暂的', example: 'ephemeral memory' }],
        tags: ['memory'],
      });

      repo.softDeleteWord(w1.record.id, 'device-1');

      // Purge phase 1 with cutoff in future (treats our delete as >5s ago)
      const futureCutoff = new Date(Date.now() + 10000).toISOString();
      const purge1 = repo.purgeOldTombstones({
        fiveSecondsAgoCutoff: futureCutoff,
      });
      expect(purge1.cleanedCount).toBe(1);
      expect(purge1.hardDeletedCount).toBe(0);

      // Inspect tombstone: content cleared, metadata preserved
      const tombstone = repo.getWordByNorm('ephemeral', true);
      expect(tombstone).toBeDefined();
      expect(tombstone?.phoneticUs).toBe('');
      expect(tombstone?.phoneticUk).toBeNull();
      expect(tombstone?.contextSense).toBeNull();
      expect(tombstone?.contextSnippet).toBeNull();
      expect(tombstone?.senses).toEqual([]);
      expect(tombstone?.tags).toEqual([]);
      expect(tombstone?.wordNorm).toBe('ephemeral'); // Key preserved
      expect(tombstone?.deletedAt).not.toBeNull();

      // Purge phase 2: hard delete
      const purge2 = repo.purgeOldTombstones({
        hardDeleteCutoff: futureCutoff,
      });
      expect(purge2.hardDeletedCount).toBe(1);

      const completelyGone = repo.getWordByNorm('ephemeral', true);
      expect(completelyGone).toBeNull();
    });
  });

  describe('TermRepository & SettingRepository', () => {
    it('should manage terms with exact/contains/regex and keep/translate pairing', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new TermRepository(db);

      // translate action
      const t1 = repo.upsertTerm({
        term: 'Electron',
        matchType: 'exact',
        action: 'translate',
        translation: '电子框架',
      });
      expect(t1.termNorm).toBe('electron');
      expect(t1.action).toBe('translate');

      // keep action
      const t2 = repo.upsertTerm({
        term: 'React',
        matchType: 'exact',
        action: 'keep',
      });
      expect(t2.action).toBe('keep');
      expect(t2.translation).toBeNull();

      // Invalid regex rejection
      expect(() => {
        repo.upsertTerm({
          term: '[invalid(regex',
          matchType: 'regex',
          action: 'keep',
        });
      }).toThrow(/Invalid regular expression/);

      // Soft delete & undo for terms
      const del = repo.softDeleteTerm(t1.id, 'device-1');
      expect(del.affectedCount).toBe(1);
      expect(repo.getLiveTerms()).toHaveLength(1);

      repo.undoBatch(del.batchId, 'device-1');
      expect(repo.getLiveTerms()).toHaveLength(2);
    });

    it('should manage syncable settings with SettingRepository', () => {
      const { db } = initDatabase({
        dbPath: tmpDbPath,
        migrationsFolder,
      });
      const repo = new SettingRepository(db);

      repo.setSetting('ui.theme', 'dark', 'device-1');
      repo.setSetting('ui.fontSize', 16, 'device-1');

      const theme = repo.getSetting('ui.theme');
      expect(theme?.value).toBe('dark');
      expect(theme?.rev).toBe(1);

      // Update setting
      repo.setSetting('ui.theme', 'light', 'device-1');
      const updatedTheme = repo.getSetting('ui.theme');
      expect(updatedTheme?.value).toBe('light');
      expect(updatedTheme?.rev).toBe(2);

      const all = repo.getAllSettings();
      expect(all).toHaveLength(2);
    });
  });

  describe('Normalizers & Helpers', () => {
    it('should normalize word and term with Unicode NFC and trim', () => {
      expect(normalizeWord('  Café  ')).toBe('café');
      expect(normalizeTerm('  API_KEY  ')).toBe('api_key');
      expect(escapeLike('100%_val\\id')).toBe('100\\%\\_val\\\\id');
    });
  });
});
