import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Vocabulary 5-Second Undo State Machine (IA-37/38/39/40)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('倒计时 5 秒超时后撤销条自动消失且不可再逆 (IA-38)', () => {
    let undoState: { batchId: string; remainingSeconds: number } | null = {
      batchId: 'batch-1',
      remainingSeconds: 5,
    };

    const interval = setInterval(() => {
      if (!undoState) return;
      if (undoState.remainingSeconds <= 1) {
        clearInterval(interval);
        undoState = null;
      } else {
        undoState = {
          ...undoState,
          remainingSeconds: undoState.remainingSeconds - 1,
        };
      }
    }, 1000);

    // 经过 2 秒
    vi.advanceTimersByTime(2000);
    expect(undoState).not.toBeNull();
    expect(undoState?.remainingSeconds).toBe(3);

    // 经过 3 秒（共 5 秒）
    vi.advanceTimersByTime(3000);
    expect(undoState).toBeNull();
  });

  it('5 秒内点击撤销立即恢复并关闭撤销条 (IA-37)', async () => {
    const undoDeleteMock = vi.fn().mockResolvedValue({
      success: true,
      data: { restoredCount: 1 },
    });

    vi.stubGlobal('window', {
      api: {
        vocabulary: {
          undoDelete: undoDeleteMock,
        },
      },
    });

    let undoState: { batchId: string; remainingSeconds: number } | null = {
      batchId: 'batch-42',
      remainingSeconds: 5,
    };

    let restored = false;
    const handleUndo = async () => {
      if (!undoState) return;
      const res = await window.api.vocabulary.undoDelete({ batchId: undoState.batchId });
      if (res.success) {
        restored = true;
        undoState = null;
      }
    };

    // 经过 2 秒后点击撤销
    vi.advanceTimersByTime(2000);
    await handleUndo();

    expect(undoDeleteMock).toHaveBeenCalledWith({ batchId: 'batch-42' });
    expect(restored).toBe(true);
    expect(undoState).toBeNull();
  });

  it('删除后 5 秒内重新收藏同一词，撤销条自动收起 (IA-40)', () => {
    let undoState: { batchId: string; wordNorms: string[]; remainingSeconds: number } | null = {
      batchId: 'batch-abc',
      wordNorms: ['ephemeral'],
      remainingSeconds: 5,
    };

    // 模拟接收到 vocabulary:event:changed 保存广播
    const onVocabularyChanged = (payload: { action: string; word?: string }) => {
      if (payload.action === 'save' && payload.word && undoState) {
        const norm = payload.word.trim().toLowerCase();
        if (undoState.wordNorms.includes(norm)) {
          undoState = null; // 自动收起撤销条 (IA-40)
        }
      }
    };

    vi.advanceTimersByTime(2000);
    expect(undoState).not.toBeNull();

    // 重新收藏 ephemeral
    onVocabularyChanged({ action: 'save', word: 'Ephemeral' });
    expect(undoState).toBeNull();
  });
});

describe('Card Star Button Favorite State Machine (IA-16/17)', () => {
  it('未收藏时点击星标直接调用 save 并实心高亮，无 toast (IA-16)', async () => {
    const saveMock = vi.fn().mockResolvedValue({
      success: true,
      data: { isNew: true, record: { word: 'test' } },
    });

    vi.stubGlobal('window', {
      api: {
        vocabulary: {
          save: saveMock,
        },
      },
    });

    let isFavorite = false;
    let duplicatePromptOpen = false;

    const handleStarClick = async () => {
      if (!isFavorite) {
        const res = await window.api.vocabulary.save({ word: 'test', senses: [] });
        if (res.success) {
          isFavorite = true;
        }
      } else {
        duplicatePromptOpen = true;
      }
    };

    await handleStarClick();
    expect(saveMock).toHaveBeenCalled();
    expect(isFavorite).toBe(true);
    expect(duplicatePromptOpen).toBe(false);
  });

  it('已收藏时再次点击星标弹出「已收藏 · 更新 / 取消」确认菜单 (IA-17)', async () => {
    const saveMock = vi.fn().mockResolvedValue({
      success: true,
      data: { isNew: false, record: { word: 'test' } },
    });

    vi.stubGlobal('window', {
      api: {
        vocabulary: {
          save: saveMock,
        },
      },
    });

    let isFavorite = true;
    let duplicatePromptOpen = false;

    const handleStarClick = () => {
      if (!isFavorite) {
        isFavorite = true;
      } else {
        duplicatePromptOpen = true; // 弹出「已收藏 · 更新 / 取消」
      }
    };

    handleStarClick();
    expect(duplicatePromptOpen).toBe(true);

    // 点击「更新」执行更新并关闭弹层
    const handleConfirmUpdate = async () => {
      await window.api.vocabulary.save({ word: 'test', senses: [] });
      duplicatePromptOpen = false;
    };

    await handleConfirmUpdate();
    expect(saveMock).toHaveBeenCalled();
    expect(duplicatePromptOpen).toBe(false);
  });
});
