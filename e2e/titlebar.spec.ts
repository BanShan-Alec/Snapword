import { expect, test } from './helpers/fixture';

type WindowControlsOverlayLike = {
  visible: boolean;
  getTitlebarAreaRect(): { x: number; y: number; width: number; height: number };
};

test.describe('TitleBarOverlay (WCO) E2E 验证', () => {
  test('平台类名注入与 WCO 环境变量生效', async ({ page }) => {
    const html = page.locator('html');
    const platformClass = await html.evaluate((el) =>
      Array.from(el.classList).find((c) => c.startsWith('platform-')),
    );
    expect(platformClass).toMatch(/^platform-(darwin|win32|linux)$/);

    const state = await page.evaluate(() => {
      const wco = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlayLike })
        .windowControlsOverlay;
      const dragRegion = document.querySelector<HTMLElement>('.drag-region');
      const header = document.querySelector<HTMLElement>('header');
      return {
        wcoVisible: wco?.visible ?? null,
        area: wco?.getTitlebarAreaRect?.() ?? null,
        paddingLeft: dragRegion ? parseFloat(getComputedStyle(dragRegion).paddingLeft) : null,
        paddingRight: dragRegion ? parseFloat(getComputedStyle(dragRegion).paddingRight) : null,
        headerHeight: header ? parseFloat(getComputedStyle(header).height) : null,
      };
    });

    if (platformClass === 'platform-win32') {
      // overlay 在创建时启用 → WCO JS API 可用，右侧避让由 env(titlebar-area-width) 计算
      expect(state.wcoVisible).toBe(true);
      expect(state.area).not.toBeNull();
      expect(state.paddingRight).toBeGreaterThan(0);
      // 头部保持内容自然高度，不被 overlay 高度压扁
      expect(state.headerHeight).toBeGreaterThan(40);
    } else if (platformClass === 'platform-darwin') {
      // macOS: overlay 仅启用 env(titlebar-area-x)，红绿灯左侧避让
      expect(state.paddingLeft).toBeGreaterThan(0);
    }
  });

  test('主题切换触发主进程 overlay 同步且页面可正常交互', async ({ page }) => {
    const html = page.locator('html');
    const themeSelect = page.locator('#theme-select');

    // 前序用例可能已把语言切到 en-US，选项文案按中英文同时匹配
    await themeSelect.click();
    await page.locator('.ant-select-item-option-content', { hasText: /深色模式|Dark/ }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await themeSelect.click();
    await page.locator('.ant-select-item-option-content', { hasText: /浅色模式|Light/ }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });
});
