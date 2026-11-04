import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cleanArchivedLogs,
  createCustomArchiveLogFn,
  formatArchiveTimestamp,
  getAvailableArchivePath,
} from '@app/main/modules/log-archiver';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Log Archiver', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-archiver-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('formatArchiveTimestamp', () => {
    it('should format date to YYYY-MM-DD_HH-mm-ss correctly', () => {
      const date = new Date(2026, 9, 9, 14, 5, 8); // Note: month is 0-indexed (9 = Oct)
      const formatted = formatArchiveTimestamp(date);
      expect(formatted).toBe('2026-10-09_14-05-08');
    });
  });

  describe('getAvailableArchivePath', () => {
    it('should return timestamped path when file does not exist', () => {
      const date = new Date(2026, 9, 9, 10, 0, 0);
      const target = getAvailableArchivePath(tempDir, 'main', '.log', date);
      expect(path.basename(target)).toBe('main-2026-10-09_10-00-00.log');
    });

    it('should increment suffix counter if file already exists in same second', () => {
      const date = new Date(2026, 9, 9, 10, 0, 0);
      const firstPath = path.join(tempDir, 'main-2026-10-09_10-00-00.log');
      fs.writeFileSync(firstPath, 'first');

      const target2 = getAvailableArchivePath(tempDir, 'main', '.log', date);
      expect(path.basename(target2)).toBe('main-2026-10-09_10-00-00_1.log');

      fs.writeFileSync(target2, 'second');
      const target3 = getAvailableArchivePath(tempDir, 'main', '.log', date);
      expect(path.basename(target3)).toBe('main-2026-10-09_10-00-00_2.log');
    });
  });

  describe('cleanArchivedLogs', () => {
    it('should retain up to maxFilesPerCategory per category and remove excess oldest', () => {
      const now = Date.now();

      // Create 7 archive files for 'main'
      for (let i = 1; i <= 7; i++) {
        const filePath = path.join(tempDir, `main-2026-10-0${i}_10-00-00.log`);
        fs.writeFileSync(filePath, `content ${i}`);
        // Set mtime: i=1 is oldest, i=7 is newest
        const mtime = new Date(now - (8 - i) * 1000);
        fs.utimesSync(filePath, mtime, mtime);
      }

      // Create 3 archive files for 'traces'
      for (let i = 1; i <= 3; i++) {
        const filePath = path.join(tempDir, `traces-2026-10-0${i}_10-00-00.ndjson`);
        fs.writeFileSync(filePath, `trace ${i}`);
        const mtime = new Date(now - (4 - i) * 1000);
        fs.utimesSync(filePath, mtime, mtime);
      }

      cleanArchivedLogs(tempDir, { maxDays: 7, maxFilesPerCategory: 5 });

      const filesAfter = fs.readdirSync(tempDir);
      const mainFiles = filesAfter.filter((f) => f.startsWith('main-'));
      const traceFiles = filesAfter.filter((f) => f.startsWith('traces-'));

      expect(mainFiles).toHaveLength(5);
      expect(traceFiles).toHaveLength(3);

      // The oldest 2 main files (i=1, i=2) should have been pruned
      expect(mainFiles).not.toContain('main-2026-10-01_10-00-00.log');
      expect(mainFiles).not.toContain('main-2026-10-02_10-00-00.log');
      expect(mainFiles).toContain('main-2026-10-07_10-00-00.log');
    });

    it('should prune files older than maxDays', () => {
      const now = Date.now();
      const expiredPath = path.join(tempDir, 'main-2026-09-01_10-00-00.log');
      fs.writeFileSync(expiredPath, 'expired content');
      // 10 days old
      const oldTime = new Date(now - 10 * 24 * 60 * 60 * 1000);
      fs.utimesSync(expiredPath, oldTime, oldTime);

      const recentPath = path.join(tempDir, 'main-2026-10-08_10-00-00.log');
      fs.writeFileSync(recentPath, 'recent content');

      cleanArchivedLogs(tempDir, { maxDays: 7, maxFilesPerCategory: 5 });

      const remaining = fs.readdirSync(tempDir);
      expect(remaining).not.toContain('main-2026-09-01_10-00-00.log');
      expect(remaining).toContain('main-2026-10-08_10-00-00.log');
    });

    it('should clean legacy .old files correctly', () => {
      const legacyPath = path.join(tempDir, 'main.old.log');
      fs.writeFileSync(legacyPath, 'legacy content');
      // Set to 8 days old
      const oldTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      fs.utimesSync(legacyPath, oldTime, oldTime);

      cleanArchivedLogs(tempDir, { maxDays: 7, maxFilesPerCategory: 5 });

      expect(fs.existsSync(legacyPath)).toBe(false);
    });
  });

  describe('createCustomArchiveLogFn', () => {
    it('should rotate file to timestamped archive and trigger cleanup', () => {
      const activeFile = path.join(tempDir, 'main.log');
      fs.writeFileSync(activeFile, 'log line 1\nlog line 2');

      const archiveFn = createCustomArchiveLogFn({ maxDays: 7, maxFilesPerCategory: 3 });

      archiveFn({
        toString: () => activeFile,
      });

      // active file was renamed
      expect(fs.existsSync(activeFile)).toBe(false);

      const files = fs.readdirSync(tempDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^main-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.log$/);
      expect(fs.readFileSync(path.join(tempDir, files[0]), 'utf-8')).toBe('log line 1\nlog line 2');
    });

    it('should prune older archives when multiple rotations exceed quota', async () => {
      const activeFile = path.join(tempDir, 'main.log');
      const archiveFn = createCustomArchiveLogFn({
        maxDays: 7,
        maxFilesPerCategory: 3,
        asyncCleanup: true,
      });

      // Rotate 5 times
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(activeFile, `content version ${i}`);
        archiveFn({ toString: () => activeFile });
      }

      // 等待 setImmediate 异步清理执行完毕
      await new Promise((resolve) => setImmediate(resolve));

      const files = fs.readdirSync(tempDir);
      // Only 3 files should be retained
      expect(files.length).toBe(3);
      for (const f of files) {
        expect(f).toMatch(/^main-/);
      }
    });

    it('should fallback to copy and truncate when rename fails due to file lock', () => {
      const activeFile = path.join(tempDir, 'traces.ndjson');
      fs.writeFileSync(activeFile, '{"span":"test"}\n');

      const archiveFn = createCustomArchiveLogFn({ maxDays: 7, maxFilesPerCategory: 3 });

      // Simulate renameSync throwing EBUSY
      const originalRename = fs.renameSync;
      fs.renameSync = () => {
        const err = new Error('EBUSY: resource locked');
        (err as NodeJS.ErrnoException).code = 'EBUSY';
        throw err;
      };

      try {
        archiveFn({ toString: () => activeFile });

        // Target archive should exist with original content
        const files = fs.readdirSync(tempDir).filter((f) => f.startsWith('traces-'));
        expect(files.length).toBe(1);
        expect(fs.readFileSync(path.join(tempDir, files[0]), 'utf-8')).toBe('{"span":"test"}\n');

        // Original file was truncated to 0 bytes
        expect(fs.readFileSync(activeFile, 'utf-8')).toBe('');
      } finally {
        fs.renameSync = originalRename;
      }
    });
  });
});
