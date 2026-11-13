import type {
  BranchContext,
  CiCheck,
  CommitSummary,
  ConflictCheckResult,
  CreatePrInput,
  CreatePrResult,
  MergePrInput,
  PrDetails,
  VcsProvider,
} from '../ports/vcs-provider.ts';
import { ensureGhAuth, getCurrentBranch, getDefaultBranch } from '../utils/git.ts';
import { probe, probeRaw, runOrThrow, safeParseJson } from '../utils/process.ts';

export class CliVcsAdapter implements VcsProvider {
  ensureAuth(): void {
    ensureGhAuth();
  }

  getBranchContext(): Promise<BranchContext> {
    const currentBranch = getCurrentBranch();
    const defaultBranch = process.env.DEFAULT_BRANCH || getDefaultBranch();
    const statusOutput = probe('git', ['status', '--porcelain']) ?? '';
    const uncommittedFiles = statusOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim());

    return Promise.resolve({
      currentBranch,
      defaultBranch,
      isClean: uncommittedFiles.length === 0,
      uncommittedFiles,
    });
  }

  getCommitsAgainst(baseBranch: string): Promise<CommitSummary[]> {
    runOrThrow('git', ['fetch', 'origin', baseBranch]);
    const range = `origin/${baseBranch}..HEAD`;
    const subjectsRaw = probe('git', ['log', '--reverse', '--format=%H%x09%s', range]) ?? '';
    if (!subjectsRaw.trim()) {
      return Promise.resolve([]);
    }

    const lines = subjectsRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const summaries: CommitSummary[] = lines.map((line) => {
      const [sha = '', ...rest] = line.split('\t');
      const subject = rest.join('\t');
      return { sha, subject, body: '' };
    });

    if (summaries.length > 0 && summaries[0]) {
      const firstSha = summaries[0].sha;
      const body = probe('git', ['log', '-1', '--format=%b', firstSha]) ?? '';
      summaries[0].body = body;
    }

    return Promise.resolve(summaries);
  }

  checkConflict(branch: string, targetBranch: string): Promise<ConflictCheckResult> {
    runOrThrow('git', ['fetch', 'origin', targetBranch]);
    const prJson = probe('gh', ['pr', 'view', branch, '--json', 'baseRefName,mergeable']);
    const prData = safeParseJson<{ baseRefName?: string; mergeable?: string }>(prJson);
    const resolvedTarget = prData?.baseRefName ?? targetBranch;

    if (prData?.mergeable === 'CONFLICTING') {
      return Promise.resolve({
        hasConflict: true,
        targetBranch: resolvedTarget,
        details: 'GitHub 标记该 PR 处于 CONFLICTING 状态',
      });
    }

    const mergeTreeResult = probeRaw('git', [
      'merge-tree',
      '--write-tree',
      branch,
      `origin/${resolvedTarget}`,
    ]);
    if (mergeTreeResult.error) {
      return Promise.reject(
        new Error(`无法执行 git merge-tree 冲突检测: ${mergeTreeResult.error.message}`),
      );
    }
    if (mergeTreeResult.status === 1) {
      return Promise.resolve({
        hasConflict: true,
        targetBranch: resolvedTarget,
        details: `git merge-tree 预演检测到与 origin/${resolvedTarget} 存在冲突`,
      });
    }
    if (mergeTreeResult.status !== 0) {
      const reason = mergeTreeResult.stderr || mergeTreeResult.stdout || '未知错误';
      return Promise.reject(
        new Error(
          `git merge-tree 冲突检测异常失败 (退出码 ${mergeTreeResult.status ?? 'null'}): ${reason}`,
        ),
      );
    }

    return Promise.resolve({
      hasConflict: false,
      targetBranch: resolvedTarget,
    });
  }

  getPrForBranch(branch: string): Promise<PrDetails | null> {
    const raw = probe('gh', [
      'pr',
      'view',
      branch,
      '--json',
      'number,title,url,baseRefName,headRefName,mergeable',
    ]);
    if (!raw) return Promise.resolve(null);

    const parsed = safeParseJson<{
      number?: number;
      title?: string;
      url?: string;
      baseRefName?: string;
      headRefName?: string;
      mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
    }>(raw);

    if (!parsed?.number) return Promise.resolve(null);

    return Promise.resolve({
      number: parsed.number,
      title: parsed.title || '',
      url: parsed.url || '',
      baseRefName: parsed.baseRefName || '',
      headRefName: parsed.headRefName || branch,
      mergeable: parsed.mergeable,
    });
  }

  pushBranch(branch: string): Promise<void> {
    runOrThrow('git', ['push', '-u', 'origin', branch]);
    return Promise.resolve();
  }

  createPr(input: CreatePrInput): Promise<CreatePrResult> {
    runOrThrow('gh', [
      'pr',
      'create',
      '--base',
      input.base,
      '--head',
      input.head,
      '--title',
      input.title,
      '--body',
      input.body,
    ]);

    const created = probe('gh', ['pr', 'view', input.head, '--json', 'number,url']);
    const parsed = safeParseJson<{ number?: number; url?: string }>(created);
    if (!parsed?.number) {
      throw new Error(`无法确认 PR 创建状态: 未能在分支 "${input.head}" 上查询到已创建的 PR`);
    }

    return Promise.resolve({
      number: parsed.number,
      url: parsed.url,
    });
  }

  getRequiredCheckNames(baseBranch: string): Promise<string[] | null> {
    const encodedBranch = encodeURIComponent(baseBranch);
    const raw = probe('gh', [
      'api',
      `repos/{owner}/{repo}/branches/${encodedBranch}/protection`,
      '--jq',
      '.required_status_checks.contexts[]',
    ]);

    if (raw === null) return Promise.resolve(null);
    const contexts = raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return Promise.resolve(contexts);
  }

  getChecks(branch: string): Promise<CiCheck[] | null> {
    const raw = probe('gh', ['pr', 'checks', branch, '--json', 'name,state']);
    if (raw === null) return Promise.resolve(null);

    try {
      const parsed = JSON.parse(raw) as Array<{
        name?: string;
        context?: string;
        state?: string;
        status?: string;
        conclusion?: string;
      }>;

      return Promise.resolve(
        parsed.map((c) => ({
          name: c.name ?? c.context ?? '',
          state: (
            c.state ||
            c.conclusion ||
            c.status ||
            'PENDING'
          ).toUpperCase() as CiCheck['state'],
        })),
      );
    } catch {
      return Promise.resolve([]);
    }
  }

  mergePr(input: MergePrInput): Promise<void> {
    const args = ['pr', 'merge', input.branch];
    if (input.squash) args.push('--squash');
    if (input.deleteBranch) args.push('--delete-branch');
    runOrThrow('gh', args);
    return Promise.resolve();
  }

  commentPr(prNumberOrBranch: string, body: string): Promise<void> {
    runOrThrow('gh', ['pr', 'comment', prNumberOrBranch, '--body', body]);
    return Promise.resolve();
  }

  showStatus(): Promise<void> {
    runOrThrow('gh', ['pr', 'status']);
    return Promise.resolve();
  }
}
