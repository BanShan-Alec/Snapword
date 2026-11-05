import type * as childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOcrResult, fetchPrComments, getLatestRunInfo } from '../../src/core/ocr.ts';
import * as processUtils from '../../src/utils/process.ts';

const mockSpawnSync = vi.fn();

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
  };
});

vi.mock('../../src/utils/process.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/process.ts')>();
  return {
    ...actual,
    probe: vi.fn(),
    fail: vi.fn((msg: string) => {
      throw new Error(`FAIL: ${msg}`);
    }),
  };
});

describe('getLatestRunInfo', () => {
  const mockedProbe = vi.mocked(processUtils.probe);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly calculates round 2 for issue_comment trigger even when headBranch is main', () => {
    const prNumber = 38;
    const ownerRepo = 'owner/repo';
    const branch = 'feat/unified-telemetry';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'api' && args[1] === `repos/${ownerRepo}/actions/artifacts`) {
        // 返回包含该 PR 的第 1 轮与第 2 轮运行 ID
        return JSON.stringify([38939689878, 38941328631]);
      }
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view' && args[2] === String(prNumber)) {
        // Sticky 评论指明最新 run 是 38941328631
        const checkpoint = Buffer.from(
          JSON.stringify({ run: '38941328631', pr: prNumber }),
        ).toString('base64');
        return JSON.stringify({
          comments: [
            {
              body: `<!-- ocr-summary -->\n<!-- ocr-checkpoint:v1 ${checkpoint} -->`,
            },
            {
              body: '/review',
            },
          ],
        });
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, prNumber, ownerRepo);

    expect(runInfo.id).toBe('38941328631');
    expect(runInfo.round).toBe(2);
    expect(runInfo.totalRuns).toBe(2);
    expect(runInfo.status).toBe('success');
    expect(runInfo.allPrRunIds).toEqual(['38939689878', '38941328631']);
  });

  it('gracefully falls back to PR comments /review count when artifacts API returns empty or fails', () => {
    const prNumber = 38;
    const ownerRepo = 'owner/repo';
    const branch = 'feat/unified-telemetry';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'api') {
        // Artifacts API 异常或未返回产物
        return null;
      }
      if (cmd === 'gh' && args[0] === 'pr') {
        const checkpoint = Buffer.from(
          JSON.stringify({ run: '38941328631', pr: prNumber }),
        ).toString('base64');
        return JSON.stringify({
          comments: [
            {
              body: `<!-- ocr-checkpoint:v1 ${checkpoint} -->`,
            },
            {
              body: '/review',
            },
          ],
        });
      }
      // gh run list 兜底
      if (cmd === 'gh' && args[0] === 'run') {
        return JSON.stringify([
          {
            databaseId: 38939689878,
            headBranch: branch,
            status: 'completed',
            conclusion: 'success',
          },
        ]);
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, prNumber, ownerRepo);

    // 触发复查计数 = 1 (开启 PR) + 1 (/review 次数) = 2
    expect(runInfo.id).toBe('38941328631');
    expect(runInfo.round).toBe(2);
  });

  it('handles checkpoint with multiline whitespace and numeric run ID correctly', () => {
    const prNumber = 38;
    const ownerRepo = 'owner/repo';
    const branch = 'feat/unified-telemetry';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'api' && args[1] === `repos/${ownerRepo}/actions/artifacts`) {
        return JSON.stringify([101, 102]);
      }
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view' && args[2] === String(prNumber)) {
        const checkpoint = Buffer.from(JSON.stringify({ run: 102, pr: prNumber })).toString(
          'base64',
        );
        return JSON.stringify({
          comments: [
            {
              body: `<!-- ocr-summary -->\n<!-- ocr-checkpoint:v1   \t\n  ${checkpoint}   \n-->`,
            },
          ],
        });
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, prNumber, ownerRepo);
    expect(runInfo.id).toBe('102');
    expect(runInfo.round).toBe(2);
  });

  it('aligns fallback round with completedRuns when checkpoint targetId matches completedRuns', () => {
    const prNumber = 38;
    const branch = 'feat/unified-telemetry';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'api') {
        return null;
      }
      if (cmd === 'gh' && args[0] === 'pr') {
        const checkpoint = Buffer.from(JSON.stringify({ run: '202', pr: prNumber })).toString(
          'base64',
        );
        return JSON.stringify({
          comments: [
            {
              body: `<!-- ocr-checkpoint:v1 ${checkpoint} -->`,
            },
            {
              body: '/review',
            },
            {
              body: '/review',
            },
          ],
        });
      }
      if (cmd === 'gh' && args[0] === 'run') {
        return JSON.stringify([
          { databaseId: 203, headBranch: branch, status: 'completed', conclusion: 'success' },
          { databaseId: 202, headBranch: branch, status: 'completed', conclusion: 'success' },
          { databaseId: 201, headBranch: branch, status: 'completed', conclusion: 'success' },
        ]);
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, prNumber);
    // completedRuns 有 3 个: 203 (index 0, round 3), 202 (index 1, round 2), 201 (index 2, round 1)
    expect(runInfo.id).toBe('202');
    expect(runInfo.round).toBe(2);
    expect(runInfo.totalRuns).toBe(3);
  });

  it('selects the latest artifact run id reported by the artifacts API', () => {
    const prNumber = 38;
    const ownerRepo = 'owner/repo';
    const branch = 'feat/unified-telemetry';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'api') {
        // 断言最终选中的 run，而不是 gh api 的 jq 过滤字符串写法
        return JSON.stringify([999]);
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, prNumber, ownerRepo);
    expect(runInfo.id).toBe('999');
    expect(runInfo.round).toBe(1);
    expect(runInfo.totalRuns).toBe(1);
  });

  it('correctly calculates round when historical artifacts expired but PR has /review comments', () => {
    const prNumber = 38;
    const ownerRepo = 'owner/repo';
    const branch = 'feat/unified-telemetry';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'api' && args[1] === `repos/${ownerRepo}/actions/artifacts`) {
        // 早期产物已过期，API 仅返回最新第 3 轮产物
        return JSON.stringify([39048472157]);
      }
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view' && args[2] === String(prNumber)) {
        const checkpoint = Buffer.from(
          JSON.stringify({ run: '39048472157', pr: prNumber }),
        ).toString('base64');
        return JSON.stringify({
          comments: [
            { body: `<!-- ocr-checkpoint:v1 ${checkpoint} -->` },
            { body: '/review' },
            { body: '/review' },
          ],
        });
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, prNumber, ownerRepo);
    expect(runInfo.id).toBe('39048472157');
    expect(runInfo.round).toBe(3);
    expect(runInfo.totalRuns).toBe(3);
  });

  it('safely handles missing or empty comments object without throwing TypeError', () => {
    const prNumber = 38;
    const branch = 'feat/unified-telemetry';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'api') return null;
      if (cmd === 'gh' && args[0] === 'pr') {
        return JSON.stringify({});
      }
      if (cmd === 'gh' && args[0] === 'run') {
        return JSON.stringify([
          { databaseId: 111, headBranch: branch, status: 'completed', conclusion: 'success' },
        ]);
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, prNumber);
    expect(runInfo.id).toBe('111');
    expect(runInfo.round).toBe(1);
    expect(runInfo.totalRuns).toBe(1);
  });

  it('guarantees round <= totalRuns in fallback branch even when completedRuns length is smaller than reviewTriggerCount', () => {
    const prNumber = 38;
    const branch = 'feat/unified-telemetry';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'api') return null;
      if (cmd === 'gh' && args[0] === 'pr') {
        const checkpoint = Buffer.from(JSON.stringify({ run: '99999', pr: prNumber })).toString(
          'base64',
        );
        return JSON.stringify({
          comments: [
            { body: `<!-- ocr-checkpoint:v1 ${checkpoint} -->` },
            { body: '/review' },
            { body: '/review' },
            { body: '/review' },
          ],
        });
      }
      if (cmd === 'gh' && args[0] === 'run') {
        return JSON.stringify([
          { databaseId: 101, headBranch: branch, status: 'completed', conclusion: 'success' },
        ]);
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, prNumber);
    expect(runInfo.id).toBe('99999');
    expect(runInfo.round).toBe(4);
    expect(runInfo.totalRuns).toBe(4);
  });

  it('handles branch-only mode when prNumber is null, filtering by status === completed', () => {
    const branch = 'feat/standalone-branch';

    mockedProbe.mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args[0] === 'run' && args[1] === 'list') {
        return JSON.stringify([
          { databaseId: 99999, headBranch: branch, status: 'in_progress', conclusion: '' },
          { databaseId: 88888, headBranch: branch, status: 'completed', conclusion: 'success' },
          {
            databaseId: 77777,
            headBranch: 'other-branch',
            status: 'completed',
            conclusion: 'success',
          },
        ]);
      }
      return null;
    });

    const runInfo = getLatestRunInfo(branch, null);
    expect(runInfo.id).toBe('88888');
    expect(runInfo.round).toBe(1);
    // 分支模式下 totalRuns 统计的是该分支的全部 run（含未完成），而不是仅 completed
    expect(runInfo.totalRuns).toBe(2);
    expect(runInfo.status).toBe('success');
  });

  it('throws fail error when no completed runs are found', () => {
    mockedProbe.mockReturnValue(JSON.stringify([]));

    expect(() => getLatestRunInfo('feat/empty', null)).toThrow(/未找到已完成的 Review 任务/);
  });
});

