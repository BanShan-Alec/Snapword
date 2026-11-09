import packageJson from '../../package.json';

/**
 * 应用身份单一事实源解析（根目录 package.json）
 *
 * 构建期基础设施模块，服务三处消费方：
 * - build/electron-builder.ts：安装包命名、快捷方式名、appId、OTA 发布源
 * - packages/main：编译期注入 GitHub 仓库坐标，供未打包形态手动 setFeedURL
 * - packages/renderer：构建期注入窗口标题（productName）
 *
 * .env 不参与身份与仓库坐标——应用名/标识/发布源属于产品身份，跟随代码仓库而非部署环境。
 * JSON 直接静态导入：Vite / tsx / jiti 均在加载期解析，缺失即构建失败，无需运行时容错。
 */
export interface AppIdentity {
  /** package.json name：OTA 产物与小写命名规范 */
  name: string;
  /** package.json version：Sentry release 与构建期注入 */
  version: string;
  /** 桌面展示名：窗口标题、托盘、快捷方式 */
  productName: string;
  /** 应用唯一标识：Windows AUMID、macOS Bundle Identifier */
  appId: string;
  /** GitHub 发布源 owner（由 repository.url 解析，缺失时为空串） */
  repositoryOwner: string;
  /** GitHub 发布源 repo（由 repository.url 解析，缺失时为空串） */
  repositoryName: string;
}

const rootPkg = packageJson as {
  name?: string;
  version?: string;
  productName?: string;
  appId?: string;
  repository?: string | { url?: string };
};

/**
 * 从 GitHub 仓库 URL 中解析 owner 与 repo
 * 支持 https://github.com/owner/repo.git、git@github.com:owner/repo.git 等格式，
 * repo 名允许包含点号（GitHub 允许），并容忍尾部斜杠。
 */
export function parseGitHubRepo(repoUrl?: string): { owner?: string; repo?: string } {
  if (!repoUrl) return {};
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return {};
}

const repositoryUrl =
  typeof rootPkg.repository === 'string' ? rootPkg.repository : rootPkg.repository?.url;
const { owner, repo } = parseGitHubRepo(repositoryUrl);

export const APP_IDENTITY: AppIdentity = {
  name: rootPkg.name || 'electron-app',
  version: rootPkg.version || '1.0.0',
  productName: rootPkg.productName || rootPkg.name || 'Electron React Template',
  appId: rootPkg.appId || `com.template.${rootPkg.name || 'electron-app'}`,
  repositoryOwner: owner || '',
  repositoryName: repo || '',
};
