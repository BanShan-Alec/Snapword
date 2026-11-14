import { describe, expect, it } from 'vitest';
import { isEnglishText, resolveSelectionDispatch } from '../../src/modules/window/card-shortcut';

describe('card-shortcut 快捷键与选区文本校验调度 (FR-11, IA-23/24)', () => {
  describe('isEnglishText 英文占比判定', () => {
    it('纯英文单字与句子返回 true', () => {
      expect(isEnglishText('hello')).toBe(true);
      expect(isEnglishText('The quick brown fox jumps over the lazy dog.')).toBe(true);
    });

    it('中英混排中英文占比 >= 30% 返回 true', () => {
      // 英文 13 字符，中文 4 字符，占比 13 / 17 = 76%
      expect(isEnglishText('React 框架非常好用')).toBe(true);
    });

    it('英文占比 < 30% 返回 false', () => {
      // 纯中文无英文字母
      expect(isEnglishText('这是一个纯中文段落')).toBe(false);
      // 中文 10 字，英文 1 字母 (1 / 11 = 9%)
      expect(isEnglishText('今天天气真不错啊 a')).toBe(false);
    });

    it('空字符串或纯空白返回 false', () => {
      expect(isEnglishText('')).toBe(false);
      expect(isEnglishText('   \n\t  ')).toBe(false);
    });
  });

  describe('resolveSelectionDispatch 调度分发裁决', () => {
    it('选区为空时返回内联提示「未获取到选中文本」，不发网络请求', () => {
      const res = resolveSelectionDispatch('');
      expect(res.action).toBe('notice');
      expect(res.notice).toBe('未获取到选中文本');
    });

    it('非英文文本返回「当前仅支持英文翻译」，不发网络请求', () => {
      const res = resolveSelectionDispatch('这是一段测试中文');
      expect(res.action).toBe('notice');
      expect(res.notice).toBe('当前仅支持英文翻译');
    });

    it('超过 20,000 字符返回超限提示', () => {
      const longText = 'a'.repeat(20001);
      const res = resolveSelectionDispatch(longText);
      expect(res.action).toBe('notice');
      expect(res.notice).toContain('超过 20,000 上限');
    });

    it('英文单词判定为 word 模式', () => {
      const res = resolveSelectionDispatch('pipeline');
      expect(res.action).toBe('translate');
      expect(res.mode).toBe('word');

      const hyphenWord = resolveSelectionDispatch('state-of-the-art');
      expect(hyphenWord.action).toBe('translate');
      expect(hyphenWord.mode).toBe('word');
    });

    it('英文句子或多词短语判定为 sentence 模式', () => {
      const res = resolveSelectionDispatch('Hello world, this is a sentence.');
      expect(res.action).toBe('translate');
      expect(res.mode).toBe('sentence');
    });
  });
});
