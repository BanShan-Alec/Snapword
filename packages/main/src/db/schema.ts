import { desc, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    matchType: text('match_type', {
      enum: ['exact', 'contains', 'regex'],
    }).notNull(),
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
    valueJson: text('value_json', {
      mode: 'json',
    })
      .$type<JsonValue>()
      .notNull(),
    updatedAt: text('updated_at').notNull(),
    rev: integer('rev').notNull().default(0),
    originDevice: text('origin_device').notNull(),
  },
  (t) => [check('ck_setting_value_json', sql`json_valid(${t.valueJson})`)],
);

export type VocabularyTable = typeof vocabulary.$inferSelect;
export type NewVocabularyTable = typeof vocabulary.$inferInsert;
export type TermTable = typeof term.$inferSelect;
export type NewTermTable = typeof term.$inferInsert;
export type SettingTable = typeof setting.$inferSelect;
export type NewSettingTable = typeof setting.$inferInsert;
