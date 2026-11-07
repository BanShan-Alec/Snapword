import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers/fixture';

async function readPrimaryButtonBg(page: Page) {
  return page.evaluate(() => {
    const button = document.querySelector('.ant-btn-primary');
    return button ? getComputedStyle(button).backgroundColor : null;
  });
}

async function readTokenSnapshot(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const portal = document.createElement('div');
    portal.className = 'bg-background-container text-foreground';
    document.body.appendChild(portal);
    const portalStyle = getComputedStyle(portal);
    const snapshot = {
      hasScopeClass: root.classList.contains('css-var-app'),
      antdPrimary: rootStyle.getPropertyValue('--ant-color-primary').trim(),
      projectPrimary: rootStyle.getPropertyValue('--color-primary').trim(),
      portalBg: portalStyle.backgroundColor,
      portalFg: portalStyle.color,
    };
    portal.remove();
    return snapshot;
  });
}

test.describe('应用偏好设置模块 (Settings Features) E2E 自动化测试', () => {
  test('用例 1：外观主题切换与根节点类名生效', async ({ page }) => {
    // 默认应为跟随系统或浅色/暗色已解析
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', /.+/);

    const initialTokens = await readTokenSnapshot(page);
    expect(initialTokens.hasScopeClass).toBe(true);
    expect(initialTokens.antdPrimary).not.toBe('');
    expect(initialTokens.projectPrimary).toBe(initialTokens.antdPrimary);
    expect(initialTokens.portalBg).not.toBe('rgba(0, 0, 0, 0)');

    // 1. 切换至深色模式 (Dark)
    const themeSelect = page.locator('#theme-select');
    await themeSelect.click();
    const darkOption = page.locator('.ant-select-item-option-content', { hasText: '深色模式' });
    await darkOption.click();

    // 断言 data-theme 为 dark
    await expect(html).toHaveAttribute('data-theme', 'dark');

    const darkTokens = await readTokenSnapshot(page);
    expect(darkTokens.antdPrimary).toBe('#1668dc');
    expect(darkTokens.projectPrimary).toBe('#1668dc');
    await expect.poll(() => readPrimaryButtonBg(page), { timeout: 2000 }).toBe('rgb(22, 104, 220)');
    expect(darkTokens.portalBg).toBe('rgb(20, 20, 20)');
    expect(darkTokens.portalFg).toBe('rgba(255, 255, 255, 0.85)');

    // 2. 切换至浅色模式 (Light)
    await themeSelect.click();
    const lightOption = page.locator('.ant-select-item-option-content', { hasText: '浅色模式' });
    await lightOption.click();

    // 断言 data-theme 为 light
    await expect(html).toHaveAttribute('data-theme', 'light');

    const lightTokens = await readTokenSnapshot(page);
    expect(lightTokens.antdPrimary).toBe('#1677ff');
    expect(lightTokens.projectPrimary).toBe('#1677ff');
    await expect.poll(() => readPrimaryButtonBg(page), { timeout: 2000 }).toBe('rgb(22, 119, 255)');
    expect(lightTokens.portalBg).toBe('rgb(255, 255, 255)');
    expect(lightTokens.portalFg).toBe('rgba(0, 0, 0, 0.88)');
  });

  test('用例 2：全链路多语言切换（Header + Settings + Counter + 系统托盘）', async ({
    page,
    electronApp,
  }) => {
    const html = page.locator('html');

    // 1. 初始状态断言（简体中文）
    await expect(html).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('.ant-tabs-tab', { hasText: '总览看板' })).toBeVisible();
    await expect(page.getByText('应用偏好设置 (ConfigStore)')).toBeVisible();
    await expect(page.getByText('IPC 计数器 (Counter)')).toBeVisible();

    // 检查托盘右键菜单文案（中文）
    const initialTrayLabel = await electronApp.evaluate(() => {
      const trayManager = (
        globalThis as unknown as {
          __trayManager?: { getContextMenu: () => { items?: { label?: string }[] } };
        }
      ).__trayManager;
      const tray = trayManager?.getContextMenu?.();
      return tray?.items?.[0]?.label;
    });
    expect(initialTrayLabel).toBe('显示主窗口');

    // 2. 切换至 English (en-US)
    const langSelect = page.locator('#lang-select');
    await langSelect.click();
    const enOption = page.locator('.ant-select-item-option-content', { hasText: 'English' });
    await enOption.click();

    // 断言 html lang 属性更新
    await expect(html).toHaveAttribute('lang', 'en-US');

    // 断言 Header 导航标签变为英文
    await expect(page.locator('.ant-tabs-tab', { hasText: 'Dashboard' })).toBeVisible();

    // 断言 Settings 卡片标题与设置项标签变为英文
    await expect(page.getByText('Preferences', { exact: true })).toBeVisible();
    await expect(page.getByText('Theme', { exact: true })).toBeVisible();

    // 断言跨域典型业务卡片 (Counter) 变为英文
    await expect(page.getByText('IPC counter')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Increment' })).toBeVisible();

    // 断言主进程系统托盘菜单动态更新为英文
    const updatedTrayLabel = await electronApp.evaluate(() => {
      const trayManager = (
        globalThis as unknown as {
          __trayManager?: { getContextMenu: () => { items?: { label?: string }[] } };
        }
      ).__trayManager;
      const tray = trayManager?.getContextMenu?.();
      return tray?.items?.[0]?.label;
    });
    expect(updatedTrayLabel).toBe('Show main window');

    // 3. 切回简体中文 (zh-CN)
    await langSelect.click();
    const zhOption = page.locator('.ant-select-item-option-content', { hasText: '简体中文' });
    await zhOption.click();

    await expect(html).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('.ant-tabs-tab', { hasText: '总览看板' })).toBeVisible();
    await expect(page.getByText('应用偏好设置 (ConfigStore)')).toBeVisible();
    await expect(page.getByText('IPC 计数器 (Counter)')).toBeVisible();

    // 4. 跟随系统：解析到受支持语种（CI 通常为 en-US），再切回中文
    await langSelect.click();
    await page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
      .getByText('跟随系统 (System)', { exact: true })
      .click();
    await expect(html).toHaveAttribute('lang', /^(zh-CN|en-US)$/);

    await langSelect.click();
    await zhOption.click();
    await expect(html).toHaveAttribute('lang', 'zh-CN');
  });

  test('用例 3：关闭窗口后保留托盘偏好与关闭行为', async ({ page, electronApp, electronCtx }) => {
    // 1. 验证整行/文本可点击性：点击托盘保留设置文案可触发开关
    const toggleRow = page.locator('.settings-toggle-row', {
      hasText: '关闭后保留在托盘',
    });
    const switchEl = toggleRow.locator('#tray-switch');

    // 默认应当为开启状态
    await expect(switchEl).toHaveAttribute('aria-checked', 'true');

    // 点击文案切换为未开启
    await toggleRow.locator('label[for="tray-switch"]').click();
    await expect(switchEl).toHaveAttribute('aria-checked', 'false');

    // 再次点击切回开启
    await toggleRow.locator('label[for="tray-switch"]').click();
    await expect(switchEl).toHaveAttribute('aria-checked', 'true');

    // 2. 行为验证：当 minimizeToTray 为 true 时，关闭主窗口触发销毁以释放内存
    const isWindowVisibleBefore = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) =>
          !w.isDestroyed() &&
          Boolean(w.webContents) &&
          !w.webContents.isDestroyed() &&
          !w.webContents.getURL().includes('updater'),
      );
      return win?.isVisible();
    });
    expect(isWindowVisibleBefore).toBe(true);

    // 触发窗口 close
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) =>
          !w.isDestroyed() &&
          Boolean(w.webContents) &&
          !w.webContents.isDestroyed() &&
          !w.webContents.getURL().includes('updater'),
      );
      win?.close();
    });

    // 窗口应被 destroy 销毁以释放内存，不再存活
    await expect
      .poll(
        async () =>
          electronApp.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find(
              (w) =>
                !w.isDestroyed() &&
                Boolean(w.webContents) &&
                !w.webContents.isDestroyed() &&
                !w.webContents.getURL().includes('updater'),
            );
            return win === undefined;
          }),
        { timeout: 5000 },
      )
      .toBe(true);

    // 模拟从系统托盘唤醒恢复主窗口（重新创建窗口）
    const [restoredPage] = await Promise.all([
      electronApp.waitForEvent('window'),
      electronApp.evaluate(async () => {
        await (globalThis as any).__windowManager?.restoreOrCreateWindow(true);
      }),
    ]);
    await restoredPage.waitForLoadState('domcontentloaded');
    await expect(restoredPage.locator('body')).toBeVisible();

    // 更新 fixture 中的全局 page 句柄供后续测试复用
    electronCtx.page = restoredPage;
  });

  test('★ 核心用例 4：连续修改多个 Feature 互不干扰（防冲刷与防重置）', async ({
    page,
    electronCtx,
  }) => {
    const html = page.locator('html');

    try {
      // 步骤 1: 修改 theme 为 dark
      const themeSelect = page.locator('#theme-select');
      await themeSelect.click();
      await page.locator('.ant-select-item-option-content', { hasText: '深色模式' }).click();

      await expect(html).toHaveAttribute('data-theme', 'dark');

      // 步骤 2: 修改 language 为 en-US
      const langSelect = page.locator('#lang-select');
      await langSelect.click();
      await page.locator('.ant-select-item-option-content', { hasText: 'English' }).click();

      // 断言语言变更为 en-US
      await expect(html).toHaveAttribute('lang', 'en-US');

      // 【致命校验】：修改语言后，主题必须依然保持为 dark，绝不能被重置回默认的 system 或 light！
      await expect(html).toHaveAttribute('data-theme', 'dark');

      // 步骤 3: 修改 minimizeToTray 为 false
      const toggleRow = page.locator('.settings-toggle-row', {
        hasText: 'Keep in tray',
      });
      const switchEl = toggleRow.locator('#tray-switch');
      await toggleRow.locator('label[for="tray-switch"]').click();
      await expect(switchEl).toHaveAttribute('aria-checked', 'false');

      // 【致命校验】：修改托盘开关后，theme 必须依然是 dark，language 必须依然是 en-US！
      await expect(html).toHaveAttribute('data-theme', 'dark');
      await expect(html).toHaveAttribute('lang', 'en-US');

      // 验证磁盘落盘的 config.json 文件确实保留了所有修改项
      const configPath = path.join(electronCtx.tempUserDataDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(savedConfig.theme).toBe('dark');
      expect(savedConfig.language).toBe('en-US');
      expect(savedConfig.minimizeToTray).toBe(false);
    } finally {
      // 恢复默认偏好，避免 dark / en-US / 托盘关闭残留给同进程内的后续用例
      await page.evaluate(async () => {
        await (window as any).api?.config?.update?.({
          theme: 'system',
          language: 'zh-CN',
          minimizeToTray: true,
        });
      });
      // 直接调用 config.update 不会经过 Settings hook 的本地回填，重载以重新读取持久化配置
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await expect(html).toHaveAttribute('lang', 'zh-CN');
      await expect(
        page
          .locator('.settings-toggle-row', { hasText: '关闭后保留在托盘' })
          .locator('#tray-switch'),
      ).toHaveAttribute('aria-checked', 'true');
    }
  });
});