describe('fetchOcrResult', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-review-ocr-'));
    mockSpawnSync.mockReset();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  const mockDownload = (onDownload?: (targetDir: string) => void) => {
    mockSpawnSync.mockImplementation((_cmd: string, args: string[]) => {
      const targetDir = args[args.indexOf('-D') + 1];
      onDownload?.(targetDir);
      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      } as unknown as childProcess.SpawnSyncReturns<string>;
    });
  };

  const writeResult = (targetDir: string, relativePath: string, content: string) => {
    const filePath = path.join(targetDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };

  it('isolates cache by runId so multiple runs do not overwrite or cross-read data', () => {
    const runId1 = '1001';
    const runId2 = '1002';

    // 模拟 gh run download，在各自专属 runId 目录下生成 ocr-result.json
    mockDownload((targetDir) => {
      const isRun1 = targetDir.includes(runId1);
      const content = {
        summary: { comments: isRun1 ? 1 : 2 },
        comments: isRun1
          ? [{ path: 'a.ts', severity: 'low', content: 'run 1 finding' }]
          : [{ path: 'b.ts', severity: 'high', content: 'run 2 finding' }],
      };
      writeResult(
        targetDir,
        path.join('result-folder', 'ocr-result.json'),
        JSON.stringify(content),
      );
    });

    const res1 = fetchOcrResult(runId1, tempDir);
    const res2 = fetchOcrResult(runId2, tempDir);

    expect(res1.comments?.[0].content).toBe('run 1 finding');
    expect(res2.comments?.[0].content).toBe('run 2 finding');

    // 验证目录结构完全隔离
    expect(fs.existsSync(path.join(tempDir, runId1))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, runId2))).toBe(true);
  });

  it('throws fail when the download command fails', () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'Network timeout',
      pid: 1,
      output: [],
      signal: null,
    } as unknown as childProcess.SpawnSyncReturns<string>);

    expect(() => fetchOcrResult('999', tempDir)).toThrow(/下载 Review 产物失败/);
  });

  it('throws fail when the download succeeds but ocr-result.json is missing', () => {
    mockDownload((targetDir) => {
      // 下载成功但产物里只有无关文件
      writeResult(targetDir, 'logs/output.txt', 'no result here');
    });

    expect(() => fetchOcrResult('999', tempDir)).toThrow(/产物中未找到 ocr-result\.json 文件/);
  });

  it('throws fail when ocr-result.json is empty', () => {
    mockDownload((targetDir) => {
      writeResult(targetDir, 'ocr-result.json', '   \n');
    });

    expect(() => fetchOcrResult('999', tempDir)).toThrow(/ocr-result\.json 内容为空/);
  });

  it('throws fail when ocr-result.json is corrupted', () => {
    mockDownload((targetDir) => {
      writeResult(targetDir, 'ocr-result.json', '{ "comments": [');
    });

    expect(() => fetchOcrResult('999', tempDir)).toThrow(/解析 ocr-result\.json 失败/);
  });
});

describe('fetchPrComments', () => {
  const mockedProbe = vi.mocked(processUtils.probe);

  it('returns empty map when prNumber is null', () => {
    const map = fetchPrComments('owner/repo', null);
    expect(map.size).toBe(0);
  });

  it('maps file path and line numbers to GitHub comment URL', () => {
    mockedProbe.mockReturnValue(`{"path":"src/foo.ts","line":42,"html_url":"https://github.com/c1"}
{"path":"src/bar.ts","original_line":10,"html_url":"https://github.com/c2"}
{"broken_json": true
`);

    const map = fetchPrComments('owner/repo', 38);
    expect(map.get('src/foo.ts:42')).toBe('https://github.com/c1');
    expect(map.get('src/bar.ts:10')).toBe('https://github.com/c2');
  });
});
