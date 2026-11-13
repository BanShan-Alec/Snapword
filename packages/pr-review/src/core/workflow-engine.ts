import fs from 'node:fs';
import path from 'node:path';
import {
  type CheckGateResult,
  CI_CHECK_FAILURE_STATES,
  CI_CHECK_PENDING_STATES,
  type CommitSummary,
  type ConflictCheckResult,
  type CreatePrResult,
  type PrDetails,
  type VcsProvider,
} from '../ports/vcs-provider.ts';
import { getRepoRoot } from '../utils/git.ts';

export interface Clock {
  sleep: (ms: number) => Promise<void>;
}

export interface WorkflowLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface MergeConfirmationInfo {
  branch: string;
  targetBranch: string;
}

export interface PrWorkflowEngineOptions {
  vcs: VcsProvider;
  clock?: Clock;
  logger?: WorkflowLogger;
  confirmMerge?: (info: MergeConfirmationInfo) => Promise<boolean> | boolean;
  repoRoot?: string;
}

export interface MergeResult {
  merged: boolean;
  cancelled?: boolean;
  branch: string;
  targetBranch: string;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_MAX_POLLS = 40;

export class PrWorkflowEngine {
  private readonly vcs: VcsProvider;
  private readonly clock: Clock;
  private readonly logger: WorkflowLogger;
  private readonly confirmMergeCallback?: (
    info: MergeConfirmationInfo,
  ) => Promise<boolean> | boolean;
  private readonly repoRoot: string;

  constructor(options: PrWorkflowEngineOptions) {
    this.vcs = options.vcs;
    this.clock = options.clock ?? {
      sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    };
    this.logger = options.logger ?? {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };
    this.confirmMergeCallback = options.confirmMerge;
    this.repoRoot = options.repoRoot ?? getRepoRoot();
  }

  private async preflight(): Promise<{ branch: string; defaultBranch: string }> {
    await this.vcs.ensureAuth();
    const ctx = await this.vcs.getBranchContext();
    if (!ctx.isClean) {
      const filesHint =
        ctx.uncommittedFiles.length > 0 ? ` (${ctx.uncommittedFiles.join(', ')})` : '';
      throw new Error(`工作区存在未提交变更: 先 commit 或 stash${filesHint}`);
    }

    const branch = ctx.currentBranch;
    const defaultBranch = ctx.defaultBranch;
    if (!branch || branch === defaultBranch || branch === 'HEAD') {
      throw new Error(`当前分支 "${branch || 'detached HEAD'}", 请在 feature 分支上执行`);
    }

    return { branch, defaultBranch };
  }

  private buildBody(commitList: CommitSummary[], intent: string): string {
    const fills: Record<string, string> = {
      '意图 / Intent': intent || '_（提交里没提取到动机，编辑本节补一句）_',
      '改动 / Changes': commitList.map((c) => `- ${c.subject}`).join('\n'),
      '人工验证 / Manual Verification': '- [ ] （列出 CI 查不了的人工验证项；无则删掉本节）',
    };

    const templatePath = path.join(this.repoRoot, '.github/PULL_REQUEST_TEMPLATE.md');
    let template = '';
    try {
      if (fs.existsSync(templatePath)) {
        template = fs.readFileSync(templatePath, 'utf-8');
      }
    } catch {
      // ignore
    }

    if (!template) {
      return `## 改动 / Changes\n\n${fills['改动 / Changes']}\n\n## 人工验证 / Manual Verification\n\n${fills['人工验证 / Manual Verification']}\n`;
    }

    const lines = template.split('\n');
    const out: string[] = [];
    let pendingFill: string | null = null;

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (pendingFill) {
          out.push('', pendingFill);
          pendingFill = null;
        }
        out.push(line);
        const headerTitle = line.replace(/^##\s+/, '').trim();
        const matchedKey = Object.keys(fills).find(
          (k) => headerTitle === k || headerTitle.startsWith(k.split(' / ')[0] ?? k),
        );
        pendingFill = matchedKey ? (fills[matchedKey] ?? null) : null;
      } else {
        out.push(line);
      }
    }

