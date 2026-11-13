import { describe, expect, it, vi } from 'vitest';
import { InMemoryVcsAdapter } from '../../src/adapters/in-memory-vcs.ts';
import { PrWorkflowEngine } from '../../src/core/workflow-engine.ts';

describe('PrWorkflowEngine', () => {
  const dummyClock = {
    sleep: vi.fn().mockResolvedValue(undefined),
  };

  describe('createPr', () => {
    it('throws if workspace is dirty', async () => {
      const vcs = new InMemoryVcsAdapter({
        isClean: false,
        uncommittedFiles: ['packages/pr-review/src/cli.ts'],
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      await expect(engine.createPr()).rejects.toThrow('工作区存在未提交变更');
    });

    it('throws if current branch is main', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'main',
        defaultBranch: 'main',
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      await expect(engine.createPr()).rejects.toThrow('请在 feature 分支上执行');
    });

    it('throws if no commits relative to main', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/empty',
        commits: [],
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      await expect(engine.createPr()).rejects.toThrow('分支上没有相对 main 的提交');
    });

    it('throws if branch already has a PR', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/has-pr',
        commits: [{ sha: '1', subject: 'feat: add', body: '' }],
        existingPr: {
          number: 12,
          title: 'Existing',
          url: 'http://pr/12',
          baseRefName: 'main',
          headRefName: 'feat/has-pr',
        },
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      await expect(engine.createPr()).rejects.toThrow('已有 PR');
    });

    it('pushes branch and creates PR successfully', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/new-feature',
        commits: [{ sha: 'sha1', subject: 'feat: add new feature', body: 'Intent description' }],
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      const result = await engine.createPr();
      expect(vcs.pushedBranches).toContain('feat/new-feature');
      expect(vcs.createdPrs).toHaveLength(1);
      expect(vcs.createdPrs[0]?.title).toBe('feat: add new feature');
      expect(vcs.createdPrs[0]?.body).toContain('Intent description');
      expect(vcs.createdPrs[0]?.body).toContain('- feat: add new feature');
      expect(result.number).toBe(1);
    });
  });

  describe('conflict preflight', () => {
    it('detects when conflict exists with target branch', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/conflict',
        hasConflict: true,
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      const check = await engine.checkConflict();
      expect(check.hasConflict).toBe(true);
      expect(check.targetBranch).toBe('main');
    });

    it('detects clean mergeable state', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/clean',
        hasConflict: false,
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      const check = await engine.checkConflict();
      expect(check.hasConflict).toBe(false);
    });
  });

  describe('waitForChecks', () => {
    it('succeeds immediately if all checks pass on first poll', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/checks',
        requiredChecks: ['typecheck', 'lint'],
        checksPollSequence: [
          [
            { name: 'typecheck', state: 'SUCCESS' },
            { name: 'lint', state: 'SUCCESS' },
          ],
        ],
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      const res = await engine.waitForChecks('feat/checks');
      expect(res.status).toBe('PASSED');
      expect(res.checks).toHaveLength(2);
    });

    it('polls multiple times when pending then passes', async () => {
      const clock = { sleep: vi.fn().mockResolvedValue(undefined) };
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/checks',
        requiredChecks: ['typecheck'],
        checksPollSequence: [
          [{ name: 'typecheck', state: 'PENDING' }],
          [{ name: 'typecheck', state: 'SUCCESS' }],
        ],
      });
      const engine = new PrWorkflowEngine({ vcs, clock });

      const res = await engine.waitForChecks('feat/checks');
      expect(res.status).toBe('PASSED');
      expect(clock.sleep).toHaveBeenCalledTimes(1);
    });

    it('fails fast when a required check fails', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/checks',
        requiredChecks: ['typecheck'],
        checksPollSequence: [[{ name: 'typecheck', state: 'FAILURE' }]],
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      await expect(engine.waitForChecks('feat/checks')).rejects.toThrow(
        '门禁失败: typecheck (FAILURE)',
      );
    });

    it('throws timeout error when exceeding maxPolls', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/checks',
        requiredChecks: ['typecheck'],
        checksPollSequence: [[{ name: 'typecheck', state: 'PENDING' }]],
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      await expect(
        engine.waitForChecks('feat/checks', { maxPolls: 3, pollIntervalMs: 10 }),
      ).rejects.toThrow('门禁等待超时');
    });
  });

  describe('mergePr', () => {
    it('aborts immediately before prompt if conflict exists', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/conflict',
        hasConflict: true,
      });
      const confirmMerge = vi.fn();
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock, confirmMerge });

      await expect(engine.mergePr()).rejects.toThrow('存在代码冲突');
      expect(confirmMerge).not.toHaveBeenCalled();
      expect(vcs.mergedPrs).toHaveLength(0);
    });

    it('cancels merge gracefully if user rejects prompt', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/cancel',
        hasConflict: false,
      });
      const confirmMerge = vi.fn().mockResolvedValue(false);
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock, confirmMerge });

      const result = await engine.mergePr();
      expect(result.cancelled).toBe(true);
      expect(vcs.mergedPrs).toHaveLength(0);
    });

    it('waits for checks and squash merges when confirmed', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/merge',
        hasConflict: false,
        requiredChecks: ['typecheck'],
        checksPollSequence: [[{ name: 'typecheck', state: 'SUCCESS' }]],
      });
      const confirmMerge = vi.fn().mockResolvedValue(true);
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock, confirmMerge });

      const result = await engine.mergePr();
      expect(result.merged).toBe(true);
      expect(vcs.mergedPrs).toHaveLength(1);
      expect(vcs.mergedPrs[0]).toEqual({
        branch: 'feat/merge',
        squash: true,
        deleteBranch: true,
      });
    });
  });

  describe('triggerReview', () => {
    it('throws if branch has no open PR', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/no-pr',
        existingPr: null,
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      await expect(engine.triggerReview()).rejects.toThrow('尚未开启 PR');
    });

    it('comments /review on existing PR', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/ready',
        existingPr: {
          number: 42,
          title: 'Ready PR',
          url: 'http://pr/42',
          baseRefName: 'main',
          headRefName: 'feat/ready',
        },
      });
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock });

      const result = await engine.triggerReview();
      expect(result.number).toBe(42);
      expect(vcs.comments).toContainEqual({ target: '42', body: '/review' });
    });
  });

  describe('statusPr', () => {
    it('shows status and logs clean conflict state', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/clean',
        hasConflict: false,
      });
      const showStatusSpy = vi.spyOn(vcs, 'showStatus');
      const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock, logger });

      await engine.statusPr();
      expect(showStatusSpy).toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('无代码冲突'));
    });

    it('shows status and logs conflict warning when conflict exists', async () => {
      const vcs = new InMemoryVcsAdapter({
        currentBranch: 'feat/conflict',
        hasConflict: true,
      });
      const showStatusSpy = vi.spyOn(vcs, 'showStatus');
      const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const engine = new PrWorkflowEngine({ vcs, clock: dummyClock, logger });

      await engine.statusPr();
      expect(showStatusSpy).toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('存在代码冲突'));
    });
  });
});
