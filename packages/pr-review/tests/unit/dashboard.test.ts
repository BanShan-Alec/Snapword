import { describe, expect, it } from 'vitest';
import { formatDashboard } from '../../src/core/dashboard.ts';
import { computeFingerprint } from '../../src/core/diff.ts';
import type { CiCheckItem, HistoricalIssueState, OcrResult, RunInfo } from '../../src/types.ts';

describe('formatDashboard', () => {
  const baseRunInfo: RunInfo = {
    id: '123456',
    round: 2,
    totalRuns: 2,
    status: 'success',
  };

  it('correctly renders header with PR number, round, and run ID', () => {
    const md = formatDashboard(
      'feat/test',
      38,
      'owner/repo',
      'sha123',
      baseRunInfo,
      { comments: [] },
      new Map(),
      new Map(),
      [],
    );

    expect(md).toContain('# 🛡️ AI 代码质量评审看板 (PR #38 - 第 2 轮)');
    expect(md).toContain('[#38](https://github.com/owner/repo/pull/38)');
    expect(md).toContain('Run ID: `123456`');
  });

  it('sorts CI Checks by established priority and maps statuses', () => {
    const ciChecks: CiCheckItem[] = [
      { name: 'e2e', conclusion: 'SUCCESS', detailsUrl: 'http://e2e' },
      { name: 'lint', conclusion: 'SUCCESS', detailsUrl: 'http://lint' },
      { name: 'typecheck', conclusion: 'FAILURE', detailsUrl: 'http://typecheck' },
    ];

    const md = formatDashboard(
      'feat/test',
      38,
      'owner/repo',
      'sha123',
      baseRunInfo,
      { comments: [] },
      new Map(),
      new Map(),
      ciChecks,
    );

    const lintIndex = md.indexOf('**lint**');
    const typecheckIndex = md.indexOf('**typecheck**');
    const e2eIndex = md.indexOf('**e2e**');

    // Priority: lint (1) < typecheck (2) < e2e (4)
    expect(lintIndex).toBeLessThan(typecheckIndex);
    expect(typecheckIndex).toBeLessThan(e2eIndex);

    expect(md).toContain('**lint** | ✅ Pass');
    expect(md).toContain('**typecheck** | ❌ Fail');
  });

  it.each([
    ['CANCELLED', '', '⚪ Cancelled'],
    ['SKIPPED', '', '⏭️ Skipped'],
    ['TIMED_OUT', '', '⏰ Timed out'],
    ['', 'IN_PROGRESS', '🟡 Running'],
    ['', 'QUEUED', '⚪ Queued'],
  ])('maps CI conclusion %s / status %s to its badge', (conclusion, status, badge) => {
    const ciChecks: CiCheckItem[] = [{ name: 'test', conclusion, status, detailsUrl: '' }];

    const md = formatDashboard(
      'feat/test',
      38,
      'owner/repo',
      'sha123',
      baseRunInfo,
      { comments: [] },
      new Map(),
      new Map(),
      ciChecks,
    );

    expect(md).toContain(`| **test** | ${badge} |`);
  });

  it('renders resolved items with strikethrough when historical issue is absent in current run', () => {
    const historicalMap = new Map<string, HistoricalIssueState>();
    const resolvedFp = computeFingerprint('packages/main/old.ts', '这是上一轮报出的旧问题');
    historicalMap.set(resolvedFp, {
      path: 'packages/main/old.ts',
      line: 10,
      summary: '这是上一轮报出的旧问题',
      isIgnored: false,
      userNote: '',
      fingerprint: resolvedFp,
    });

    // 当前轮次中已无该问题
    const md = formatDashboard(
      'feat/test',
      38,
      'owner/repo',
      'sha123',
      baseRunInfo,
      { comments: [] },
      new Map(),
      new Map(historicalMap),
      [],
    );

    expect(md).toContain('### ✨ 上一轮已成功解决 (1 项)');
    expect(md).toContain('- ~~[`packages/main/old.ts`#L10] 这是上一轮报出的旧问题~~');
  });

  it('tags persisting issues as [🔄 持续存在] and inherits user notes', () => {
    const historicalMap = new Map<string, HistoricalIssueState>();
    const fp = computeFingerprint('packages/main/foo.ts', '持续存在的问题');
    historicalMap.set(fp, {
      path: 'packages/main/foo.ts',
      line: 20,
      summary: '持续存在的问题',
      isIgnored: false,
      userNote: '我的定制修改批注',
      fingerprint: fp,
    });

    const ocrResult: OcrResult = {
      comments: [
        {
          path: 'packages/main/foo.ts',
          line: 20,
          content: '持续存在的问题',
          severity: 'medium',
        },
      ],
    };

    const md = formatDashboard(
      'feat/test',
      38,
      'owner/repo',
      'sha123',
      baseRunInfo,
      ocrResult,
      new Map(),
      historicalMap,
      [],
    );

    expect(md).toContain('[⏳ 历史未决]');
    expect(md).toContain('我的定制修改批注 *(继承自上一轮批注)*');
    // Medium issue default: [x] 采纳修复
    expect(md).toContain('- [x] **采纳修复 (默认修复)**');
  });

  it('tags new issues as [🆕 本轮新增] and defaults low severity to ignored', () => {
    const ocrResult: OcrResult = {
      comments: [
        {
          path: 'packages/shared/bar.ts',
          line: 5,
          content: '这是一条低优建议',
          severity: 'low',
        },
      ],
    };

    const md = formatDashboard(
      'feat/test',
      38,
      'owner/repo',
      'sha123',
      baseRunInfo,
      ocrResult,
      new Map(),
      new Map(),
      [],
    );

    expect(md).toContain('[🆕 本轮新增]');
    expect(md).toContain('- [ ] **手动采纳修复 (默认忽略)**');
  });
});
