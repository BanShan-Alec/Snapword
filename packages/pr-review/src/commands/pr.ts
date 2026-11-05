import fs from 'node:fs';
import path from 'node:path';
import { ensureGhAuth, getCurrentBranch, getDefaultBranch, getRepoRoot } from '../utils/git.ts';
import { fail, probe, run, sleepSync } from '../utils/process.ts';

const MAIN_BRANCH = process.env.DEFAULT_BRANCH || getDefaultBranch();
const CHECKS_POLL_INTERVAL_MS = 15_000;
const CHECKS_MAX_POLLS = 40;

function getPrTemplatePath(): string {
  return path.join(getRepoRoot(), '.github/PULL_REQUEST_TEMPLATE.md');
}

function preflight(): string {
  ensureGhAuth();
  if (probe('git', ['status', '--porcelain']) !== '') {
    fail('工作区存在未提交变更: 先 commit 或 stash');
  }
  const branch = getCurrentBranch();
  if (!branch || branch === MAIN_BRANCH || branch === 'HEAD') {
    fail(`当前分支 "${branch || 'detached HEAD'}", 请在 feature 分支上执行`);
  }
  return branch;
}

function firstCommitBody(range: string): string {
  const sha = (probe('git', ['log', '--reverse', '--format=%H', range]) ?? '').split('\n')[0] ?? '';
  if (!sha) return '';
  return probe('git', ['log', '-1', '--format=%b', sha]) ?? '';
}

