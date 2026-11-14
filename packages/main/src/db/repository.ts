import crypto from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { db as defaultDb } from './client.ts';
import { type JsonValue, type Sense, setting, term, vocabulary } from './schema.ts';

export interface VocabularyRecord {
  id: number;
  word: string;
  wordNorm: string;
  phoneticUs: string;
  phoneticUk: string | null;
  contextSense: string | null;
  contextSnippet: string | null;
  senses: Sense[];
  sourceTitle: string | null;
  sourceDomain: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  rev: number;
  deletedAt: string | null;
  deletedBatch: string | null;
  originDevice: string;
}

export interface UpsertWordInput {
  word: string;
  phoneticUs?: string;
  phoneticUk?: string | null;
  contextSense?: string | null;
  contextSnippet?: string | null;
  senses: Sense[];
  sourceTitle?: string | null;
  sourceDomain?: string | null;
  tags?: string[];
  originDevice?: string;
}

export interface UpsertWordResult {
  record: VocabularyRecord;
  isNew: boolean;
}

export interface TermRecord {
  id: number;
  term: string;
  termNorm: string;
  matchType: 'exact' | 'contains' | 'regex';
  action: 'keep' | 'translate';
  translation: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  rev: number;
  deletedAt: string | null;
  deletedBatch: string | null;
  originDevice: string;
}

export interface UpsertTermInput {
  term: string;
  matchType: 'exact' | 'contains' | 'regex';
  action: 'keep' | 'translate';
  translation?: string | null;
  enabled?: boolean;
  originDevice?: string;
}

export interface SettingRecord {
  key: string;
  value: JsonValue;
  updatedAt: string;
  rev: number;
  originDevice: string;
}

export function normalizeWord(word: string): string {
  return word.trim().normalize('NFC').toLowerCase();
}

export function normalizeTerm(t: string): string {
  return t.trim().normalize('NFC').toLowerCase();
}

export function escapeLike(str: string): string {
  return str.replace(/([\\%_])/g, '\\$1');
}

function mapVocabularyRow(row: typeof vocabulary.$inferSelect): VocabularyRecord {
  return {
    id: row.id,
    word: row.word,
    wordNorm: row.wordNorm,
    phoneticUs: row.phoneticUs,
    phoneticUk: row.phoneticUk,
    contextSense: row.contextSense,
    contextSnippet: row.contextSnippet,
    senses: Array.isArray(row.sensesJson) ? row.sensesJson : [],
    sourceTitle: row.sourceTitle,
    sourceDomain: row.sourceDomain,
    tags: Array.isArray(row.tagsJson) ? row.tagsJson : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    rev: row.rev,
    deletedAt: row.deletedAt,
    deletedBatch: row.deletedBatch,
    originDevice: row.originDevice,
  };
}

function mapTermRow(row: typeof term.$inferSelect): TermRecord {
  return {
    id: row.id,
    term: row.term,
    termNorm: row.termNorm,
    matchType: row.matchType as 'exact' | 'contains' | 'regex',
    action: row.action as 'keep' | 'translate',
    translation: row.translation,
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    rev: row.rev,
    deletedAt: row.deletedAt,
    deletedBatch: row.deletedBatch,
    originDevice: row.originDevice,
  };
}

export class VocabularyRepository {
  constructor(private readonly database: NodeSQLiteDatabase = defaultDb) {}

