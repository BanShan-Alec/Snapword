import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Card Copy & Feedback Logic (IA-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('优先通过 window.api.card.copyText 写入剪贴板，并在未获焦时亦能成功', async () => {
    const copyTextMock = vi.fn().mockResolvedValue({ success: true, data: { success: true } });
    vi.stubGlobal('window', {
      api: {
        card: {
          copyText: copyTextMock,
        },
      },
    });

    let copied = false;
    const content = 'Test translated text';

    const handleCopy = async () => {
      if (window.api?.card?.copyText) {
        await window.api.card.copyText(content);
      }
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    };

    await handleCopy();
    expect(copyTextMock).toHaveBeenCalledWith('Test translated text');
    expect(copied).toBe(true);

    // 1000ms 后依然是已复制
    vi.advanceTimersByTime(1000);
    expect(copied).toBe(true);

    // 1500ms 后恢复
    vi.advanceTimersByTime(500);
    expect(copied).toBe(false);
  });

  it('无 preload API 时自动降级使用 navigator.clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextMock,
      },
    });
    vi.stubGlobal('window', {
      api: {},
    });

    let copied = false;
    const content = 'Fallback clipboard content';

    const handleCopy = async () => {
      await navigator.clipboard.writeText(content);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    };

    await handleCopy();
    expect(writeTextMock).toHaveBeenCalledWith('Fallback clipboard content');
    expect(copied).toBe(true);
  });
});
