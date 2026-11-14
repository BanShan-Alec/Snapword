import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type Page } from '@playwright/test';
import { getRepoEnvValue, loadRepoEnv } from '../build/lib/env.ts';
import { getDistDir } from '../build/lib/repo-paths.ts';

interface PostbuildVerificationOptions {
  /**
   * asar 体积阈值（MB），超过则判定为防劣化门禁失败
   * 默认 10MB（可通过环境变量 MAX_ASAR_SIZE_MB 覆盖）
   */
  maxAsarSizeMb?: number;
  /**
   * 自定义 dist 目录路径（默认根目录 dist）
   */
  distDir?: string;
}

interface DetectedArtifact {
  executablePath: string;
  asarPath: string;
  platform: 'win32' | 'darwin' | 'linux';
}

/**
 * 自动跨平台发现 dist 下解包出来的目标二进制与 app.asar
 */
function detectUnpackedArtifact(distDir: string): DetectedArtifact | null {
  if (!fs.existsSync(distDir)) {
    return null;
  }

  // 1. Windows 检测 (dist/win-unpacked/)
  const winUnpackedDir = path.join(distDir, 'win-unpacked');
  if (fs.existsSync(winUnpackedDir)) {
    const files = fs.readdirSync(winUnpackedDir);
    const exeName = files.find(
      (f: string) => f.endsWith('.exe') && !f.toLowerCase().includes('uninstall'),
    );
    const asarPath = path.join(winUnpackedDir, 'resources', 'app.asar');
    if (exeName && fs.existsSync(asarPath)) {
      return {
        executablePath: path.join(winUnpackedDir, exeName),
        asarPath,
        platform: 'win32',
      };
    }
  }

  // 2. macOS 检测 (dist/mac/ 或 dist/mac-arm64/)
  for (const macDirName of ['mac', 'mac-arm64']) {
    const macDir = path.join(distDir, macDirName);
    if (fs.existsSync(macDir)) {
      const appFolder = fs.readdirSync(macDir).find((f: string) => f.endsWith('.app'));
      if (appFolder) {
        const macOSDir = path.join(macDir, appFolder, 'Contents', 'MacOS');
        const asarPath = path.join(macDir, appFolder, 'Contents', 'Resources', 'app.asar');
        if (fs.existsSync(macOSDir) && fs.existsSync(asarPath)) {
          const binaryName = fs.readdirSync(macOSDir)[0];
          if (binaryName) {
            return {
              executablePath: path.join(macOSDir, binaryName),
              asarPath,
              platform: 'darwin',
            };
          }
        }
      }
    }
  }

  // 3. Linux 检测 (dist/linux-unpacked/)
  const linuxUnpackedDir = path.join(distDir, 'linux-unpacked');
  if (fs.existsSync(linuxUnpackedDir)) {
    const asarPath = path.join(linuxUnpackedDir, 'resources', 'app.asar');
    if (fs.existsSync(asarPath)) {
      const files = fs.readdirSync(linuxUnpackedDir);
      const ignoredBinaries = new Set(['chrome-sandbox', 'chrome_crashpad_handler']);
      const binaryName = files.find((f: string) => {
        if (ignoredBinaries.has(f)) return false;
        const fullPath = path.join(linuxUnpackedDir, f);
        try {
          const stat = fs.statSync(fullPath);
          return stat.isFile() && !f.includes('.') && Boolean(stat.mode & 0o111);
        } catch {
          return false;
        }
      });
      if (binaryName) {
        return {
          executablePath: path.join(linuxUnpackedDir, binaryName),
          asarPath,
          platform: 'linux',
        };
      }
    }
  }

  return null;
}

interface AsarEntry {
  size?: number;
  offset?: string;
  files?: Record<string, AsarEntry>;
}

/**
 * 读取并分析 app.asar 归档内部模块体积分布
 */
