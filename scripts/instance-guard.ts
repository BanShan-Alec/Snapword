import { execFileSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { APP_IDENTITY } from '../build/lib/app-identity.ts';
import { killProcessTree } from './port-guard.ts';

export interface RunningInstance {
  pid: number;
  /** 进程名：打包版为 productName，dev 实例为 electron */
  name: string;
  /** 可执行文件路径（权限受限的进程可能取不到，仅用于提示展示） */
  path: string;
}

/**
 * Windows 探测：Get-Process 按名匹配打包版；dev 实例按可执行文件路径锚定在本仓
 * node_modules 下，避免误杀其他项目 / 其他 worktree 的 electron 开发实例。
 * 参数经环境变量传入，规避路径与产品名在 PowerShell 里的引号转义问题。
 */
function findWindowsInstances(repoRoot: string): RunningInstance[] {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$hits = @()',
    '$hits += Get-Process -Name $env:DEV_GUARD_PRODUCT | ForEach-Object { "$($_.Id)|$env:DEV_GUARD_PRODUCT|$($_.Path)" }',
    '$hits += Get-Process -Name electron | Where-Object { "$($_.Path)".StartsWith($env:DEV_GUARD_REPO_ROOT, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { "$($_.Id)|electron|$($_.Path)" }',
    '$hits',
  ].join('; ');

  const output = execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: {
      ...process.env,
      DEV_GUARD_PRODUCT: APP_IDENTITY.productName,
      DEV_GUARD_REPO_ROOT: repoRoot,
    },
  });

  return parseInstanceLines(output);
}

/**
 * POSIX 探测：pgrep -f 全命令行匹配（本仓 electron 二进制路径、含产品名的安装路径），
 * lsof/pgrep 缺失等任何失败都降级为空结果，交由主进程 single-instance 警告兜底。
 */
function findPosixInstances(repoRoot: string): RunningInstance[] {
  const patterns = [`${repoRoot}/node_modules/electron/dist/electron`, APP_IDENTITY.productName];
  const pids = new Set<number>();
  for (const pattern of patterns) {
    try {
      const output = execFileSync('pgrep', ['-f', '--', pattern], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of output.trim().split('\n')) {
        const pid = Number.parseInt(line, 10);
        if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
          pids.add(pid);
        }
      }
    } catch {}
  }
  return [...pids].map((pid) => ({ pid, name: posixProcessName(pid), path: '' }));
}

function posixProcessName(pid: number): string {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'comm='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function parseInstanceLines(output: string): RunningInstance[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, name, ...rest] = line.split('|');
      return {
        pid: Number.parseInt(pid, 10),
        name,
        path: rest.join('|'),
      };
    })
    .filter((i) => Number.isInteger(i.pid) && i.pid > 0 && i.pid !== process.pid);
}

/** 探测占用单实例锁的存量应用实例（打包版托盘常驻 / 旧 dev 实例） */
export function findRunningAppInstances(repoRoot: string): RunningInstance[] {
  try {
    if (process.platform === 'win32') {
      return findWindowsInstances(repoRoot);
    }
    return findPosixInstances(repoRoot);
  } catch {
    return [];
  }
}

/** 提示用户确认是否终止占用单实例锁的实例（交互契约与端口排查一致） */
async function promptUserToKillInstances(instances: RunningInstance[]): Promise<boolean> {
  if (!process.stdin.isTTY) {
    const summary = instances.map((i) => `${i.name} (PID: ${i.pid})`).join(', ');
    throw new Error(
      `[dev] 检测到正在运行的应用实例：${summary}。单实例锁将被占用，且非交互式环境 (Non-TTY) 下无法等待确认，请先退出该实例（托盘图标右键退出）后重试。`,
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const lines = instances
      .map((i) => `  - ${i.name} (PID: ${i.pid})${i.path ? `  ${i.path}` : ''}`)
      .join('\n');
    const answer = await rl.question(
      `\x1b[33m[dev] 检测到以下应用实例正在运行，单实例锁将被占用：\n${lines}\n是否终止这些进程树并继续启动？(y/N): \x1b[0m`,
    );
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

/** 开发启动前检查：探测占用单实例锁的存量实例，交互确认后终止 */
export async function ensureNoAppInstanceRunning(repoRoot: string): Promise<void> {
  const instances = findRunningAppInstances(repoRoot);
  if (instances.length === 0) return;

  const shouldKill = await promptUserToKillInstances(instances);

  if (shouldKill) {
    console.log('[dev] 正在终止应用实例及其子进程树...');
    for (const instance of instances) {
      await killProcessTree(instance.pid);
    }
    // 与端口排查一致：等待系统彻底释放单实例锁
    await new Promise((resolve) => setTimeout(resolve, 300));

    const survivors = findRunningAppInstances(repoRoot);
    if (survivors.length > 0) {
      const summary = survivors.map((i) => `${i.name} (PID: ${i.pid})`).join(', ');
      console.warn(
        `\x1b[31m[dev] 仍有 ${survivors.length} 个实例进程未能终止：${summary}，本次启动可能抢锁失败。\x1b[0m`,
      );
    } else {
      console.log('\x1b[32m[dev] 应用实例已清理，单实例锁可用。\x1b[0m');
    }
  } else {
    console.log('[dev] 用户取消了实例终止，服务启动终止。');
    process.exit(1);
  }
}
