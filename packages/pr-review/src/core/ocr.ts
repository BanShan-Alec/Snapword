import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { OcrResult, RunInfo } from '../types.ts';
import { fail, probe, safeParseJson } from '../utils/process.ts';

export function getLatestRunInfo(
  branch: string,
  prNumber: number | null,
  ownerRepo?: string,
): RunInfo {
  // 1. 如果有 prNumber 且有 ownerRepo，优先从 GitHub API 查询属于该 PR 的所有 review runs
  if (prNumber && ownerRepo) {
    try {
      const artifactsJson = probe('gh', [
        'api',
        `repos/${ownerRepo}/actions/artifacts`,
        '--jq',
        `[.artifacts[] | select((.name != null) and (.name | startswith("ocr-review-result-${prNumber}-")) and .workflow_run != null and (.workflow_run.conclusion == null or .workflow_run.conclusion == "success")) | .workflow_run.id] | map(select(. != null)) | unique`,
      ]);
      const prRunIds = safeParseJson<number[]>(artifactsJson);
      if (prRunIds && prRunIds.length > 0) {
        // prRunIds 升序排列，数组长度即为总运行轮次
        const rawSortedIds = [...prRunIds].sort((a, b) => a - b).map(String);
        // 过滤掉被取消或失败的 runs（GitHub artifacts API 的 workflow_run 中不含 conclusion）
        const runsStatusJson = probe('gh', [
          'run',
          'list',
          '--workflow=open-code-review.yml',
          '--limit',
          '50',
          '--json',
          'databaseId,conclusion',
        ]);
        const successfulRunIds = new Set(
          safeParseJson<{ databaseId: number; conclusion: string }[]>(runsStatusJson)
            ?.filter((r) => r.conclusion === 'success')
            .map((r) => String(r.databaseId)) ?? [],
        );
        const sortedIds =
          successfulRunIds.size > 0
            ? rawSortedIds.filter((id) => successfulRunIds.has(id))
            : rawSortedIds;
        if (sortedIds.length === 0) {
          throw new Error('未找到执行成功的 Review 任务产物');
        }
        let targetId = sortedIds[sortedIds.length - 1];

        // 优先从 PR sticky 评论中的 checkpoint 确认最新 run ID
        const commentsJson = probe('gh', ['pr', 'view', String(prNumber), '--json', 'comments']);
        const prCommentsData = safeParseJson<{ comments: { body: string }[] }>(commentsJson);
        const reviewComments = prCommentsData?.comments?.filter((c) =>
          c.body.trim().startsWith('/review'),
        );
        const reviewTriggerCount = 1 + (reviewComments?.length ?? 0);

        if (prCommentsData?.comments) {
          const summaryComment = prCommentsData.comments.find(
            (c) =>
              c.body.includes('<!-- ocr-checkpoint:') || c.body.includes('<!-- ocr-review-run:'),
          );
          if (summaryComment) {
            const match = summaryComment.body.match(
              /<!-- ocr-checkpoint:(?:v[0-9]+|[a-zA-Z0-9._-]+)\s+([A-Za-z0-9+/=]+)\s*-->/,
            );
            if (match) {
              try {
                const decoded = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'));
                const decodedRun =
                  typeof decoded.run === 'number' ? String(decoded.run) : decoded.run;
                if (typeof decodedRun === 'string' && sortedIds.includes(decodedRun)) {
                  targetId = decodedRun;
                }
              } catch {
                // fallback
              }
            }
          }
        }

        const totalRuns = Math.max(reviewTriggerCount, sortedIds.length);
        const roundIndex = sortedIds.indexOf(targetId);
        const round =
          roundIndex !== -1 ? totalRuns - (sortedIds.length - 1 - roundIndex) : totalRuns;

        return {
          id: targetId,
          round,
          totalRuns,
          status: 'success',
          allPrRunIds: sortedIds,
        };
      }
    } catch {
      // 容错降级回原逻辑
    }
  }

  const runsJson = probe('gh', [
    'run',
    'list',
    '--workflow=open-code-review.yml',
    '--limit',
    '20',
    '--json',
    'databaseId,headBranch,status,conclusion',
  ]);

  const allRuns =
    safeParseJson<
      {
        databaseId: number;
        headBranch: string;
        status: string;
        conclusion: string;
      }[]
    >(runsJson) || [];

  // 仅匹配当前分支运行，杜绝将 main 上无关运行算入当前 PR
  const branchRuns = allRuns.filter((r) => r.headBranch === branch);
  const completedRuns = branchRuns.filter((r) => r.status === 'completed');

  // 优化 1: 优先从 PR sticky 评论中的 checkpoint 元数据直接获取最新的 run ID
  if (prNumber) {
    const commentsJson = probe('gh', ['pr', 'view', String(prNumber), '--json', 'comments']);
    const prCommentsData = safeParseJson<{ comments: { body: string }[] }>(commentsJson);
    const reviewComments = prCommentsData?.comments?.filter((c) =>
      c.body.trim().startsWith('/review'),
    );
    const reviewTriggerCount = 1 + (reviewComments?.length ?? 0);

    if (prCommentsData?.comments) {
      const summaryComment = prCommentsData.comments.find(
        (c) => c.body.includes('<!-- ocr-checkpoint:') || c.body.includes('<!-- ocr-review-run:'),
      );
      let targetId: string | undefined;
      if (summaryComment) {
        const match = summaryComment.body.match(
          /<!-- ocr-checkpoint:(?:v[0-9]+|[a-zA-Z0-9._-]+)\s+([A-Za-z0-9+/=]+)\s*-->/,
        );
        if (match) {
          try {
            const decoded = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'));
            const decodedRun = typeof decoded.run === 'number' ? String(decoded.run) : decoded.run;
            if (typeof decodedRun === 'string') {
              targetId = decodedRun;
            }
          } catch {
            // fallback
          }
        }
      }

      if (targetId) {
        const fallbackTotalRuns = Math.max(reviewTriggerCount, completedRuns.length);
        const matched = completedRuns.find((r) => String(r.databaseId) === targetId);
        if (matched) {
          const matchedIndex = completedRuns.indexOf(matched);
          const round = fallbackTotalRuns - matchedIndex;
          return {
            id: targetId,
            round,
            totalRuns: fallbackTotalRuns,
            status: matched.conclusion,
          };
        }
        return {
          id: targetId,
          round: reviewTriggerCount,
          totalRuns: fallbackTotalRuns,
          status: 'success',
        };
      }
    }
  }

  if (completedRuns.length === 0) {
    fail('未找到已完成的 Review 任务');
  }

  const latest = completedRuns[0];
  return {
    id: String(latest.databaseId),
    round: completedRuns.length,
    totalRuns: branchRuns.length,
    status: latest.conclusion,
  };
}