    if (pendingFill) {
      out.push('', pendingFill);
    }

    return `${out.join('\n').trim()}\n`;
  }

  async createPr(): Promise<CreatePrResult> {
    const { branch, defaultBranch } = await this.preflight();
    const commits = await this.vcs.getCommitsAgainst(defaultBranch);
    if (commits.length === 0) {
      throw new Error(`分支上没有相对 ${defaultBranch} 的提交, 无从生成 PR 标题`);
    }

    const existing = await this.vcs.getPrForBranch(branch);
    if (existing) {
      throw new Error(`分支 ${branch} 已有 PR: 直接 push 即可更新, 查看用 pnpm pr-review status`);
    }

    this.logger.log(`→ push -u origin ${branch}`);
    await this.vcs.pushBranch(branch);

    const title = commits[0]?.subject ?? '';
    const body = this.buildBody(commits, commits[0]?.body ?? '');

    this.logger.log('→ 创建 PR (标题 = 分支首个提交, 正文 = 模板骨架 + 自动填充)');
    const result = await this.vcs.createPr({
      base: defaultBranch,
      head: branch,
      title,
      body,
    });

    this.logger.log('\n后续: 门禁在 GitHub Actions 运行, 全绿后 pnpm pr-review merge');
    this.logger.log('正文若有占位未填(意图/人工验证), 用 gh pr edit --web 或 PR 页编辑补全');
    return result;
  }

  async checkConflict(
    branchName?: string,
    targetBranchName?: string,
  ): Promise<ConflictCheckResult> {
    const ctx = !branchName || !targetBranchName ? await this.vcs.getBranchContext() : null;
    const branch = branchName ?? ctx?.currentBranch ?? '';
    const targetBranch = targetBranchName ?? ctx?.defaultBranch ?? '';
    return this.vcs.checkConflict(branch, targetBranch);
  }

  async waitForChecks(
    branch: string,
    options?: { maxPolls?: number; pollIntervalMs?: number; baseBranch?: string },
  ): Promise<CheckGateResult> {
    const maxPolls = options?.maxPolls ?? DEFAULT_MAX_POLLS;
    const interval = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const baseBranch = options?.baseBranch ?? (await this.vcs.getBranchContext()).defaultBranch;
    const req = await this.vcs.getRequiredCheckNames(baseBranch);
    const isRequired = (name: string): boolean => (req === null ? true : req.includes(name));

    for (let poll = 1; poll <= maxPolls; poll++) {
      const rawChecks = await this.vcs.getChecks(branch);
      if (rawChecks === null) {
        this.logger.log(`  [${poll}/${maxPolls}] checks 尚未注册, ${interval / 1000}s 后重试…`);
        await this.clock.sleep(interval);
        continue;
      }

      const checks = rawChecks.filter((c) => isRequired(c.name));
      if (checks.length === 0) {
        this.logger.log(
          `  [${poll}/${maxPolls}] required checks 尚未上报, ${interval / 1000}s 后重试…`,
        );
        await this.clock.sleep(interval);
        continue;
      }

      const failed = checks.filter((c) =>
        (CI_CHECK_FAILURE_STATES as readonly string[]).includes(c.state),
      );
      if (failed.length > 0) {
        const detail = failed.map((c) => `${c.name} (${c.state})`).join(', ');
        throw new Error(`门禁失败: ${detail}\n修复后 push 触发重跑`);
      }

      const pending = checks.filter((c) =>
        (CI_CHECK_PENDING_STATES as readonly string[]).includes(c.state),
      );
      if (pending.length === 0) {
        this.logger.log(`✓ 所有 required checks 均已通过 (${checks.length} 项)`);
        return {
          status: 'PASSED',
          checks,
        };
      }

      this.logger.log(
        `  [${poll}/${maxPolls}] 仍在运行: ${pending.map((c) => c.name).join(', ')} (${interval / 1000}s 后检查)`,
      );
      await this.clock.sleep(interval);
    }

    throw new Error(`门禁等待超时 (${(interval * maxPolls) / 1000}s), 请至 GitHub 确认状态`);
  }

