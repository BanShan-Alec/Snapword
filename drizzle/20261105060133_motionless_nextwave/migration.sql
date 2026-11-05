-- Hand patch (the only permitted deviation, B-03 §10.1 / §17.3):
-- drizzle-orm rc.5 #6165 drops NOT NULL from TEXT primary keys. Without this,
-- SQLite would accept multiple rows with a NULL `key`. The schema.ts source
-- already declares `.notNull()`; the snapshot normalizes both sides.
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`rev` integer DEFAULT 0 NOT NULL,
	`origin_device` text NOT NULL,
	CONSTRAINT "ck_setting_value_json" CHECK(json_valid("value_json"))
);
--> statement-breakpoint
CREATE TABLE `term` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`term` text NOT NULL,
	`term_norm` text NOT NULL,
	`match_type` text NOT NULL,
	`action` text NOT NULL,
	`translation` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`rev` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_batch` text,
	`origin_device` text NOT NULL,
	CONSTRAINT "ck_term_len" CHECK(length(trim("term")) BETWEEN 1 AND 200),
	CONSTRAINT "ck_term_norm_len" CHECK(length("term_norm") BETWEEN 1 AND 200),
	CONSTRAINT "ck_term_match_type" CHECK("match_type" IN ('exact','contains','regex')),
	CONSTRAINT "ck_term_action" CHECK("action" IN ('keep','translate')),
	CONSTRAINT "ck_term_translation_pair" CHECK(
    ("deleted_at" IS NOT NULL)
    OR ("action" = 'translate' AND "translation" IS NOT NULL AND length(trim("translation")) > 0)
    OR ("action" = 'keep' AND "translation" IS NULL)
  ),
	CONSTRAINT "ck_term_translation_len" CHECK("translation" IS NULL OR length("translation") <= 500)
);
--> statement-breakpoint
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
	CONSTRAINT "ck_vocabulary_word_len" CHECK(length(trim("word")) BETWEEN 1 AND 120),
	CONSTRAINT "ck_vocabulary_word_norm_len" CHECK(length("word_norm") BETWEEN 1 AND 120),
	CONSTRAINT "ck_vocabulary_phonetic_us_len" CHECK(length("phonetic_us") <= 120),
	CONSTRAINT "ck_vocabulary_phonetic_uk_len" CHECK("phonetic_uk" IS NULL OR length("phonetic_uk") <= 120),
	CONSTRAINT "ck_vocabulary_context_sense_len" CHECK("context_sense" IS NULL OR length("context_sense") <= 1000),
	CONSTRAINT "ck_vocabulary_context_snippet_len" CHECK("context_snippet" IS NULL OR length("context_snippet") <= 300),
	CONSTRAINT "ck_vocabulary_senses_json" CHECK(json_valid("senses_json") AND json_type("senses_json") = 'array'),
	CONSTRAINT "ck_vocabulary_senses_len" CHECK(json_array_length("senses_json") <= 5),
	CONSTRAINT "ck_vocabulary_tags_json" CHECK(json_valid("tags_json") AND json_type("tags_json") = 'array'),
	CONSTRAINT "ck_vocabulary_tags_len" CHECK(json_array_length("tags_json") <= 5),
	CONSTRAINT "ck_vocabulary_source_title_len" CHECK("source_title" IS NULL OR length("source_title") <= 300),
	CONSTRAINT "ck_vocabulary_source_domain_len" CHECK("source_domain" IS NULL OR length("source_domain") <= 255)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_term_norm_match` ON `term` (`term_norm`,`match_type`);--> statement-breakpoint
CREATE INDEX `ix_term_enabled_live` ON `term` (`enabled`) WHERE "term"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `ix_term_updated_at_live` ON `term` ("updated_at" desc) WHERE "term"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `ix_term_deleted_at` ON `term` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_vocabulary_word_norm` ON `vocabulary` (`word_norm`);--> statement-breakpoint
CREATE INDEX `ix_vocabulary_created_at_live` ON `vocabulary` ("created_at" desc) WHERE "vocabulary"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `ix_vocabulary_updated_at_live` ON `vocabulary` ("updated_at" desc) WHERE "vocabulary"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `ix_vocabulary_deleted_at` ON `vocabulary` (`deleted_at`);