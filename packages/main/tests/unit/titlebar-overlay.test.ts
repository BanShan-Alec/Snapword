import { describe, expect, it, vi } from 'vitest';

/**
 * titlebar-overlay 的色值必须与 renderer 的 paseo 主题 token 同源：
 * light = Claude Light，dark = Paseo Dark（colorBgLayout / colorBgContainer / colorText）。
 * 换槽位或升级 paseo 时，本测试是原生层的同步哨兵。
 */
vi.mock('electron', () => ({
  nativeTheme: { shouldUseDarkColors: false },
}));

import { nativeTheme } from 'electron';
import {
  getTitleBarOverlayOptions,
  getWindowBackgroundColor,
} from '../../src/modules/window/titlebar-overlay';

const theme = nativeTheme as unknown as { shouldUseDarkColors: boolean };

describe('WCO / 窗口底色（paseo token 同源）', () => {
  it('light：画布用 colorBgLayout，overlay 用 colorBgContainer + colorText', () => {
    theme.shouldUseDarkColors = false;
    expect(getWindowBackgroundColor()).toBe('#F0EDE2');
    expect(getTitleBarOverlayOptions()).toEqual({
      color: '#F5F4EC',
      symbolColor: '#3C3C2C',
    });
  });

  it('dark：画布用 colorBgLayout，overlay 用 colorBgContainer + colorText', () => {
    theme.shouldUseDarkColors = true;
    expect(getWindowBackgroundColor()).toBe('#181B1A');
    expect(getTitleBarOverlayOptions()).toEqual({
      color: '#1E2120',
      symbolColor: '#FAFAFA',
    });
  });
});
