import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, getDefaultMigrationsFolder, initDatabase } from '@app/main/db/client';
import { normalizeWord, VocabularyRepository } from '@app/main/db/repository';
import { TranslationHistoryService } from '@app/main/services/history.service';
import { VocabularyService } from '@app/main/services/vocabulary.service';
import { formatVocabularyCsv } from '@app/main/services/vocabulary-csv';
import type { TranslationResult } from '@app/shared/types/translate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Vocabulary & History End-to-End Core (Slice-07)', () => {
  let tmpDbPath: string;
  let repo: VocabularyRepository;
  let service: VocabularyService;

  beforeEach(() => {
    tmpDbPath = path.join(
      os.tmpdir(),
      `snapword-vocab-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    const { db } = initDatabase({
      dbPath: tmpDbPath,
      migrationsFolder: getDefaultMigrationsFolder(),
    });
    repo = new VocabularyRepository(db);
    service = new VocabularyService(repo);
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch {
        // file lock delay on Windows
      }
    }
  });

  describe('Vocabulary Repository & Service State Machine (IA-16/17/37~40)', () => {
    it('should save a new word into SQLite, return isNew=true and increment count (IA-16)', () => {
      expect(repo.countWords()).toBe(0);

      const res = service.saveWord({
        word: 'ephemeral',
        phoneticUs: 'ɪˈfemərəl',
        contextSense: '短暂的',
        contextSnippet: 'Fame is ephemeral in modern age.',
        senses: [{ pos: 'adj.', def: '短暂的，暂时的', example: 'ephemeral pleasures' }],
        tags: ['GRE', 'HighFrequency'],
      });

      expect(res.isNew).toBe(true);
      expect(res.record.word).toBe('ephemeral');
      expect(res.record.wordNorm).toBe(normalizeWord('ephemeral'));
      expect(res.record.contextSense).toBe('短暂的');
      expect(res.record.tags).toEqual(['GRE', 'HighFrequency']);
      expect(service.getCount().count).toBe(1);
    });

    it('should handle duplicate word idempotently, update context snippet and return isNew=false (IA-17)', () => {
      service.saveWord({
        word: 'serendipity',
        phoneticUs: 'ˌserənˈdɪpəti',
        contextSense: '意外惊喜',
        contextSnippet: 'It was pure serendipity that we met.',
        senses: [
          {
            pos: 'n.',
            def: '意外发现珍奇事物的本领',
            example: 'a fortunate stroke of serendipity',
          },
        ],
      });

      expect(service.getCount().count).toBe(1);

      // Repeat save with new context snippet and sense
      const res2 = service.saveWord({
        word: 'serendipity',
        phoneticUs: 'ˌserənˈdɪpəti',
        contextSense: '机缘巧合',
        contextSnippet: 'Finding this book was a moment of serendipity.',
        senses: [{ pos: 'n.', def: '机缘巧合', example: 'Finding this book was serendipity' }],
      });

      expect(res2.isNew).toBe(false);
      expect(res2.record.word).toBe('serendipity');
      expect(res2.record.contextSense).toBe('机缘巧合');
      expect(res2.record.contextSnippet).toBe('Finding this book was a moment of serendipity.');
      // Total count remains 1, no duplicate entries created
      expect(service.getCount().count).toBe(1);
    });

    it('should support search, tag filter and sorting (time / alpha)', () => {
      service.saveWord({
        word: 'banana',
        senses: [{ pos: 'n.', def: '香蕉', example: 'a ripe banana' }],
        tags: ['fruit'],
      });
      service.saveWord({
        word: 'apple',
        senses: [{ pos: 'n.', def: '苹果', example: 'an apple a day' }],
        tags: ['fruit'],
      });
      service.saveWord({
        word: 'carrot',
        senses: [{ pos: 'n.', def: '胡萝卜', example: 'rabbit eats carrot' }],
        tags: ['vegetable'],
      });

      // Tag filter
      const fruitWords = service.listWords({ tag: 'fruit' });
      expect(fruitWords.total).toBe(2);
      expect(fruitWords.items.map((w) => w.word)).toContain('banana');
      expect(fruitWords.items.map((w) => w.word)).toContain('apple');

      // Search filter
      const searchRes = service.listWords({ search: 'apple' });
      expect(searchRes.total).toBe(1);
      expect(searchRes.items[0].word).toBe('apple');

      // Alphabetical sorting
      const alphaWords = service.listWords({ sort: 'alpha' });
      expect(alphaWords.items[0].word).toBe('apple');
      expect(alphaWords.items[1].word).toBe('banana');
      expect(alphaWords.items[2].word).toBe('carrot');
    });

    it('should support soft delete and 5-second undo restoration (IA-37/38)', () => {
      const w1 = service.saveWord({
        word: 'solitude',
        senses: [{ pos: 'n.', def: '独处', example: 'enjoy solitude' }],
      });
      const _w2 = service.saveWord({
        word: 'resilience',
        senses: [{ pos: 'n.', def: '韧性', example: 'mental resilience' }],
      });

      expect(service.getCount().count).toBe(2);

      // Soft delete single word
      const del = service.deleteWord(w1.record.id);
      expect(del.affectedCount).toBe(1);
      expect(service.getCount().count).toBe(1);

      const remaining = service.listWords();
      expect(remaining.items.length).toBe(1);
      expect(remaining.items[0].word).toBe('resilience');

      // Undo deletion within 5s
      const undo = service.undoDelete(del.batchId);
      expect(undo.restoredCount).toBe(1);
      expect(service.getCount().count).toBe(2);

      const restoredList = service.listWords();
      expect(restoredList.items.map((w) => w.word)).toContain('solitude');
      expect(restoredList.items.map((w) => w.word)).toContain('resilience');
    });

    it('should support clear all and undo restoration (IA-39)', () => {
      service.saveWord({
        word: 'word1',
        senses: [{ pos: 'n.', def: '词1', example: 'ex1' }],
      });
      service.saveWord({
        word: 'word2',
        senses: [{ pos: 'n.', def: '词2', example: 'ex2' }],
      });

      expect(service.getCount().count).toBe(2);

      const clearRes = service.clearAll();
      expect(clearRes.affectedCount).toBe(2);
      expect(service.getCount().count).toBe(0);

      // Undo clear all
      const undoRes = service.undoDelete(clearRes.batchId);
      expect(undoRes.restoredCount).toBe(2);
      expect(service.getCount().count).toBe(2);
    });

    it('should resurrect soft-deleted word when re-saved (IA-40)', () => {
      const w = service.saveWord({
        word: 'phoenix',
        senses: [{ pos: 'n.', def: '凤凰', example: 'rise like a phoenix' }],
      });
      expect(service.getCount().count).toBe(1);

      service.deleteWord(w.record.id);
      expect(service.getCount().count).toBe(0);

      // Re-saving phoenix resurrects it
      const res = service.saveWord({
        word: 'phoenix',
        senses: [{ pos: 'n.', def: '不死鸟', example: 'mythical phoenix' }],
      });

      expect(res.record.word).toBe('phoenix');
      expect(service.getCount().count).toBe(1);
      expect(service.getByWord('phoenix')?.deletedAt).toBeNull();
    });
  });

  describe('CSV Export Format & Security Redline (IA-28)', () => {
    it('should include UTF-8 BOM, all mandatory columns, and escape commas/quotes/newlines', () => {
      service.saveWord({
        word: 'benchmark',
        phoneticUs: 'ˈbentʃmɑːrk',
        contextSense: '基准，标杆',
        contextSnippet: 'This sets a new benchmark for speed, quality, and cost.',
        senses: [
          { pos: 'n.', def: '基准，参照点', example: 'an industry "gold standard" benchmark' },
        ],
        tags: ['tech', 'metric'],
      });

      service.saveWord({
        word: 'multiline',
        phoneticUs: 'ˈmʌltiˌlaɪn',
        contextSense: '多行\n释义',
        contextSnippet: 'Sentence with, comma and "quotes".',
        senses: [{ pos: 'adj.', def: '多行的', example: 'line 1\nline 2' }],
      });

      const { csv, count } = service.exportCsv();
      expect(count).toBe(2);

      // Verify formatVocabularyCsv direct call
      const singleCsv = formatVocabularyCsv([repo.getAllLiveWords()[0]]);
      expect(singleCsv.startsWith('\uFEFF')).toBe(true);

      // UTF-8 BOM validation
      expect(csv.startsWith('\uFEFF')).toBe(true);

      // Headers check
      const firstLine = csv.slice(1).split('\r\n')[0];
      expect(firstLine).toBe('单词,音标,语境释义,完整释义,例句,语境片段,标签,收藏时间');

      // Special characters properly escaped with double quotes
      expect(csv).toContain('""gold standard""');
      expect(csv).toContain('"This sets a new benchmark for speed, quality, and cost."');
      expect(csv).toContain('"Sentence with, comma and ""quotes""."');

      // Security redline: NEVER leak API key or system credentials
      expect(csv).not.toContain('api_key');
      expect(csv).not.toContain('sk-');
      expect(csv).not.toContain('sensenova');
      expect(csv).not.toContain('baseURL');
    });
  });

  describe('In-Memory Translation History Ring Buffer (RM-04 / IA-14/15/26/27)', () => {
    it('should store up to 20 items in memory in reverse chronological order', () => {
      const history = new TranslationHistoryService();
      expect(history.getRecords()).toEqual([]);

      const mockResult: TranslationResult = {
        mode: 'word',
        data: {
          word: 'test',
          phonetic_us: 'test',
          phonetic_uk: null,
          context_sense: '测试',
          context_snippet: null,
          senses: [{ pos: 'n.', def: '测试', example: 'unit test' }],
        },
      };

      // Add 25 records
      for (let i = 1; i <= 25; i++) {
        history.addRecord({
          id: `req-${i}`,
          timestamp: 1000 + i,
          source: i % 2 === 0 ? 'card' : 'home',
          mode: 'word',
          text: `word-${i}`,
          result: mockResult,
        });
      }

      const records = history.getRecords();
      expect(records.length).toBe(20);
      // Newest should be at front
      expect(records[0].id).toBe('req-25');
      expect(records[0].text).toBe('word-25');
      expect(records[19].id).toBe('req-6');
    });

    it('should delete individual item and clear all history', () => {
      const history = new TranslationHistoryService();
      const mockResult: TranslationResult = {
        mode: 'sentence',
        data: { text: '你好' },
      };

      history.addRecord({
        id: 'req-1',
        timestamp: 1000,
        source: 'card',
        mode: 'sentence',
        text: 'hello',
        result: mockResult,
      });
      history.addRecord({
        id: 'req-2',
        timestamp: 2000,
        source: 'home',
        mode: 'sentence',
        text: 'world',
        result: mockResult,
      });

      expect(history.getRecords().length).toBe(2);

      history.deleteRecord('req-1');
      expect(history.getRecords().length).toBe(1);
      expect(history.getRecords()[0].id).toBe('req-2');

      history.clearRecords();
      expect(history.getRecords().length).toBe(0);
    });
  });
});
