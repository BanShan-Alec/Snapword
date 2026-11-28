import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capturedButtons = vi.hoisted(() => [] as Array<{ children?: unknown; onClick?: () => void }>);

const hookState = vi.hoisted(() => ({
  value: {
    action: 'translate' as 'idle' | 'notice' | 'translate',
    notice: null as string | null,
    text: 'ephemeral',
    context: 'Ephemeral state disappears after reload.',
    mode: 'word' as 'word' | 'sentence',
    isLoading: false,
    isSlow: false,
    streamingText: '',
    wordResult: {
      word: 'ephemeral',
      phonetic_us: 'ɪˈfɛmərəl',
      phonetic_uk: 'ɪˈfɛmərəl',
      context_sense: '短暂的；瞬息的',
      context_snippet: 'Ephemeral state disappears after reload.',
      senses: [
        { pos: 'adj.', def: '短暂的，转瞬即逝的', example: 'Fame in the tech world is ephemeral.' },
      ],
    } as {
      word: string;
      phonetic_us?: string;
      phonetic_uk?: string;
      context_sense: string;
      context_snippet?: string;
      senses: Array<{ pos: string; def: string; example?: string }>;
    } | null,
    sentenceResult: null as { text: string } | null,
    error: null as string | null,
    isStopped: false,
    isPinned: false,
    isFavorite: false,
    triggerTranslate: vi.fn(),
    stopTranslation: vi.fn(),
    retry: vi.fn(),
    togglePin: vi.fn(),
    hideCard: vi.fn(),
    openInHome: vi.fn(),
    toggleFavorite: vi.fn(),
    saveFavorite: vi.fn(),
  },
}));

vi.mock('@/features/card/hooks/useCardTranslation', () => ({
  useCardTranslation: () => hookState.value,
}));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  const OriginalButton = actual.Button;
  const SpyButton = (props: Record<string, unknown>) => {
    capturedButtons.push({
      children: props.children,
      onClick: props.onClick as (() => void) | undefined,
    });
    return createElement(OriginalButton, props);
  };
  return {
    ...actual,
    Button: SpyButton,
  };
});

import { CardFeature } from '@/features/card';
import { CardBottomBar } from '@/features/card/components/CardBottomBar';
import { CardHeader } from '@/features/card/components/CardHeader';

const cardEntryHtml = readFileSync(
  fileURLToPath(new URL('../../src/entries/card/index.html', import.meta.url)),
  'utf8',
);

const cardFeatureSource = readFileSync(
  fileURLToPath(new URL('../../src/features/card/index.tsx', import.meta.url)),
  'utf8',
);

describe('Card Fixed Viewport UI Seam (400x280 / ADR-0006)', () => {
  beforeEach(() => {
    capturedButtons.length = 0;
    hookState.value.action = 'translate';
    hookState.value.mode = 'word';
    hookState.value.text = 'ephemeral';
    hookState.value.isLoading = false;
    hookState.value.streamingText = '';
    hookState.value.sentenceResult = null;
    hookState.value.error = null;
    hookState.value.openInHome.mockReset();
  });

  it('根容器使用 w-screen h-screen 铺满原生窗口视口，无外层呼吸内边距或自绘阴影类', () => {
    const html = renderToStaticMarkup(createElement(CardFeature));

    expect(html).toContain('w-screen');
    expect(html).toContain('h-screen');
    expect(html).not.toContain('w-[452px]');
    expect(html).not.toContain('w-[420px]');
    expect(html).not.toContain('floating-card-shadow');
    expect(html).not.toContain('p-4 bg-transparent');
    expect(cardEntryHtml).not.toContain('bg-transparent');
    expect(cardFeatureSource).not.toContain('ResizeObserver(() =>');
    expect(cardFeatureSource).not.toContain('card.resize');
  });

  it('短单词模式下正常渲染音标、语境义与义项', () => {
    const html = renderToStaticMarkup(createElement(CardFeature));

    expect(html).toContain('ephemeral');
    expect(html).toContain('短暂的；瞬息的');
    expect(html).toContain('短暂的，转瞬即逝的');
    expect(html).toContain('在主窗口展开');
  });

  it('未获取到选中文本提示态下支持在固定视口内垂直居中', () => {
    hookState.value.action = 'notice';
    hookState.value.notice = '未获取到选中文本';
    hookState.value.text = '';
    hookState.value.wordResult = null;

    const html = renderToStaticMarkup(createElement(CardFeature));

    expect(html).toContain('未获取到选中文本');
    expect(html).toContain('min-h-full');
    expect(html).toContain('flex-1');
    expect(html).toContain('justify-center');
  });

  it('长句/流式翻译模式下挂载滚动容器与底部淡出遮罩', () => {
    hookState.value.mode = 'sentence';
    hookState.value.wordResult = null;
    hookState.value.text = 'Long paragraph input for scrolling test.';
    hookState.value.streamingText = '第一段译文。\n'.repeat(12);

    const html = renderToStaticMarkup(createElement(CardFeature));

    expect(html).toContain('overflow-y-auto');
    expect(html).toContain('usb-scroll-fade');
    expect(html).toContain('usb-scroll-fade-bottom');
    expect(html).toContain('在主窗口展开');
  });

  it('点击底部栏「在主窗口展开」按钮或双击头部非控件区时触发 openInHome', () => {
    const openInHomeSpy = vi.fn();

    renderToStaticMarkup(
      createElement(CardBottomBar, {
        mode: 'sentence',
        contentToCopy: 'demo',
        isLoading: false,
        isStopped: false,
        isFavorite: false,
        isOverflowing: true,
        onStop: vi.fn(),
        onRetry: vi.fn(),
        onToggleFavorite: vi.fn(),
        onOpenInHome: openInHomeSpy,
      }),
    );

    const expandButton = capturedButtons.find((btn) => btn.children === '在主窗口展开');
    expect(expandButton).toBeDefined();
    expandButton?.onClick?.();
    expect(openInHomeSpy).toHaveBeenCalledTimes(1);

    // 验证头部双击非按钮区域触发 openInHome
    const headerEl = CardHeader({
      mode: 'word',
      isPinned: false,
      onTogglePin: vi.fn(),
      onClose: vi.fn(),
      onOpenInHome: openInHomeSpy,
    }) as React.ReactElement<{ onDoubleClick?: (e: unknown) => void }>;

    headerEl.props.onDoubleClick?.({
      target: { closest: () => null },
    });
    expect(openInHomeSpy).toHaveBeenCalledTimes(2);

    // 双击按钮内部不应误触发 openInHome
    headerEl.props.onDoubleClick?.({
      target: { closest: () => ({}) },
    });
    expect(openInHomeSpy).toHaveBeenCalledTimes(2);
  });
});
