import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './helpers/fixture';

const isDemo = Boolean(process.env.DEMO_MODE);
const stepDelay = (ms = 1500) =>
  isDemo ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

test.describe
  .serial('自动更新模块 (Updater Features) E2E 自动化测试', () => {
    let updaterPage: Page;

    test.beforeAll(async ({ page }) => {
      // 确保界面处于简体中文环境以稳定匹配测试文案：等待 lang 真正切换完成
      await page.evaluate(async () => {
        await (window as any).api?.config?.update?.({ language: 'zh-CN' });
      });
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    });

    async function ensureUpdaterWindow(
      electronApp: ElectronApplication,
      mainPage: Page,
    ): Promise<Page> {
      const existing = electronApp.windows().find((w) => w.url().includes('updater'));
      if (existing) {
        return existing;
      }
      const [win] = await Promise.all([
        electronApp.waitForEvent('window'),
        mainPage.getByRole('button', { name: /检查更新|Check for updates/ }).click(),
      ]);
      await win.waitForLoadState('domcontentloaded');
      return win;
    }

    test('用例 1：设置页触发与更新窗口弹出', async ({ page, electronApp }) => {
      // 1. 在主窗口 Settings 区域点击「检查更新」按钮，并监听捕获新的 updater 窗口
      updaterPage = await ensureUpdaterWindow(electronApp, page);

      // 2. 断言其 URL 包含 updater
      expect(updaterPage.url()).toContain('updater');

      // 3. 断言窗口在 Electron 主进程中可见（轮询等待 ready-to-show 触发 show()）
      await expect
        .poll(
          async () => {
            return electronApp.evaluate(({ BrowserWindow }) => {
              const wins = BrowserWindow.getAllWindows();
              const updaterWin = wins.find((w) => w.webContents.getURL().includes('updater'));
              return updaterWin ? updaterWin.isVisible() : false;
            });
          },
          { timeout: 5000 },
        )
        .toBe(true);

      // 4. 断言具备 checking 初始态文案
      await expect(updaterPage.getByText('检查更新中')).toBeVisible();
      await expect(updaterPage.getByText('正在检查更新...')).toBeVisible();
      await stepDelay(1500);
    });

    test('用例 2：新版本可用与 Changelog 渲染', async ({ electronApp }) => {
      // 注入新版本元数据（v2.0.0，包含多行 changelog 与发布日期）
      await electronApp.evaluate(() => {
        const mock = (globalThis as any).__updaterMock;
        mock?.emit({
          type: 'available',
          version: '2.0.0',
          releaseDate: '2026-10-01',
          releaseNotes: [
            '新增自动更新独立窗口',
            '优化多语言与主题跨窗口同步',
            '提升主进程通信稳定性',
            '详见 [更新详情](https://github.com/ban-shan/repo)',
          ],
        });
      });

      // 断言界面成功展示版本号、日期以及更新日志文本
      await expect(updaterPage.getByText('v2.0.0')).toBeVisible();
      await expect(updaterPage.getByText('更新日志')).toBeVisible();
      await expect(updaterPage.getByText('新增自动更新独立窗口')).toBeVisible();
      await expect(updaterPage.getByText('优化多语言与主题跨窗口同步')).toBeVisible();
      await expect(updaterPage.getByText('提升主进程通信稳定性')).toBeVisible();

      // 断言 Markdown 链接安全渲染
      const link = updaterPage.getByRole('link', { name: '更新详情' });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', 'https://github.com/ban-shan/repo');

      // 验证外链白名单安全防御：非白名单域名被拦截
      const disallowedResult = await updaterPage.evaluate(async () => {
        return (window as any).api?.shell?.openExternal?.('https://malicious-site.com');
      });
      expect(disallowedResult?.success).toBe(false);

      // 断言主操作按钮显示为「立即更新」，次要按钮显示为「稍后提醒」
      await expect(updaterPage.getByRole('button', { name: '立即更新' })).toBeVisible();
      await expect(updaterPage.getByRole('button', { name: '稍后提醒' })).toBeVisible();
      await stepDelay(1500);
    });

    test('用例 3：下载流程与进度条推进', async ({ electronApp }) => {
      // 1. 点击「立即更新」按钮
      const downloadButton = updaterPage.getByRole('button', { name: '立即更新' });
      await downloadButton.click();

      // 2. 持续注入下载进度：25%
      await electronApp.evaluate(() => {
        const mock = (globalThis as any).__updaterMock;
        mock?.emit({
          type: 'progress',
          percent: 25,
          bytesPerSecond: 2.5 * 1024 * 1024,
          transferred: 25 * 1024 * 1024,
          total: 100 * 1024 * 1024,
        });
      });

      // 断言 ProgressCard 渲染，25% 进度呈现
      await expect(updaterPage.getByText('下载进度')).toBeVisible();
      await expect(updaterPage.getByText('25%')).toBeVisible();
      await expect(updaterPage.getByText('2.50 MB/s')).toBeVisible();
      await stepDelay(800);

      // 3. 持续注入下载进度：50%
      await electronApp.evaluate(() => {
        const mock = (globalThis as any).__updaterMock;
        mock?.emit({
          type: 'progress',
          percent: 50,
          bytesPerSecond: 4.8 * 1024 * 1024,
          transferred: 50 * 1024 * 1024,
          total: 100 * 1024 * 1024,
        });
      });
      await expect(updaterPage.getByText('50%')).toBeVisible();
      await expect(updaterPage.getByText('4.80 MB/s')).toBeVisible();
      await stepDelay(800);

      // 4. 注入进度：100%
      await electronApp.evaluate(() => {
        const mock = (globalThis as any).__updaterMock;
        mock?.emit({
          type: 'progress',
          percent: 100,
          bytesPerSecond: 5.0 * 1024 * 1024,
          transferred: 100 * 1024 * 1024,
          total: 100 * 1024 * 1024,
        });
      });
      await expect(updaterPage.getByText('100%')).toBeVisible();
      await stepDelay(800);
    });

    test('用例 4：下载就绪与安装引导', async ({ electronApp }) => {
      // 模拟下载完成事件（downloaded）
      await electronApp.evaluate(() => {
        const mock = (globalThis as any).__updaterMock;
        mock?.emit({
          type: 'downloaded',
        });
      });

      // 断言界面展示「重启并安装」主按钮与「稍后安装」次要按钮
      await expect(updaterPage.getByText('更新已准备就绪')).toBeVisible();
      await expect(updaterPage.getByRole('button', { name: '重启并安装' })).toBeVisible();
      await expect(updaterPage.getByRole('button', { name: '稍后安装' })).toBeVisible();
      await stepDelay(1500);
    });

    test('用例 5：下载中断错误与重试', async ({ electronApp }) => {
      // 模拟下载网络异常触发 error 态（带语义码，验证按 code 的本地化主文案 + 原始报错次要行）
      await electronApp.evaluate(() => {
        const mock = (globalThis as any).__updaterMock;
        mock?.emit({
          type: 'error',
          message: '网络连接异常中断，无法继续下载更新包',
          code: 'UPDATER_NETWORK_ERROR',
        });
      });

      // 断言错误提示展示：标题 + 按语义码选择的本地化主文案
      await expect(updaterPage.getByText('更新失败')).toBeVisible();
      await expect(updaterPage.getByText('网络连接失败或超时，请检查网络后重试。')).toBeVisible();
      // 原始报错以次要行保留（排查线索）
      await expect(updaterPage.getByText('网络连接异常中断，无法继续下载更新包')).toBeVisible();
      await stepDelay(1200);

      // 断言主按钮切换为「重试」
      const retryBtn = updaterPage.getByRole('button', { name: /重\s*试/ });
      await expect(retryBtn).toBeVisible();

      // 点击重试重新发起检查或下载
      await retryBtn.click();

      // 验证状态机重入为 downloading 或 checking
      await expect
        .poll(
          async () =>
            electronApp.evaluate(() => {
              const service = (globalThis as any).__updaterService;
              return service?.getState();
            }),
          { timeout: 5000 },
        )
        .toMatch(/^(downloading|checking)$/);
      await stepDelay(1000);
    });

    test('用例 6：窗口隐藏保留与后台下载连续性', async ({ page, electronApp }) => {
      // 确保处于下载状态
      await electronApp.evaluate(() => {
        const mock = (globalThis as any).__updaterMock;
        mock?.emit({
          type: 'progress',
          percent: 60,
          bytesPerSecond: 3.0 * 1024 * 1024,
          transferred: 60 * 1024 * 1024,
          total: 100 * 1024 * 1024,
        });
      });
      await stepDelay(1000);

      // 点击「隐藏到后台」按钮
      const hideButton = updaterPage.getByRole('button', { name: '隐藏到后台' });
      await expect(hideButton).toBeVisible();
      await hideButton.click();

      // 断言更新窗口已隐藏/销毁（不存在于可见的 BrowserWindow 列表中）
      await expect
        .poll(
          async () =>
            electronApp.evaluate(({ BrowserWindow }) => {
              const wins = BrowserWindow.getAllWindows();
              const updaterWin = wins.find((w) => {
                try {
                  return (
                    !w.isDestroyed() &&
                    Boolean(w.webContents) &&
                    !w.webContents.isDestroyed() &&
                    w.webContents.getURL().includes('updater')
                  );
                } catch {
                  return false;
                }
              });
              return !updaterWin?.isVisible();
            }),
          { timeout: 5000 },
        )
        .toBe(true);
      await stepDelay(1500);

      // 在窗口销毁期间，后台下载持续推进至 85%
      await electronApp.evaluate(() => {
        const mock = (globalThis as any).__updaterMock;
        mock?.emit({
          type: 'progress',
          percent: 85,
          bytesPerSecond: 3.5 * 1024 * 1024,
          transferred: 85 * 1024 * 1024,
          total: 100 * 1024 * 1024,
        });
      });

      // 主窗口再次点击「检查更新」，重新创建并拉起更新窗口
      const [newUpdaterPage] = await Promise.all([
        electronApp.waitForEvent('window'),
        page.getByRole('button', { name: /检查更新|Check for updates/ }).click(),
      ]);
      await newUpdaterPage.waitForLoadState('domcontentloaded');

      // 更新窗口重新显示
      await expect
        .poll(
          async () =>
            electronApp.evaluate(({ BrowserWindow }) => {
              const wins = BrowserWindow.getAllWindows();
              const updaterWin = wins.find((w) => {
                try {
                  return (
                    !w.isDestroyed() &&
                    Boolean(w.webContents) &&
                    !w.webContents.isDestroyed() &&
                    w.webContents.getURL().includes('updater')
                  );
                } catch {
                  return false;
                }
              });
              return updaterWin ? updaterWin.isVisible() : false;
            }),
          { timeout: 5000 },
        )
        .toBe(true);

      // 断言进度条保持最新连续进度 (85%)
      await expect(newUpdaterPage.getByText('85%')).toBeVisible();
      await expect(newUpdaterPage.getByText('3.50 MB/s')).toBeVisible();
      await stepDelay(2000);
    });

    test('用例 7：更新窗口随语言切换为英文', async ({ page, electronApp }) => {
      try {
        // 切到 en-US：两个窗口经 config.onChanged 同步重渲染
        await page.evaluate(async () => {
          await (window as any).api?.config?.update?.({ language: 'en-US' });
        });
        await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');

        updaterPage = await ensureUpdaterWindow(electronApp, page);
        // 关闭按钮的 aria-label 走 t 宏，是与更新状态无关的稳定断言点
        await expect(updaterPage.getByRole('button', { name: 'Close' })).toBeVisible();
      } finally {
        // 恢复中文，避免影响同进程内的后续断言
        await page.evaluate(async () => {
          await (window as any).api?.config?.update?.({ language: 'zh-CN' });
        });
        await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
      }
    });
  });
