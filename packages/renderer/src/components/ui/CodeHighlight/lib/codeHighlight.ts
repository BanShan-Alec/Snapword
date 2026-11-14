// 私有常量与类型
export type HighlightTokenType =
  | 'hl-comment'
  | 'hl-string'
  | 'hl-builtin'
  | 'hl-keyword'
  | 'hl-boolean'
  | 'hl-number'
  | 'hl-type'
  | 'hl-function';

const ALL_HIGHLIGHT_TOKENS: readonly HighlightTokenType[] = [
  'hl-comment',
  'hl-string',
  'hl-builtin',
  'hl-keyword',
  'hl-boolean',
  'hl-number',
  'hl-type',
  'hl-function',
] as const;

export interface TokenSpan {
  type: HighlightTokenType;
  start: number;
  end: number;
}

// 语法分析正则：按优先级匹配 注释 -> 字符串 -> 内置对象 -> 关键字 -> 布尔值/空值 -> 数字 -> 类型/类名 -> 函数调用
const TOKEN_REGEX = new RegExp(
  [
    // 1. Comments: //... or /*...*/
    '(?<comment>//.*|/\\*[\\s\\S]*?\\*/)',
    // 2. Strings: "...", '...', `...`
    '(?<string>"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)',
    // 3. Builtins (console, window, api, process, document)
    '\\b(?<builtin>console|window|api|process|document)\\b',
    // 4. Keywords
    '\\b(?<keyword>import|export|from|type|as|const|let|var|function|return|throw|new|if|else|switch|case|default|for|while|do|try|catch|finally|await|async|class|extends|implements|interface|private|protected|public|static|yield|typeof|instanceof|void|delete|in|of)\\b',
    // 5. Booleans and nullish
    '\\b(?<boolean>true|false|null|undefined)\\b',
    // 6. Numbers
    '\\b(?<number>\\d+(?:\\.\\d+)?)\\b',
    // 7. Types/Classes (首字母大写的标识符)
    '\\b(?<type>[A-Z][a-zA-Z0-9_]*)\\b',
    // 8. Functions/methods (后接小括号的方法名)
    '\\b(?<function>[a-zA-Z_$][a-zA-Z0-9_$]*)(?=\\s*\\()',
  ].join('|'),
  'g',
);

// 可抽离的逻辑处理函数
export function tokenizeCode(code: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = TOKEN_REGEX.exec(code);

  while (match !== null) {
    const groups = match.groups;
    if (groups) {
      const matchIndex = match.index;
      for (const [key, val] of Object.entries(groups)) {
        if (val !== undefined) {
          tokens.push({
            type: `hl-${key}` as HighlightTokenType,
            start: matchIndex,
            end: matchIndex + val.length,
          });
          break;
        }
      }
    }
    match = TOKEN_REGEX.exec(code);
  }

  return tokens;
}

export function createRangesFromTokens(
  root: Node,
  tokens: TokenSpan[],
): Map<HighlightTokenType, Range[]> {
  const result = new Map<HighlightTokenType, Range[]>();

  if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
    return result;
  }

  // 收集根节点下的所有 Text 节点
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode() as Text | null;
  while (textNode) {
    textNodes.push(textNode);
    textNode = walker.nextNode() as Text | null;
  }

  if (textNodes.length === 0) {
    return result;
  }

  // 预计算每个文本节点的累计起始和结束偏移量
  const nodeOffsets: { node: Text; start: number; end: number }[] = [];
  let currentOffset = 0;
  for (const node of textNodes) {
    const length = node.textContent?.length ?? 0;
    nodeOffsets.push({
      node,
      start: currentOffset,
      end: currentOffset + length,
    });
    currentOffset += length;
  }

  const findNodeAndOffset = (offset: number): { node: Text; offset: number } | null => {
    for (const item of nodeOffsets) {
      if (offset >= item.start && offset <= item.end) {
        return { node: item.node, offset: offset - item.start };
      }
    }
    return null;
  };

  for (const token of tokens) {
    const startPos = findNodeAndOffset(token.start);
    const endPos = findNodeAndOffset(token.end);

    if (startPos && endPos) {
      try {
        const range = new Range();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);

        const list = result.get(token.type);
        if (list) {
          list.push(range);
        } else {
          result.set(token.type, [range]);
        }
      } catch {
        // 忽略折叠或跨界非法 Range
      }
    }
  }

  return result;
}

type RangeProvider = () => Map<HighlightTokenType, Range[]>;

// 多实例协调调度中心（Debounce 批量同步至全局 CSS.highlights）
class HighlightManager {
  private providers = new Set<RangeProvider>();
  private scheduled = false;

  register(provider: RangeProvider): () => void {
    this.providers.add(provider);
    this.scheduleUpdate();

    return () => {
      this.providers.delete(provider);
      this.scheduleUpdate();
    };
  }

  scheduleUpdate(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.sync();
    });
  }

  private sync(): void {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
      return;
    }

    const merged = new Map<HighlightTokenType, Range[]>();

    for (const provider of this.providers) {
      const rangesMap = provider();
      for (const [token, ranges] of rangesMap.entries()) {
        const existing = merged.get(token);
        if (existing) {
          existing.push(...ranges);
        } else {
          merged.set(token, [...ranges]);
        }
      }
    }

    for (const token of ALL_HIGHLIGHT_TOKENS) {
      const ranges = merged.get(token);
      if (ranges && ranges.length > 0) {
        CSS.highlights.set(token, new Highlight(...ranges));
      } else {
        CSS.highlights.delete(token);
      }
    }
  }
}

export const highlightManager = new HighlightManager();
