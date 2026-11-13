import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { OcrResult, RunInfo } from '../types.ts';
import { fail, probe, safeParseJson } from '../utils/process.ts';

/**
 * 从 PR Sticky 评论中提取当前审查对应的目标 Run ID。
 * 优先解析当前真实生成摘要的 `ocr-summary-run`，当发生 checkpoint carry（降级沿用旧检查点）时
 * 可避免被旧 `ocr-checkpoint.run` 覆盖；仅当不存在 summary run 标记时才回退解析 checkpoint。
 */
export function extractTargetRunIdFromComments(
  comments: Array<{ body: string }> | undefined,
): string | undefined {
  if (!comments || comments.length === 0) return undefined;

  const summaryComment = comments.find(
    (c) =>
      c.body.includes('<!-- ocr-summary-run:') ||
      c.body.includes('<!-- ocr-checkpoint:') ||
      c.body.includes('<!-- ocr-review-run:'),
  );
  if (!summaryComment) return undefined;

  const summaryRunMatch = summaryComment.body.match(
    /<!--\s*ocr-summary-run:(\d+)(?:-[0-9]+)?\s*-->/,
  );
  if (summaryRunMatch?.[1]) {
    return summaryRunMatch[1];
  }

  const checkpointMatch = summaryComment.body.match(
    /<!-- ocr-checkpoint:(?:v[0-9]+|[a-zA-Z0-9._-]+)\s+([A-Za-z0-9+/=]+)\s*-->/,
  );
  if (checkpointMatch) {
    try {
      const decoded = JSON.parse(Buffer.from(checkpointMatch[1], 'base64').toString('utf-8'));
      const decodedRun = typeof decoded.run === 'number' ? String(decoded.run) : decoded.run;
      if (typeof decodedRun === 'string' && decodedRun.length > 0) {
        return decodedRun;
      }
    } catch {
      // fallback
    }
  }

  return undefined;
}

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

        // 优先从 PR sticky 评论中确认最新 run ID
        const commentsJson = probe('gh', ['pr', 'view', String(prNumber), '--json', 'comments']);
        const prCommentsData = safeParseJson<{ comments: { body: string }[] }>(commentsJson);
        const reviewComments = prCommentsData?.comments?.filter((c) =>
          c.body.trim().startsWith('/review'),
        );
        const reviewTriggerCount = 1 + (reviewComments?.length ?? 0);

        const extractedRunId = extractTargetRunIdFromComments(prCommentsData?.comments);
        if (extractedRunId && sortedIds.includes(extractedRunId)) {
          targetId = extractedRunId;
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

  // 优化 1: 优先从 PR sticky 评论中的元数据直接获取最新的 run ID
  if (prNumber) {
    const commentsJson = probe('gh', ['pr', 'view', String(prNumber), '--json', 'comments']);
    const prCommentsData = safeParseJson<{ comments: { body: string }[] }>(commentsJson);
    const reviewComments = prCommentsData?.comments?.filter((c) =>
      c.body.trim().startsWith('/review'),
    );
    const reviewTriggerCount = 1 + (reviewComments?.length ?? 0);

    if (prCommentsData?.comments) {
      const targetId = extractTargetRunIdFromComments(prCommentsData.comments);

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

  const findResultFile = (dir: string): string | null => {
    if (!fs.existsSync(dir)) return null;
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

  // 1. 若当前运行已缓存有效 ocr-result.json，直接复用，避免重复网络下载与 zip 解压冲突
  const existingJsonPath = findResultFile(runCacheDir);
  if (existingJsonPath && fs.existsSync(existingJsonPath)) {
    try {
      const raw = fs.readFileSync(existingJsonPath, 'utf-8');
      if (raw.trim()) {
        return JSON.parse(raw) as OcrResult;
      }
    } catch {
      // 损坏则继续重新拉取
    }
  }

  // 2. 重新下载前清理目录，防止 gh run download 解压报 "openat ocr-result.json: file exists"
  if (fs.existsSync(runCacheDir)) {
    fs.rmSync(runCacheDir, { recursive: true, force: true });
  }
  fs.mkdirSync(runCacheDir, { recursive: true });

  console.log(`→ 正在从 GitHub Actions 下载 Review 产物 (Run ID: ${runId})...`);
  const downloadResult = spawnSync('gh', ['run', 'download', runId, '-D', runCacheDir], {
    encoding: 'utf-8',
  });

  if (downloadResult.status !== 0) {
    throw new Error(`下载 Review 产物失败: ${downloadResult.stderr || downloadResult.stdout}`);
  }

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
