import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeFingerprint,
  findLatestReviewFile,
  parseExistingDashboard,
} from '../../src/core/diff.ts';

describe('computeFingerprint', () => {
  it('normalizes path separators and case', () => {
    const fpWindows = computeFingerprint('Packages\\Main\\Src\\App.ts', 'some error description');
    const fpPosix = computeFingerprint('packages/main/src/app.ts', 'some error description');
    expect(fpWindows).toBe(fpPosix);
  });

  it('eliminates line numbers so code shifts do not alter fingerprint', () => {
    const fpAtLine10 = computeFingerprint('packages/main/app.ts', '在 L10 发现魔法数字 1000');
    const fpAtLine25 = computeFingerprint('packages/main/app.ts', '在 L25 发现魔法数字 1000');
    const fpWithChineseLine = computeFingerprint(
      'packages/main/app.ts',
      '在 80 行发现魔法数字 1000',
    );

    expect(fpAtLine10).toBe(fpAtLine25);
    expect(fpAtLine10).toBe(fpWithChineseLine);
  });

  it('normalizes special punctuation before comparing content', () => {
    const noisy = computeFingerprint('file.ts', '发现 `foo()` 调用!! 与 bar: baz?');
    const normalized = computeFingerprint('file.ts', '发现foo调用与barbaz');
    expect(noisy).toBe(normalized);
  });

  it('truncates normalized content to 160 characters', () => {
    const fp = computeFingerprint('file.ts', 'A'.repeat(200));
    const [, contentPart] = fp.split('::');
    expect(contentPart).toBe('A'.repeat(160));
  });
});

describe('parseExistingDashboard', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-review-diff-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns empty Map for non-existent file', () => {
    const map = parseExistingDashboard(path.join(tempDir, 'missing.md'));
    expect(map.size).toBe(0);
  });

  it('correctly parses issue path, line, user note, and ignore status', () => {
    const markdownContent = `# AI 代码评审看板

##### Issue #1: \`packages/main/src/service.ts\` (42 行) - [MAINTAINABILITY]
- [x] **采纳修复 (默认修复)**
- [ ] **忽略本项**
- **问题说明**: 发现未捕获异常
> **人工批注 / 修改要求**: 请提取为命名常量

##### Issue #2: \`packages/renderer/src/index.tsx\` (100 行) - [STYLE]
- [ ] **采纳修复 (默认忽略)**
- [x] **忽略本项**
- **问题说明**: 建议添加注释说明
> **人工批注 / 修改要求**: _(默认忽略；如需采纳或有说明请在此填写)_
`;

    const filePath = path.join(tempDir, 'round-1.md');
    fs.writeFileSync(filePath, markdownContent, 'utf-8');

    const result = parseExistingDashboard(filePath);
    expect(result.size).toBe(2);

    const fp1 = computeFingerprint('packages/main/src/service.ts', '发现未捕获异常');
    const issue1 = result.get(fp1);
    expect(issue1?.path).toBe('packages/main/src/service.ts');
    expect(issue1?.line).toBe(42);
    expect(issue1?.userNote).toBe('请提取为命名常量');
    expect(issue1?.isIgnored).toBe(false);

    const fp2 = computeFingerprint('packages/renderer/src/index.tsx', '建议添加注释说明');
    const issue2 = result.get(fp2);
    expect(issue2?.isIgnored).toBe(true);
    // 默认占位符提示应当被清洗掉
    expect(issue2?.userNote).toBe('');
  });

  it('strips historical note inheritance suffix', () => {
    const markdownContent = `
##### Issue #1: \`packages/foo.ts\` (10 行)
- [x] **采纳修复**
- **问题说明**: 某问题
> **人工批注 / 修改要求**: 自定义意见 *(继承自上一轮批注)*
`;
    const filePath = path.join(tempDir, 'round-2.md');
    fs.writeFileSync(filePath, markdownContent, 'utf-8');

    const result = parseExistingDashboard(filePath);
    const fp = computeFingerprint('packages/foo.ts', '某问题');
    expect(result.get(fp)?.userNote).toBe('自定义意见');
  });
});

describe('findLatestReviewFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-review-latest-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns null when review directory does not exist or has no files', () => {
    expect(findLatestReviewFile(path.join(tempDir, 'empty'), 38, 'feat/foo')).toBeNull();
    expect(findLatestReviewFile(tempDir, 38, 'feat/foo')).toBeNull();
  });

  it('sorts numerically so round-10 is identified as newer than round-2 (not alphabetical)', () => {
    fs.writeFileSync(path.join(tempDir, 'pr-38-round-1.md'), '');
    fs.writeFileSync(path.join(tempDir, 'pr-38-round-2.md'), '');
    fs.writeFileSync(path.join(tempDir, 'pr-38-round-10.md'), '');

    const latest = findLatestReviewFile(tempDir, 38, 'feat/foo');
    expect(latest).toBe(path.join(tempDir, 'pr-38-round-10.md'));
  });

  it('filters by PR number and does not match other PR files', () => {
    fs.writeFileSync(path.join(tempDir, 'pr-34-round-5.md'), '');
    fs.writeFileSync(path.join(tempDir, 'pr-38-round-1.md'), '');

    const latestFor38 = findLatestReviewFile(tempDir, 38, 'feat/foo');
    expect(latestFor38).toBe(path.join(tempDir, 'pr-38-round-1.md'));
  });

  it('supports branch prefix when prNumber is null', () => {
    fs.writeFileSync(path.join(tempDir, 'branch-feat_my-feature-round-1.md'), '');
    fs.writeFileSync(path.join(tempDir, 'branch-feat_my-feature-round-3.md'), '');

    const latest = findLatestReviewFile(tempDir, null, 'feat/my-feature');
    expect(latest).toBe(path.join(tempDir, 'branch-feat_my-feature-round-3.md'));
  });

  it('excludes excludeFilePath to locate the second-latest review file when current round file already exists', () => {
    fs.writeFileSync(path.join(tempDir, 'pr-38-round-1.md'), '');
    fs.writeFileSync(path.join(tempDir, 'pr-38-round-2.md'), '');
    fs.writeFileSync(path.join(tempDir, 'pr-38-round-3.md'), '');

    const currentOutputFile = path.join(tempDir, 'pr-38-round-3.md');
    const previous = findLatestReviewFile(tempDir, 38, 'feat/foo', currentOutputFile);
    expect(previous).toBe(path.join(tempDir, 'pr-38-round-2.md'));
  });

  it('returns null if the only matching file is the excluded file', () => {
    fs.writeFileSync(path.join(tempDir, 'pr-38-round-1.md'), '');
    const currentOutputFile = path.join(tempDir, 'pr-38-round-1.md');
    const previous = findLatestReviewFile(tempDir, 38, 'feat/foo', currentOutputFile);
    expect(previous).toBeNull();
  });
});