  async mergePr(options?: {
    yes?: boolean;
    maxPolls?: number;
    pollIntervalMs?: number;
  }): Promise<MergeResult> {
    const { branch, defaultBranch } = await this.preflight();
    this.logger.log('→ 检查与目标分支是否存在代码冲突…');

    const pr = await this.vcs.getPrForBranch(branch);
    const targetBranch = pr?.baseRefName ?? defaultBranch;

    const conflict = await this.vcs.checkConflict(branch, targetBranch);
    if (conflict.hasConflict) {
      const details = conflict.details ? `: ${conflict.details}` : '';
      throw new Error(
        `检测到分支 "${branch}" 与目标分支 "${targetBranch}" 存在代码冲突${details}，请在本地解决冲突并推送后再合并`,
      );
    }
    this.logger.log(`✓ 与 origin/${targetBranch} 无代码冲突（无需同步最新目标分支代码）`);

    if (!options?.yes && this.confirmMergeCallback) {
      const confirmed = await this.confirmMergeCallback({ branch, targetBranch });
      if (!confirmed) {
        this.logger.log('已取消合并操作。');
        return { merged: false, cancelled: true, branch, targetBranch };
      }
    }

    this.logger.log(`→ 等待 ${branch} 的门禁全绿…`);
    await this.waitForChecks(branch, {
      maxPolls: options?.maxPolls,
      pollIntervalMs: options?.pollIntervalMs,
      baseBranch: targetBranch,
    });

    this.logger.log('→ 门禁全绿, squash 合并并删除远端分支');
    await this.vcs.mergePr({
      branch,
      squash: true,
      deleteBranch: true,
    });

    this.logger.log(
      `\n已合并并删除远端分支。清理本地分支:\n  git checkout ${targetBranch}\n  git pull\n  git branch -d ${branch}`,
    );
    return { merged: true, branch, targetBranch };
  }

  async statusPr(): Promise<void> {
    await this.vcs.ensureAuth();
    await this.vcs.showStatus();

    const ctx = await this.vcs.getBranchContext();
    if (
      ctx.currentBranch &&
      ctx.currentBranch !== ctx.defaultBranch &&
      ctx.currentBranch !== 'HEAD'
    ) {
      const conflict = await this.checkConflict(ctx.currentBranch, ctx.defaultBranch);
      if (conflict.hasConflict) {
        this.logger.log(
          `\n\x1b[33m⚠️ 冲突警告: 当前分支与 origin/${conflict.targetBranch} 存在代码冲突，合并前需先解决冲突。\x1b[0m\n`,
        );
      } else {
        this.logger.log(
          `\n\x1b[32m✓ 冲突状态: 当前分支与 origin/${conflict.targetBranch} 无代码冲突（可直接合入，无需每次同步最新目标分支）。\x1b[0m\n`,
        );
      }
    }
  }

  async triggerReview(): Promise<PrDetails> {
    await this.vcs.ensureAuth();
    const ctx = await this.vcs.getBranchContext();
    const branch = ctx.currentBranch;
    if (!branch || branch === ctx.defaultBranch) {
      throw new Error(`无法对 ${branch || '当前'} 分支触发 Review: 请切换到具体的特性分支`);
    }

    const pr = await this.vcs.getPrForBranch(branch);
    if (!pr) {
      throw new Error(`分支 ${branch} 尚未开启 PR: 请先运行 pnpm pr-review create`);
    }

    this.logger.log(`→ 正在为 PR #${pr.number} (${pr.title || branch}) 触发 OpenCodeReview 审查…`);
    await this.vcs.commentPr(String(pr.number), '/review');
    this.logger.log('✓ 审查请求已成功发送！');
    return pr;
  }
}
