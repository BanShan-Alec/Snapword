import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanOldReviewFiles } from '../core/cleaner.ts';
import { formatDashboard } from '../core/dashboard.ts';
import { findLatestReviewFile, parseExistingDashboard } from '../core/diff.ts';
import { fetchOcrResult, fetchPrComments, getLatestRunInfo } from '../core/ocr.ts';
import type { CiCheckItem, OcrResult, RunInfo } from '../types.ts';
import {
  ensureGh,
  getCurrentBranch,
  getHeadSha,
  getRepoRoot,
  resolveOwnerRepo,
} from '../utils/git.ts';
import { fail, probe, safeParseJson } from '../utils/process.ts';

// 产物收敛到 packages/pr-review/reviews 目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_ROOT = path.resolve(__dirname, '../..');
const REVIEWS_DIR = path.join(PACK_ROOT, 'reviews');
const ARTIFACT_CACHE_DIR = path.join(REVIEWS_DIR, '.cache');

export function runPull(): void {
  ensureGh();

  const branch = getCurrentBranch();
  if (!branch) fail('无法获取当前 Git 分支名');

  const headSha = getHeadSha();
  const ownerRepo = resolveOwnerRepo();

  const prInfoRaw = probe('gh', ['pr', 'view', branch, '--json', 'number,statusCheckRollup']);
  const prInfo = safeParseJson<{
    number?: number;
    statusCheckRollup?: Array<{
      name?: string;
      context?: string;
      status?: string;
      conclusion?: string | null;
      detailsUrl?: string;
      workflowName?: string;
    }>;
  }>(prInfoRaw);
  const prNumber: number | null = prInfo?.number ?? null;
  const ciChecks: CiCheckItem[] = (prInfo?.statusCheckRollup ?? []).map((c) => ({
    name: c.name ?? c.context ?? 'unknown',
    status: c.status ?? '',
    conclusion: c.conclusion ?? null,
    detailsUrl: c.detailsUrl,
    workflowName: c.workflowName,
  }));

  console.log(`🔍 当前分支: ${branch} ${prNumber ? `(PR #${prNumber})` : ''}`);

  const runInfo = getLatestRunInfo(branch, prNumber, ownerRepo);

  try {
    if (!fs.existsSync(REVIEWS_DIR)) {
      fs.mkdirSync(REVIEWS_DIR, { recursive: true });
    }

    console.log('→ 正在获取 GitHub PR 评论讨论链接映射...');
    const commentMap = fetchPrComments(ownerRepo, prNumber);

    const safeBranch = branch.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 若检测到属于该 PR 的历史轮次尚未落盘，自动按序号同步历史看板，确保最新轮次能正确比对 diff
    if (runInfo.allPrRunIds && runInfo.allPrRunIds.length > 1) {
      for (let i = 0; i < runInfo.allPrRunIds.length - 1; i++) {
        const histRunId = runInfo.allPrRunIds[i];
        const histRound = i + 1;
        const histFileName = prNumber
          ? `pr-${prNumber}-round-${histRound}.md`
          : `branch-${safeBranch}-round-${histRound}.md`;
        const histOutputFile = path.join(REVIEWS_DIR, histFileName);

        let needGenerate = !fs.existsSync(histOutputFile);
        if (!needGenerate) {
          const content = fs.readFileSync(histOutputFile, 'utf-8');
          if (!content.includes(`(Run ID: \`${histRunId}\`)`)) {
            needGenerate = true;
          }
        }

        if (needGenerate) {
          try {
            console.log(`→ 同步第 ${histRound} 轮历史看板产物 (Run ID: ${histRunId})...`);
            const histData = fetchOcrResult(histRunId, ARTIFACT_CACHE_DIR);
            const histRunInfo: RunInfo = {
              id: histRunId,
              round: histRound,
              totalRuns: runInfo.totalRuns,
              status: 'success',
            };
            const histMarkdown = formatDashboard(
              branch,
              prNumber,
              ownerRepo,
              headSha,
              histRunInfo,
              histData,
              commentMap,
              new Map(),
              [], // 历史轮次 CI 状态不与当前最新 checks 混淆
            );
            fs.writeFileSync(histOutputFile, histMarkdown, 'utf-8');
          } catch (histErr) {
            console.warn(`[WARN] 拉取历史第 ${histRound} 轮看板失败:`, histErr);
          }
        }
      }
    }

    let data: OcrResult;
    try {
      data = fetchOcrResult(runInfo.id, ARTIFACT_CACHE_DIR);
    } catch (err) {
      fail((err as Error).message);
    }

    // 目标文件名：按真实轮次保存 pr-<PR>-round-<N>.md
    const fileName = prNumber
      ? `pr-${prNumber}-round-${runInfo.round}.md`
      : `branch-${safeBranch}-round-${runInfo.round}.md`;
    const outputFile = path.join(REVIEWS_DIR, fileName);

    // 查找上一轮最近生成的看板（排除当前待生成的 outputFile，确保即使重复 pull 也能准确定位次新的上一轮次）
    const previousFilePath = findLatestReviewFile(REVIEWS_DIR, prNumber, branch, outputFile);
    const historicalMap = previousFilePath ? parseExistingDashboard(previousFilePath) : new Map();

    const markdown = formatDashboard(
      branch,
      prNumber,
      ownerRepo,
      headSha,
      runInfo,
      data,
      commentMap,
      historicalMap,
      ciChecks,
    );
    fs.writeFileSync(outputFile, markdown, 'utf-8');

    // 触发清理机制：只保留最近 10 个 review md 文件
    cleanOldReviewFiles(REVIEWS_DIR);

    console.log(`\n\x1b[32m✔ 成功拉取并保存第 ${runInfo.round} 轮 Review 看板！\x1b[0m`);
    console.log(`📄 看板路径: \x1b[36m${outputFile}\x1b[0m\n`);

    const comments = data.comments ?? [];
    const highCount = comments.filter(
      (c) => c.severity === 'critical' || c.severity === 'high',
    ).length;
    const mediumCount = comments.filter((c) => c.severity === 'medium').length;
    const lowCount = comments.filter((c) => c.severity === 'low').length;

    console.log(
      `📊 简报概览: 🔴 高危 ${highCount} 项 (默认修) | 🟡 中度 ${mediumCount} 项 (默认修) | 🟢 低优 ${lowCount} 项 (需手动勾选)`,
    );
    const rootDir = getRepoRoot();
    console.log(
      `👉 可在编辑器中打开 ${path.relative(rootDir, outputFile)} 审阅批注，随后交由 AI Agent 自动闭环修复。\n`,
    );
  } finally {
    // 确保清理临时下载缓存
    if (fs.existsSync(ARTIFACT_CACHE_DIR)) {
      try {
        fs.rmSync(ARTIFACT_CACHE_DIR, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}