function analyzeAsarSize(asarPath: string): void {
  try {
    const fd = fs.openSync(asarPath, 'r');
    const sizeBuf = Buffer.alloc(16);
    fs.readSync(fd, sizeBuf, 0, 16, 0);
    const headerSize = sizeBuf.readUInt32LE(12);
    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 16);
    fs.closeSync(fd);

    const header = JSON.parse(headerBuf.toString('utf8')) as AsarEntry;

    // 统计各顶层/主要模块和单文件体积
    const fileList: Array<{ path: string; size: number }> = [];
    const moduleSizes: Record<string, number> = {};

    function traverse(node: AsarEntry, curPath: string) {
      if (typeof node.size === 'number') {
        fileList.push({ path: curPath, size: node.size });

        // 提取主要模块归属（如 @app/main, @app/renderer, 第三方 node_modules 等）
        let category = 'other';
        if (curPath.startsWith('node_modules/@app/')) {
          const parts = curPath.split('/');
          category = `${parts[1]}/${parts[2]}`;
        } else if (curPath.startsWith('node_modules/')) {
          const parts = curPath.split('/');
          category = `node_modules/${parts[1]}`;
        } else if (curPath.startsWith('dist/')) {
          category = 'dist';
        }
        moduleSizes[category] = (moduleSizes[category] || 0) + node.size;
        return;
      }
      if (node.files) {
        for (const [name, child] of Object.entries(node.files)) {
          traverse(child, curPath ? `${curPath}/${name}` : name);
        }
      }
    }

    traverse(header, '');

    console.log('\n📈 [verify-postbuild] ====== asar 体积构成分析 ======');
    console.log('📌 核心模块体积占比:');
    const sortedModules = Object.entries(moduleSizes).sort((a, b) => b[1] - a[1]);
    for (const [mod, size] of sortedModules) {
      const sizeKb = (size / 1024).toFixed(1);
      const sizeMb = (size / (1024 * 1024)).toFixed(2);
      console.log(`   - ${mod.padEnd(30)}: ${sizeMb.padStart(5)} MB (${sizeKb.padStart(7)} KB)`);
    }

    console.log('\n📌 TOP 5 最大产物文件:');
    fileList.sort((a, b) => b.size - a.size);
    for (const item of fileList.slice(0, 5)) {
      const sizeKb = (item.size / 1024).toFixed(1);
      console.log(`   - ${`${sizeKb} KB`.padEnd(12)} ${item.path}`);
    }
    console.log('====================================================\n');
  } catch (err) {
    console.warn('⚠️ [verify-postbuild] 无法读取 asar 内部结构详情:', err);
  }
}

/**
 * 打包构建后置验真（Post-build Verification）
 *
 * 核心职责：在打包完成后验证物理产物完整性与可用性
 * 1. 跨平台自动发现解包产物与 asar 归档
 * 2. asar 体积防劣化硬门禁与构成透视分析（<10MB）
 * 3. 真实拉起已打包程序执行 Playwright Smoke 烟雾健康检查（验证 body.app-startup-ready 揭幕与无未捕获异常）
 */
