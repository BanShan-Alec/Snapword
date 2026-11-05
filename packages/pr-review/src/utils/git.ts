import { fail, probe } from './process.ts';

export function getRepoRoot(): string {
  const root = probe('git', ['rev-parse', '--show-toplevel']);
  if (!root) {
    fail('无法获取 Git 仓库根目录，请确认当前目录位于 git 仓库中');
  }
  return root;
}

export function ensureGh(): void {
  if (probe('gh', ['--version']) === null) {
    fail('gh cli 不可用: 请先安装 GitHub CLI 并完成登录');
  }
}

export function ensureGhAuth(): void {
  ensureGh();
  if (probe('gh', ['auth', 'status']) === null) {
    fail('gh 未认证: 运行 gh auth login 完成一次性认证');
  }
}

export function resolveOwnerRepo(): string {
  const ghRepo = probe('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  if (ghRepo) return ghRepo;

  const originUrl = probe('git', ['remote', 'get-url', 'origin']);
  if (originUrl) {
    const match = originUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
  }

  return fail('无法解析当前 Git 仓库信息，请检查远程 origin 配置或 gh auth 状态');
}

export function getCurrentBranch(): string {
  return probe('git', ['rev-parse', '--abbrev-ref', 'HEAD']) || '';
}

/**
 * 默认主干分支：优先仓库自身的 origin/HEAD，其次回退 main。
 * 不再依赖 .env 的 DEFAULT_BRANCH（CLI 不加载 .env，该值此前实际不生效）。
 */
export function getDefaultBranch(): string {
  const remoteHead = probe('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (remoteHead) {
    return remoteHead.replace(/^origin\//, '');
  }
  return 'main';
}

export function getHeadSha(): string {
  return probe('git', ['rev-parse', 'HEAD']) || 'HEAD';
}