  upsertWord(params: UpsertWordInput): UpsertWordResult {
    const trimmedWord = params.word.trim();
    if (trimmedWord.length < 1 || trimmedWord.length > 120) {
      throw new Error('Word length must be between 1 and 120 characters');
    }

    const wordNorm = normalizeWord(trimmedWord);
    if (wordNorm.length < 1 || wordNorm.length > 120) {
      throw new Error('Normalized word length must be between 1 and 120 characters');
    }

    if (!Array.isArray(params.senses) || params.senses.length === 0 || params.senses.length > 5) {
      throw new Error('Word senses must be an array of 1 to 5 items');
    }

    for (const sense of params.senses) {
      if (!sense.pos || !sense.def) {
        throw new Error('Every sense item must specify non-empty pos and def');
      }
    }

    const tags = Array.from(
      new Set(
        (params.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 32),
      ),
    ).slice(0, 5);

    const now = new Date().toISOString();
    const originDevice = params.originDevice ?? 'local-device';
    const phoneticUs = params.phoneticUs ?? '';
    const phoneticUk = params.phoneticUk ?? null;
    const contextSense = params.contextSense ?? null;
    const contextSnippet = params.contextSnippet ?? null;
    const sourceTitle = params.sourceTitle ?? null;
    const sourceDomain = params.sourceDomain ?? null;

    const rows = this.database
      .insert(vocabulary)
      .values({
        word: trimmedWord,
        wordNorm,
        phoneticUs,
        phoneticUk,
        contextSense,
        contextSnippet,
        sensesJson: params.senses,
        sourceTitle,
        sourceDomain,
        tagsJson: tags,
        createdAt: now,
        updatedAt: now,
        rev: 1,
        deletedAt: null,
        deletedBatch: null,
        originDevice,
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
      .returning()
      .all();

    const row = rows[0];
    const isNew = row.createdAt === now;
    return {
      record: mapVocabularyRow(row),
      isNew,
    };
  }

  getWords(options?: { limit?: number; offset?: number; tag?: string }): VocabularyRecord[] {
    const limit = Math.max(1, options?.limit ?? 50);
    const offset = Math.max(0, options?.offset ?? 0);

    const conditions = [isNull(vocabulary.deletedAt)];
    if (options?.tag) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM json_each(${vocabulary.tagsJson}) WHERE json_each.value = ${options.tag})`,
      );
    }

    const rows = this.database
      .select()
      .from(vocabulary)
      .where(and(...conditions))
      .orderBy(desc(vocabulary.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return rows.map(mapVocabularyRow);
  }

  getWordById(id: number): VocabularyRecord | null {
    const rows = this.database
      .select()
      .from(vocabulary)
      .where(and(isNull(vocabulary.deletedAt), eq(vocabulary.id, id)))
      .limit(1)
      .all();

    return rows.length > 0 ? mapVocabularyRow(rows[0]) : null;
  }

  getWordByNorm(wordNorm: string, includeDeleted = false): VocabularyRecord | null {
    const conditions = [eq(vocabulary.wordNorm, wordNorm)];
    if (!includeDeleted) {
      conditions.push(isNull(vocabulary.deletedAt));
    }

    const rows = this.database
      .select()
      .from(vocabulary)
      .where(and(...conditions))
      .limit(1)
      .all();

    return rows.length > 0 ? mapVocabularyRow(rows[0]) : null;
  }

  searchWords(query: string, limit = 200): VocabularyRecord[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const pattern = `%${escapeLike(trimmed.toLowerCase())}%`;
    const rows = this.database
      .select()
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
      .limit(Math.min(limit, 500))
      .all();

    return rows.map(mapVocabularyRow);
  }

  softDeleteWord(
    id: number | number[],
    deviceId = 'local-device',
  ): { batchId: string; affectedCount: number } {
    const batchId = crypto.randomUUID();
    const now = new Date().toISOString();
    const idList = Array.isArray(id) ? id : [id];

    if (idList.length === 0) {
      return { batchId, affectedCount: 0 };
    }

    const res = this.database
      .update(vocabulary)
      .set({
        deletedAt: now,
        deletedBatch: batchId,
        updatedAt: now,
        rev: sql`${vocabulary.rev} + 1`,
        originDevice: deviceId,
      })
      .where(and(isNull(vocabulary.deletedAt), inArray(vocabulary.id, idList)))
      .run();

    return {
      batchId,
      affectedCount: (res as { changes?: number }).changes ?? 0,
    };
  }

  undoBatch(batchId: string, deviceId = 'local-device'): { restoredCount: number } {
    const now = new Date().toISOString();
    const res = this.database
      .update(vocabulary)
      .set({
        deletedAt: null,
        deletedBatch: null,
        updatedAt: now,
        rev: sql`${vocabulary.rev} + 1`,
        originDevice: deviceId,
      })
      .where(eq(vocabulary.deletedBatch, batchId))
      .run();

    return {
      restoredCount: (res as { changes?: number }).changes ?? 0,
    };
  }

  purgeOldTombstones(options?: { fiveSecondsAgoCutoff?: string; hardDeleteCutoff?: string }): {
    cleanedCount: number;
    hardDeletedCount: number;
  } {
    const fiveSecondsAgo =
      options?.fiveSecondsAgoCutoff ?? new Date(Date.now() - 5000).toISOString();

    const cleanRes = this.database
      .update(vocabulary)
      .set({
        phoneticUs: '',
        phoneticUk: null,
        contextSense: null,
        contextSnippet: null,
        sensesJson: sql`'[]'`,
        sourceTitle: null,
        sourceDomain: null,
        tagsJson: sql`'[]'`,
      })
      .where(and(isNotNull(vocabulary.deletedAt), lt(vocabulary.deletedAt, fiveSecondsAgo)))
      .run();

    let hardDeletedCount = 0;
    if (options?.hardDeleteCutoff) {
      const deleteRes = this.database
        .delete(vocabulary)
        .where(
          and(isNotNull(vocabulary.deletedAt), lt(vocabulary.deletedAt, options.hardDeleteCutoff)),
        )
        .run();
      hardDeletedCount = (deleteRes as { changes?: number }).changes ?? 0;
    }

    return {
      cleanedCount: (cleanRes as { changes?: number }).changes ?? 0,
      hardDeletedCount,
    };
  }
}

export class TermRepository {
  constructor(private readonly database: NodeSQLiteDatabase = defaultDb) {}

  upsertTerm(params: UpsertTermInput): TermRecord {
    const trimmed = params.term.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      throw new Error('Term length must be between 1 and 200 characters');
    }

    if (params.matchType === 'regex') {
      try {
        new RegExp(trimmed);
      } catch (e) {
        throw new Error(`Invalid regular expression: ${(e as Error).message}`);
      }
    }

    if (params.action === 'translate') {
      if (!params.translation || params.translation.trim().length === 0) {
        throw new Error('Translation must be provided when action is "translate"');
      }
    } else if (params.action === 'keep') {
      if (params.translation) {
        throw new Error('Translation must be null when action is "keep"');
      }
    }

    const termNorm = normalizeTerm(trimmed);
    const now = new Date().toISOString();
    const originDevice = params.originDevice ?? 'local-device';
    const translation = params.translation ? params.translation.trim() : null;
    const enabled = params.enabled ?? true;

    const rows = this.database
      .insert(term)
      .values({
        term: trimmed,
        termNorm,
        matchType: params.matchType,
        action: params.action,
        translation,
        enabled,
        createdAt: now,
        updatedAt: now,
        rev: 1,
        deletedAt: null,
        deletedBatch: null,
        originDevice,
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
      .returning()
      .all();

    return mapTermRow(rows[0]);
  }

  getLiveTerms(): TermRecord[] {
    const rows = this.database
      .select()
      .from(term)
      .where(and(isNull(term.deletedAt), eq(term.enabled, true)))
      .orderBy(desc(term.updatedAt))
      .all();

    return rows.map(mapTermRow);
  }

  softDeleteTerm(
    id: number | number[],
    deviceId = 'local-device',
  ): { batchId: string; affectedCount: number } {
    const batchId = crypto.randomUUID();
    const now = new Date().toISOString();
    const idList = Array.isArray(id) ? id : [id];

    if (idList.length === 0) {
      return { batchId, affectedCount: 0 };
    }

    const res = this.database
      .update(term)
      .set({
        deletedAt: now,
        deletedBatch: batchId,
        updatedAt: now,
        rev: sql`${term.rev} + 1`,
        originDevice: deviceId,
      })
      .where(and(isNull(term.deletedAt), inArray(term.id, idList)))
      .run();

    return {
      batchId,
      affectedCount: (res as { changes?: number }).changes ?? 0,
    };
  }

  undoBatch(batchId: string, deviceId = 'local-device'): { restoredCount: number } {
    const now = new Date().toISOString();
    const res = this.database
      .update(term)
      .set({
        deletedAt: null,
        deletedBatch: null,
        updatedAt: now,
        rev: sql`${term.rev} + 1`,
        originDevice: deviceId,
      })
      .where(eq(term.deletedBatch, batchId))
      .run();

    return {
      restoredCount: (res as { changes?: number }).changes ?? 0,
    };
  }
}

export class SettingRepository {
  constructor(private readonly database: NodeSQLiteDatabase = defaultDb) {}

  getSetting(key: string): SettingRecord | null {
    const rows = this.database.select().from(setting).where(eq(setting.key, key)).limit(1).all();

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      key: row.key,
      value: row.valueJson,
      updatedAt: row.updatedAt,
      rev: row.rev,
      originDevice: row.originDevice,
    };
  }

  setSetting(key: string, value: JsonValue, originDevice = 'local-device'): SettingRecord {
    if (!key || key.trim().length === 0) {
      throw new Error('Setting key must not be empty');
    }

    const now = new Date().toISOString();
    const rows = this.database
      .insert(setting)
      .values({
        key: key.trim(),
        valueJson: value,
        updatedAt: now,
        rev: 1,
        originDevice,
      })
      .onConflictDoUpdate({
        target: setting.key,
        set: {
          valueJson: sql`excluded.value_json`,
          updatedAt: sql`excluded.updated_at`,
          rev: sql`${setting.rev} + 1`,
          originDevice: sql`excluded.origin_device`,
        },
      })
      .returning()
      .all();

    const row = rows[0];
    return {
      key: row.key,
      value: row.valueJson,
      updatedAt: row.updatedAt,
      rev: row.rev,
      originDevice: row.originDevice,
    };
  }

  getAllSettings(): SettingRecord[] {
    const rows = this.database.select().from(setting).all();
    return rows.map((r: typeof setting.$inferSelect) => ({
      key: r.key,
      value: r.valueJson,
      updatedAt: r.updatedAt,
      rev: r.rev,
      originDevice: r.originDevice,
    }));
  }
}
