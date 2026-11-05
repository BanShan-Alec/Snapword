import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanOldReviewFiles } from '../../src/core/cleaner.ts';

describe('cleanOldReviewFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-review-cleaner-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('safely handles non-existent directory without throwing', () => {
    const nonExistent = path.join(tempDir, 'does-not-exist');
    expect(() => cleanOldReviewFiles(nonExistent)).not.toThrow();
  });

  it('keeps all files when count equals the retention limit', () => {
    for (let i = 1; i <= 10; i++) {
      const file = path.join(tempDir, `pr-1-round-${i}.md`);
      fs.writeFileSync(file, `Round ${i}`);
    }

    cleanOldReviewFiles(tempDir);
    const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBe(10);
  });

  it('deletes oldest files when count > 10, keeping the 10 newest', () => {
    const totalFiles = 13;
    const now = Date.now();

    for (let i = 1; i <= totalFiles; i++) {
      const file = path.join(tempDir, `pr-1-round-${i}.md`);
      fs.writeFileSync(file, `Round ${i}`);
      // 设置确定的 mtime 时间戳
      const mtime = new Date(now + i * 1000);
      fs.utimesSync(file, mtime, mtime);
    }

    cleanOldReviewFiles(tempDir);
    const remainingFiles = fs.readdirSync(tempDir).filter((f) => f.endsWith('.md'));
    expect(remainingFiles.length).toBe(10);

    // 最旧的 3 个应该被删除（round-1, round-2, round-3）
    expect(fs.existsSync(path.join(tempDir, 'pr-1-round-1.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'pr-1-round-2.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'pr-1-round-3.md'))).toBe(false);

    // 保留最新的 10 个（round-4 到 round-13）
    expect(fs.existsSync(path.join(tempDir, 'pr-1-round-4.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'pr-1-round-13.md'))).toBe(true);
  });

  it('only cleans markdown review files in a mixed directory over the limit', () => {
    const now = Date.now();
    for (let i = 1; i <= 12; i++) {
      const file = path.join(tempDir, `pr-1-round-${i}.md`);
      fs.writeFileSync(file, `Round ${i}`);
      const mtime = new Date(now + i * 1000);
      fs.utimesSync(file, mtime, mtime);
    }
    fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.md');
    fs.writeFileSync(path.join(tempDir, 'notes.txt'), 'keep me');
    fs.mkdirSync(path.join(tempDir, 'subfolder'));

    cleanOldReviewFiles(tempDir);

    const remainingMd = fs.readdirSync(tempDir).filter((f) => f.endsWith('.md'));
    expect(remainingMd.length).toBe(10);
    // 仅最旧的 2 个 Markdown 被删除
    expect(fs.existsSync(path.join(tempDir, 'pr-1-round-1.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'pr-1-round-2.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'pr-1-round-3.md'))).toBe(true);
    // 非 Markdown 文件与目录一律不动
    expect(fs.existsSync(path.join(tempDir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'notes.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'subfolder'))).toBe(true);
  });
});
