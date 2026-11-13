import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliVcsAdapter } from '../../src/adapters/cli-vcs.ts';
import { InMemoryVcsAdapter } from '../../src/adapters/in-memory-vcs.ts';
import * as processUtils from '../../src/utils/process.ts';

describe('InMemoryVcsAdapter', () => {
  it('provides configured branch context and commits', async () => {
    const vcs = new InMemoryVcsAdapter({
      currentBranch: 'feat/test-branch',
      defaultBranch: 'main',
      isClean: true,
      commits: [{ sha: 'sha1', subject: 'feat: initial commit', body: 'some details' }],
    });

    const ctx = await vcs.getBranchContext();
    expect(ctx.currentBranch).toBe('feat/test-branch');
    expect(ctx.isClean).toBe(true);

    const commits = await vcs.getCommitsAgainst('main');
    expect(commits).toHaveLength(1);
    expect(commits[0]?.subject).toBe('feat: initial commit');
  });

  it('records pushed branches and PR creation with dynamic numbering', async () => {
    const vcs = new InMemoryVcsAdapter({
      currentBranch: 'feat/pr-1',
      defaultBranch: 'main',
      isClean: true,
    });

    await vcs.pushBranch('feat/pr-1');
    expect(vcs.pushedBranches).toContain('feat/pr-1');

    const created1 = await vcs.createPr({
      base: 'main',
      head: 'feat/pr-1',
      title: 'feat: add feature 1',
      body: 'PR body 1',
    });
    expect(created1.number).toBe(1);

    const created2 = await vcs.createPr({
      base: 'develop',
      head: 'feat/pr-2',
      title: 'feat: add feature 2',
      body: 'PR body 2',
    });
    expect(created2.number).toBe(2);

    const pr2 = await vcs.getPrForBranch('feat/pr-2');
    expect(pr2?.number).toBe(2);
    expect(pr2?.baseRefName).toBe('develop');

    const conflict = await vcs.checkConflict('feat/pr-2', 'main');
    expect(conflict.targetBranch).toBe('develop');
  });

  it('resets internal state when reset() is called', async () => {
    const vcs = new InMemoryVcsAdapter({
      checksPollSequence: [[{ name: 'test', state: 'PENDING' }]],
    });

    await vcs.getChecks('feat/test');
    expect(vcs.currentPollIndex).toBe(1);

    vcs.reset();
    expect(vcs.currentPollIndex).toBe(0);
    expect(vcs.createdPrs).toHaveLength(0);
  });

  it('reports conflict according to preset status', async () => {
    const vcs = new InMemoryVcsAdapter({
      currentBranch: 'feat/conflict',
      defaultBranch: 'main',
      hasConflict: true,
    });

    const conflict = await vcs.checkConflict('feat/conflict', 'main');
    expect(conflict.hasConflict).toBe(true);
  });
});

describe('CliVcsAdapter.checkConflict', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns hasConflict=false when git merge-tree exits with 0', async () => {
    vi.spyOn(processUtils, 'runOrThrow').mockImplementation(() => {});
    vi.spyOn(processUtils, 'probe').mockReturnValue(
      JSON.stringify({ baseRefName: 'main', mergeable: 'MERGEABLE' }),
    );
    vi.spyOn(processUtils, 'probeRaw').mockReturnValue({
      status: 0,
      stdout: 'tree-sha',
      stderr: '',
    });

    const vcs = new CliVcsAdapter();
    const result = await vcs.checkConflict('feat/clean', 'main');

    expect(result).toEqual({
      hasConflict: false,
      targetBranch: 'main',
    });
  });

  it('returns hasConflict=true when git merge-tree exits with 1', async () => {
    vi.spyOn(processUtils, 'runOrThrow').mockImplementation(() => {});
    vi.spyOn(processUtils, 'probe').mockReturnValue(
      JSON.stringify({ baseRefName: 'main', mergeable: 'UNKNOWN' }),
    );
    vi.spyOn(processUtils, 'probeRaw').mockReturnValue({
      status: 1,
      stdout: 'CONFLICT (content): Merge conflict in foo.ts',
      stderr: '',
    });

    const vcs = new CliVcsAdapter();
    const result = await vcs.checkConflict('feat/conflict', 'main');

    expect(result.hasConflict).toBe(true);
    expect(result.targetBranch).toBe('main');
    expect(result.details).toContain('git merge-tree');
  });

  it('throws when git merge-tree fails with unexpected exit code such as 128', async () => {
    vi.spyOn(processUtils, 'runOrThrow').mockImplementation(() => {});
    vi.spyOn(processUtils, 'probe').mockReturnValue(null);
    vi.spyOn(processUtils, 'probeRaw').mockReturnValue({
      status: 128,
      stdout: '',
      stderr: 'fatal: Not a valid object name origin/main',
    });

    const vcs = new CliVcsAdapter();
    await expect(vcs.checkConflict('feat/invalid', 'main')).rejects.toThrow(
      'git merge-tree 冲突检测异常失败 (退出码 128)',
    );
  });

  it('throws when git merge-tree cannot be spawned', async () => {
    vi.spyOn(processUtils, 'runOrThrow').mockImplementation(() => {});
    vi.spyOn(processUtils, 'probe').mockReturnValue(null);
    vi.spyOn(processUtils, 'probeRaw').mockReturnValue({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('spawnSync git ENOENT'),
    });

    const vcs = new CliVcsAdapter();
    await expect(vcs.checkConflict('feat/enoent', 'main')).rejects.toThrow(
      '无法执行 git merge-tree 冲突检测: spawnSync git ENOENT',
    );
  });
});
