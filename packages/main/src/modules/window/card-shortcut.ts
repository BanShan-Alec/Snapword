/**
 * 语言与选区文本校验调度器 (FR-11, RC-09, IA-23/24)
 */

export function isEnglishText(text: string, minRatio = 0.3): boolean {
  if (!text) return false;
  const nonWhitespace = text.replace(/\s+/g, '');
  if (nonWhitespace.length === 0) return false;
  const englishChars = text.match(/[a-zA-Z]/g) || [];
  return englishChars.length / nonWhitespace.length >= minRatio;
}

export interface SelectionDispatchResult {
  action: 'notice' | 'translate';
  notice?: string;
  mode?: 'word' | 'sentence';
}

export function resolveSelectionDispatch(
  text: string | null | undefined,
  minRatio = 0.3,
): SelectionDispatchResult {
  if (!text?.trim()) {
    return {
      action: 'notice',
      notice: '未获取到选中文本',
    };
  }

  const trimmed = text.trim();

  if (!isEnglishText(trimmed, minRatio)) {
    return {
      action: 'notice',
      notice: '当前仅支持英文翻译',
    };
  }

  if (trimmed.length > 20000) {
    return {
      action: 'notice',
      notice: `已选 ${trimmed.length.toLocaleString()} 字，超过 20,000 上限`,
    };
  }

  const isWord = trimmed.length <= 120 && /^[a-zA-Z]+(?:-[a-zA-Z]+)*$/.test(trimmed);

  return {
    action: 'translate',
    mode: isWord ? 'word' : 'sentence',
  };
}