export function fetchOcrResult(runId: string, cacheDir: string): OcrResult {
  const runCacheDir = path.join(cacheDir, String(runId));
  if (!fs.existsSync(runCacheDir)) {
    fs.mkdirSync(runCacheDir, { recursive: true });
  }

  console.log(`→ 正在从 GitHub Actions 下载 Review 产物 (Run ID: ${runId})...`);
  const downloadResult = spawnSync('gh', ['run', 'download', runId, '-D', runCacheDir], {
    encoding: 'utf-8',
  });

  if (downloadResult.status !== 0) {
    throw new Error(`下载 Review 产物失败: ${downloadResult.stderr || downloadResult.stdout}`);
  }

  const findResultFile = (dir: string): string | null => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findResultFile(fullPath);
        if (found) return found;
      } else if (entry.name === 'ocr-result.json') {
        return fullPath;
      }
    }
    return null;
  };

  const jsonPath = findResultFile(runCacheDir);
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    throw new Error('产物中未找到 ocr-result.json 文件，请确认 CI 是否执行完成');
  }

  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    if (!raw.trim()) {
      throw new Error('ocr-result.json 内容为空');
    }
    return JSON.parse(raw) as OcrResult;
  } catch (e: unknown) {
    throw new Error(`解析 ocr-result.json 失败: ${(e as Error).message}`);
  }
}

export function fetchPrComments(ownerRepo: string, prNumber: number | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!prNumber) return map;

  const raw = probe('gh', [
    'api',
    `repos/${ownerRepo}/pulls/${prNumber}/comments`,
    '--jq',
    '.[] | {path: .path, line: .line, original_line: .original_line, html_url: .html_url}',
  ]);

  if (!raw) return map;

  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const item = JSON.parse(line) as {
        path: string;
        line?: number;
        original_line?: number;
        html_url: string;
      };
      const commentLine = item.line || item.original_line;
      if (item.path && commentLine && item.html_url) {
        map.set(`${item.path}:${commentLine}`, item.html_url);
      }
    } catch {
      // 容错忽略单行解析失败
    }
  }

  return map;
}
