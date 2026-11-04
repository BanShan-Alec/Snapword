import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';

interface PortItem {
  port?: number;
  desc: string;
}

/** 跨平台树状强制杀死进程及其子进程 */
export async function killProcessTree(pid: number): Promise<void> {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      // 1. 尝试先向子进程发送终止信号 (POSIX 通用)
      try {
        execSync(`pkill -TERM -P ${pid}`, { stdio: 'ignore' });
      } catch {}
      // 2. 尝试向进程组发 SIGKILL，若非组长进程则直接杀目标进程
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        process.kill(pid, 'SIGKILL');
      }
    }
  } catch {}
}

/** 查询监听指定端口的进程 PID */
export async function findOccupyingPid(port: number): Promise<number | null> {
  try {
    if (process.platform === 'win32') {
      // Windows: 使用 netstat -ano，同时覆盖 IPv4 与 IPv6 (TCPv6)
      const output = execSync('netstat -ano', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const lines = output.split('\n');
      for (const line of lines) {
        if (!line.includes('LISTENING')) continue;
        const tokens = line.trim().split(/\s+/);
        // tokens 结构: [协议, 本地地址, 外部地址, 状态, PID]
        if (tokens.length >= 5) {
          const localAddr = tokens[1];
          const pid = Number.parseInt(tokens[tokens.length - 1], 10);
          if (localAddr.endsWith(`:${port}`) && !Number.isNaN(pid) && pid > 0) {
            return pid;
          }
        }
      }
    } else {
      // POSIX: 优先使用 lsof（macOS 标配及大部分 Linux 系统）
      try {
        const output = execSync(`lsof -i :${port} -t -sTCP:LISTEN`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (output) {
          const pid = Number.parseInt(output.split('\n')[0], 10);
          if (!Number.isNaN(pid) && pid > 0) return pid;
        }
      } catch {
        // Linux 最小化环境降级：无 lsof 时尝试使用 ss 命令 (iproute2)
        try {
          const ssOutput = execSync(`ss -lptn "sport = :${port}"`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          const match = ssOutput.match(/pid=(\d+)/);
          if (match) {
            const pid = Number.parseInt(match[1], 10);
            if (!Number.isNaN(pid) && pid > 0) return pid;
          }
        } catch {
          // Linux 进一步降级：尝试使用 fuser
          try {
            const fuserOutput = execSync(`fuser ${port}/tcp`, {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
            if (fuserOutput) {
              const pid = Number.parseInt(fuserOutput.split(/\s+/)[0], 10);
              if (!Number.isNaN(pid) && pid > 0) return pid;
            }
          } catch {}
        }
      }
    }
  } catch {}
  return null;
}

/** 获取 PID 对应的进程名（用于友好的终端确认提示） */
export async function getProcessName(pid: number): Promise<string> {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = output.match(/^"([^"]+)"/);
      if (match) return match[1];
    } else {
      const output = execSync(`ps -p ${pid} -o comm=`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (output) return output;
    }
  } catch {}
  return 'Unknown Process';
}

/** 提示用户确认是否杀死占用端口的进程 */
export async function promptUserToKill(
  port: number,
  desc: string,
  pid: number,
  procName: string,
): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `[dev] 端口 ${port} (${desc}) 正被 ${procName} (PID: ${pid}) 占用。在非交互式环境 (Non-TTY) 下无法等待确认，请先终止该进程或释放端口。`,
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      `\x1b[33m[dev] 端口 ${port} (${desc}) 正被 ${procName} (PID: ${pid}) 占用，是否强制释放并杀死该进程树？(y/N): \x1b[0m`,
    );
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

/** 检查单个端口是否可用；若被占则交互确认后杀死 */
export async function ensureSinglePortAvailable(port: number, desc: string): Promise<void> {
  const pid = await findOccupyingPid(port);
  if (pid === null || pid === process.pid) {
    return;
  }

  const procName = await getProcessName(pid);
  const shouldKill = await promptUserToKill(port, desc, pid, procName);

  if (shouldKill) {
    console.log(`[dev] 正在终止进程 ${procName} (PID: ${pid}) 及其子进程树...`);
    await killProcessTree(pid);
    // 等待 300ms 确保系统彻底释放套接字
    await new Promise((resolve) => setTimeout(resolve, 300));
    console.log(`\x1b[32m[dev] 端口 ${port} (${desc}) 已成功释放。\x1b[0m`);
  } else {
    console.log('[dev] 用户取消了端口释放，服务启动终止。');
    process.exit(1);
  }
}

/** 批量检查关键端口是否可用；自动过滤未配置端口 */
export async function ensurePortsAvailable(ports: PortItem[]): Promise<void> {
  for (const item of ports) {
    if (typeof item.port === 'number') {
      await ensureSinglePortAvailable(item.port, item.desc);
    }
  }
}