async function verifyPostbuild(options: PostbuildVerificationOptions = {}): Promise<void> {
  const repoEnv = loadRepoEnv(__dirname, 'production');
  const distDir = options.distDir
    ? path.resolve(repoEnv.rootDir, options.distDir)
    : getDistDir(repoEnv.rootDir);
  const maxAsarSizeMb =
    options.maxAsarSizeMb ?? Number(getRepoEnvValue(repoEnv, 'MAX_ASAR_SIZE_MB') || 10);

  console.log('\n🔍 [verify-postbuild] 开始打包产物 Smoke 自动化验证...');

  const artifact = detectUnpackedArtifact(distDir);
  if (!artifact) {
    throw new Error(
      `[verify-postbuild] 未在 ${distDir} 找到解包产物（支持 win-unpacked / mac / linux-unpacked）。请先完成打包构建。`,
    );
  }

  console.log(`📦 [verify-postbuild] 发现解包产物: ${artifact.executablePath}`);
  console.log(`📄 [verify-postbuild] 发现 asar 归档: ${artifact.asarPath}`);

  // 1. asar 体积门禁校验与详细监控
  const asarStat = fs.statSync(artifact.asarPath);
  const asarSizeMb = asarStat.size / (1024 * 1024);
  console.log(
    `📊 [verify-postbuild] asar 总体积: ${asarSizeMb.toFixed(2)} MB (${asarStat.size.toLocaleString()} bytes) [阈值上限: ${maxAsarSizeMb.toFixed(2)} MB]`,
  );

  analyzeAsarSize(artifact.asarPath);

  if (asarSizeMb > maxAsarSizeMb) {
    throw new Error(
      `❌ [verify-postbuild] asar 体积超过门禁上限 (${asarSizeMb.toFixed(2)} MB > ${maxAsarSizeMb.toFixed(2)} MB)，发生体积异常膨胀防劣化失败！`,
    );
  }
  console.log('✅ [verify-postbuild] asar 体积门禁检查通过！');

  // 2. 跨平台宿主兼容性守卫：若当前环境无法直接拉起目标二进制（例如 Linux 交叉编译构建了 Windows exe），安全跳过运行时测试
  if (process.platform !== artifact.platform) {
    console.warn(
      `⚠️ [verify-postbuild] 目标平台 (${artifact.platform}) 与当前宿主平台 (${process.platform}) 不一致，跳过真实进程启动测试。`,
    );
    return;
  }

  // 无显示服务环境守卫（如无 Xvfb 的 Linux 纯命令行服务器或容器）
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    console.warn(
      '⚠️ [verify-postbuild] 检测到当前 Linux 环境无可用 DISPLAY/WAYLAND 桌面显示服务，跳过运行时进程拉起测试。',
    );
    return;
  }

  // 3. 真实启动打包二进制进行 Smoke 校验
  console.log('🚀 [verify-postbuild] 启动已打包程序执行运行时健康检查...');
  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-smoke-test-'));

  try {
    const app = await electron.launch({
      executablePath: artifact.executablePath,
      args: [
        `--user-data-dir=${tempUserDataDir}`,
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
      timeout: 30000,
    });

    try {
      console.log('⏳ [verify-postbuild] 等待主窗口就绪...');
      const pageErrors: Error[] = [];
      const errorFingerprints = new Set<string>();
      const attachedPages = new WeakSet<Page>();

      const recordPageError = (err: Error) => {
        const fingerprint = `${err.name}:${err.message}\n${err.stack ?? ''}`;
        if (errorFingerprints.has(fingerprint)) return;
        errorFingerprints.add(fingerprint);
        pageErrors.push(err);
        console.error('❌ [verify-postbuild] 捕获到页面未处理异常 (pageerror):', err);
      };

      const attachPage = (p: Page) => {
        if (attachedPages.has(p)) return;
        attachedPages.add(p);
        p.on('pageerror', recordPageError);
      };

      app.on('window', attachPage);

      const page = await app.firstWindow();
      attachPage(page);

      const title = await page.title();
      console.log(`🪟 [verify-postbuild] 主窗口捕获成功: title="${title}"`);

      console.log('⏳ [verify-postbuild] 校验启动就绪揭幕 (body.app-startup-ready)...');
      try {
        await page.waitForSelector('body.app-startup-ready', { timeout: 15000 });
        console.log('✅ [verify-postbuild] 启动协调器已揭幕就绪 (body.app-startup-ready)！');
      } catch (waitErr) {
        if (pageErrors.length > 0) {
          throw new Error(
            `[verify-postbuild] 等待启动就绪揭幕超时或失败，且捕获到 ${pageErrors.length} 个未处理页面异常:\n` +
              pageErrors.map((e) => `  - ${e.message}\n${e.stack ?? ''}`).join('\n'),
            { cause: waitErr },
          );
        }
        throw waitErr;
      }

      if (pageErrors.length > 0) {
        throw new Error(
          `[verify-postbuild] 启动阶段捕获到 ${pageErrors.length} 个未处理页面异常:\n` +
            pageErrors.map((e) => `  - ${e.message}\n${e.stack ?? ''}`).join('\n'),
        );
      }
    } finally {
      await app.close();
      console.log('🛑 [verify-postbuild] 应用程序已正常优雅退出。');
    }
  } finally {
    try {
      fs.rmSync(tempUserDataDir, { recursive: true, force: true });
    } catch {
      // 忽略临时目录清理异常
    }
  }

  console.log('🎉 [verify-postbuild] 打包产物直接运行验证全部通过！\n');
}

export { detectUnpackedArtifact, verifyPostbuild };

// 支持直接作为 CLI 执行
if (
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('verify-postbuild.ts')
) {
  verifyPostbuild().catch((err) => {
    console.error('❌ [verify-postbuild] 校验失败:', err);
    process.exit(1);
  });
}
