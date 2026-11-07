import { type ChildProcess, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type ElectronApplication, _electron as electron, type Page } from '@playwright/test';

export interface LaunchElectronOptions {
  /**
   * 额外的命令行参数
   */
  extraArgs?: string[];
  /**
   * 额外的环境变量
   */
  extraEnv?: Record<string, string>;
  /**
   * 复用的用户数据目录；不传则创建临时目录
   */
  userDataDir?: string;
  /**
   * cleanup 时是否删除用户数据目录；默认自建目录删除，外部传入的目录保留
   */
  cleanupUserData?: boolean;
}

export interface ElectronTestContext {
  /**
   * Electron 主程序实例
   */
  electronApp: ElectronApplication;
  /**
   * 默认的主窗口 Page 句柄
   */
  page: Page;
  /**
   * 本次运行隔离的用户数据临时目录
   */
  tempUserDataDir: string;
  /**
   * 优雅清理资源函数（关闭进程并清除临时目录）
   */
  cleanup: () => Promise<void>;
}

/**
 * 跨平台强力终止进程及其所有子孙进程
 */
function killProcessTree(pid: number, tempUserDataDir?: string): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      // 1. 优先通过唯一 user-data-dir 特征清理属于本实例的所有 Electron 关联进程
      if (tempUserDataDir) {
        try {
          execSync(`pkill -9 -f "${tempUserDataDir}"`, { stdio: 'ignore' });
        } catch {}
      }
      // 2. 杀灭直接子进程
      try {
        execSync(`pkill -9 -P ${pid}`, { stdio: 'ignore' });
      } catch {}
      // 3. 杀灭主进程自身
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  } catch {
    // 忽略终止异常
  }
}

/**
 * 断开并销毁 stdio 管道，防止未关闭句柄阻塞 Worker 退出
 */
function destroyStdio(proc: ChildProcess | undefined): void {
  if (!proc) return;
  try {
    if (proc.stdout) {
      proc.stdout.unpipe(process.stdout);
      proc.stdout.destroy();
    }
    if (proc.stderr) {
      proc.stderr.unpipe(process.stderr);
      proc.stderr.destroy();
    }
  } catch {
    // 忽略流销毁异常
  }
}

function removeUserDataDir(tempUserDataDir: string): void {
  try {
    // force: true 对不存在的路径同样静默成功，无需前置 existsSync 判断
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  } catch {
    // 忽略 Windows 系统下的进程临时文件锁
  }
}

/**
 * 启动 Electron 自动化测试环境公共上下文
 * 封装了 4 大标准启动步骤：
 * 1. 创建隔离的临时用户数据目录（规避本地单例锁冲突）
 * 2. 注入静音/测试环境参数拉起 Electron 进程
 * 3. 管道化重定向主进程 stdout / stderr 至测试终端
 * 4. 等待首个窗口创建并加载就绪
 */
export async function launchElectronApp(
  options: LaunchElectronOptions = {},
): Promise<ElectronTestContext> {
  // 1. 准备隔离的用户数据目录（外部传入时复用，用于验证跨进程持久化）
  const ownsUserDataDir = !options.userDataDir;
  const tempUserDataDir =
    options.userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'electron-e2e-'));
  const shouldCleanupUserData = options.cleanupUserData ?? ownsUserDataDir;

  // 启动链路失败时用它回收已拉起的进程
  let launchedApp: ElectronApplication | undefined;

  try {
    // 2. 启动 Electron 应用
    const electronApp = await electron.launch({
      args: [
        '.',
        `--user-data-dir=${tempUserDataDir}`,
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        ...(options.extraArgs ?? []),
      ],
      env: {
        ...process.env,
        MODE: 'test',
        ...options.extraEnv,
      },
    });
    launchedApp = electronApp;

    // 3. 将主进程日志重定向至控制台以便追踪诊断
    const proc = electronApp.process();
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);

    // 4. 注入主进程 shell 安全桩
    // 【为什么必须全局 Mock 掉 shell 模块？】
    // - 在 Linux Xvfb / GitHub Actions 等无头 CI 环境中，缺少标准桌面文件管理器（如 Nautilus），
    //   Electron 的 shell.showItemInFolder / openPath 会降级触发 xdg-open，导致系统在后台误唤起
    //   Firefox 或其他默认浏览器作为独立后台孤儿进程常驻。
    // - 这些外部孤儿进程会持有主进程的 stdout/stderr 管道写端，导致测试套件全部通过后，
    //   Playwright Worker 因 stdio 管道无法到达 EOF 而发生严重挂死，触发 45000ms Worker teardown 超时。
    // - 同时亦可防止在本地开发者机器上运行 E2E 测试时频繁弹出真实的外部浏览器或资源管理器窗口。
    // - 测试用例只需验证 IPC 通信协议与参数分发正确性，严禁直接穿透操作系统原生界面。
    await electronApp.evaluate(({ shell }) => {
      shell.openExternal = async (url) => {
        console.warn('[E2E Shell Stub] openExternal called with:', url);
      };
      shell.openPath = async (path) => {
        console.warn('[E2E Shell Stub] openPath called with:', path);
        return '';
      };
      shell.showItemInFolder = (fullPath) => {
        console.warn('[E2E Shell Stub] showItemInFolder called with:', fullPath);
      };
    });

    // 5. 等待应用首个窗口加载就绪
    const page = await electronApp.firstWindow();
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err));
    await page.waitForLoadState('domcontentloaded');

    const cleanup = async () => {
      const pid = proc?.pid;
      let closeTimer: NodeJS.Timeout | undefined;

      try {
        // 限时 5 秒等待 Playwright electronApp.close() 完成
        await Promise.race([
          electronApp.close(),
          new Promise((_, reject) => {
            closeTimer = setTimeout(
              () => reject(new Error('electronApp.close() timed out after 5000ms')),
              5000,
            );
          }),
        ]);
      } catch (err) {
        console.warn(
          '[E2E Teardown] electronApp.close() timed out or failed, killing process tree:',
          err,
        );
        if (pid) {
          killProcessTree(pid, tempUserDataDir);
        }
      } finally {
        // 正常关闭时也要清掉兜底 timer，避免它拖住 Worker 事件循环
        if (closeTimer) clearTimeout(closeTimer);
        destroyStdio(proc);

        // 兜底检查：如果主进程或子进程依然残留，强制杀灭进程树
        if (pid) {
          try {
            process.kill(pid, 0);
            killProcessTree(pid, tempUserDataDir);
          } catch {
            // 进程已退出
          }
        }
      }

      if (shouldCleanupUserData) {
        removeUserDataDir(tempUserDataDir);
      }
    };

    return {
      electronApp,
      page,
      tempUserDataDir,
      cleanup,
    };
  } catch (error) {
    // 启动/桩注入/首窗口任一环节失败：回收已拉起的进程与本次自建目录，避免残留
    if (launchedApp) {
      const proc = launchedApp.process();
      try {
        await launchedApp.close();
      } catch {
        if (proc?.pid) killProcessTree(proc.pid, tempUserDataDir);
      }
      destroyStdio(proc);
    }
    if (shouldCleanupUserData) {
      removeUserDataDir(tempUserDataDir);
    }
    throw error;
  }
}