function buildBody(commitList: string[], intent: string): string {
  const fills: Record<string, string> = {
    意图: intent || '_（提交里没提取到动机，编辑本节补一句）_',
    改动: commitList.map((s) => `- ${s}`).join('\n'),
    人工验证: '- [ ] （列出 CI 查不了的人工验证项；无则删掉本节）',
  };
  const prTemplate = getPrTemplatePath();
  const template = fs.existsSync(prTemplate) ? fs.readFileSync(prTemplate, 'utf-8') : '';
  if (!template) {
    return `## 改动 / Changes\n\n${fills.改动}\n\n## 人工验证 / Manual Verification\n\n${fills.人工验证}\n`;
  }
  const out: string[] = [];
  for (const line of template.split('\n')) {
    if (!line.startsWith('## ')) continue;
    out.push(line, '');
    const headerTitle = line.replace(/^##\s+/, '').trim();
    const key = Object.keys(fills).find(
      (k) => headerTitle.startsWith(k) || headerTitle.includes(k),
    );
    if (key) out.push(fills[key] ?? '', '');
  }
  return `${out.join('\n').trim()}\n`;
}

export function createPr(): void {
  const branch = preflight();
  run('git', ['fetch', 'origin', MAIN_BRANCH]);
  const range = `origin/${MAIN_BRANCH}..HEAD`;
  const subjects = probe('git', ['log', '--reverse', '--format=%s', range]) ?? '';
  const commitList = subjects
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const title = commitList[0] ?? '';
  if (!title) fail(`分支上没有相对 ${MAIN_BRANCH} 的提交, 无从生成 PR 标题`);
  if (probe('gh', ['pr', 'view', branch, '--json', 'number']) !== null) {
    fail(`分支 ${branch} 已有 PR: 直接 push 即可更新, 查看用 pnpm pr-review status`);
  }

  console.log(`→ push -u origin ${branch}`);
  run('git', ['push', '-u', 'origin', 'HEAD']);

  const body = buildBody(commitList, firstCommitBody(range));
  console.log('→ gh pr create(标题 = 分支首个提交, 正文 = 模板骨架 + 自动填充)');
  run('gh', [
    'pr',
    'create',
    '--base',
    MAIN_BRANCH,
    '--head',
    branch,
    '--title',
    title,
    '--body',
    body,
  ]);
  console.log('\n后续: 门禁在 GitHub Actions 运行, 全绿后 pnpm pr-review merge');
  console.log('正文若有占位未填(意图/人工验证), 用 gh pr edit --web 或 PR 页编辑补全');
}

function requiredChecks(): string[] | null {
  const raw = probe('gh', [
    'api',
    `repos/{owner}/{repo}/branches/${MAIN_BRANCH}/protection`,
    '--jq',
    '.required_status_checks.contexts[]',
  ]);
  return raw === null
    ? null
    : raw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
}

interface GhCheck {
  name: string;
  state: string;
}

function parseChecks(jsonStr: string): GhCheck[] {
  try {
    const raw = JSON.parse(jsonStr) as Array<{
      name?: string;
      context?: string;
      state?: string;
      status?: string;
      conclusion?: string;
    }>;
    return raw.map((c) => ({
      name: c.name ?? c.context ?? '',
      state: (c.state ?? c.conclusion ?? c.status ?? 'PENDING').toUpperCase(),
    }));
  } catch {
    return [];
  }
}

function waitForChecks(branch: string): void {
  const req = requiredChecks();
  const isRequired = (name: string): boolean => (req === null ? true : req.includes(name));

  for (let poll = 1; poll <= CHECKS_MAX_POLLS; poll++) {
    const raw = probe('gh', ['pr', 'checks', branch, '--json', 'name,state']);
    if (raw === null) {
      console.log(`  [${poll}/${CHECKS_MAX_POLLS}] checks 尚未注册, 15s 后重试…`);
      sleepSync(CHECKS_POLL_INTERVAL_MS);
      continue;
    }
    const checks = parseChecks(raw).filter((c) => isRequired(c.name));
    if (checks.length === 0) {
      console.log(`  [${poll}/${CHECKS_MAX_POLLS}] required checks 尚未上报, 15s 后重试…`);
      sleepSync(CHECKS_POLL_INTERVAL_MS);
      continue;
    }

    const failed = checks.filter((c) =>
      ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(c.state),
    );
    if (failed.length > 0) {
      fail(
        `门禁失败:\n${failed.map((c) => `  - ${c.name}: ${c.state}`).join('\n')}\n修复后 push 触发重跑`,
      );
    }

    const pending = checks.filter((c) =>
      ['PENDING', 'IN_PROGRESS', 'QUEUED', 'WAITING'].includes(c.state),
    );
    if (pending.length === 0) {
      console.log(`✓ 所有 required checks 均已通过 (${checks.length} 项)`);
      return;
    }

    console.log(
      `  [${poll}/${CHECKS_MAX_POLLS}] 仍在运行: ${pending.map((c) => c.name).join(', ')} (15s 后检查)`,
    );
    sleepSync(CHECKS_POLL_INTERVAL_MS);
  }
  fail(
    `门禁等待超时 (${(CHECKS_POLL_INTERVAL_MS * CHECKS_MAX_POLLS) / 1000}s), 请至 GitHub 确认状态`,
  );
}

function printCleanupHint(branch: string): void {
  console.log('\n已合并并删除远端分支。清理本地分支:');
  console.log(`  git checkout ${MAIN_BRANCH}`);
  console.log(`  git pull`);
  console.log(`  git branch -d ${branch}`);
}

export function mergePr(): void {
  const branch = preflight();
  run('git', ['fetch', 'origin']);

  if (!process.argv.includes('--yes')) {
    process.stdout.write(`确认将 ${branch} 合并入 ${MAIN_BRANCH}? (y/N): `);
    let answer = '';
    try {
      const buffer = Buffer.alloc(1024);
      const bytesRead = fs.readSync(0, buffer, 0, 1024, null);
      answer = buffer.toString('utf-8', 0, bytesRead).trim();
    } catch {
      answer = '';
    }
    if (!/^y(es)?$/i.test(answer)) {
      console.log('已取消合并操作。');
      process.exit(0);
    }
  }

  console.log(`→ 等待 ${branch} 的门禁全绿…`);
  waitForChecks(branch);
  console.log('→ 门禁全绿, squash 合并并删除远端分支');
  run('gh', ['pr', 'merge', branch, '--squash', '--delete-branch']);
  printCleanupHint(branch);
}

export function statusPr(): void {
  ensureGhAuth();
  run('gh', ['pr', 'status']);
}

export function triggerReview(): void {
  ensureGhAuth();
  const currentBranch = getCurrentBranch();
  if (!currentBranch || currentBranch === MAIN_BRANCH) {
    fail(`无法对 ${currentBranch || '当前'} 分支触发 Review: 请切换到具体的特性分支`);
  }
  const prJson = probe('gh', ['pr', 'view', currentBranch, '--json', 'number,title,url']);
  if (!prJson) {
    fail(`分支 ${currentBranch} 尚未开启 PR: 请先运行 pnpm pr-review create`);
  }
  let prNum = '';
  let prTitle = '';
  let prUrl = '';
  try {
    const parsed = JSON.parse(prJson);
    prNum = parsed.number ? String(parsed.number) : '';
    prTitle = parsed.title || '';
    prUrl = parsed.url || '';
  } catch {
    // ignore
  }

  console.log(`→ 正在为 PR #${prNum} (${prTitle || currentBranch}) 触发 OpenCodeReview 审查…`);
  run('gh', ['pr', 'comment', prNum || currentBranch, '--body', '/review']);
  console.log('✓ 审查请求已成功发送！');
  console.log(`  PR 链接: ${prUrl}`);
  console.log(
    '  提示: GitHub Actions 已在后台启动审查工作流，约 2~3 分钟后可执行 pnpm pr-review pull 拉取看板。',
  );
}
