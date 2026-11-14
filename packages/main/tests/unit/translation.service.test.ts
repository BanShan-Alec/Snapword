import { ErrorCode } from '@app/shared/constants/error-codes';
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeBaseUrl,
  PUA_END,
  PUA_START,
  PuaTailBuffer,
  protectPlaceholders,
  resolveDelimiters,
  TranslationService,
} from '../../src/services/translation.service';

/**
 * 辅助函数：将字符串数组转为模拟的 SSE ReadableStream
 */
function createMockSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const sseLine = `data: ${JSON.stringify({
          choices: [{ delta: { content: chunk } }],
        })}\n\n`;
        controller.enqueue(encoder.encode(sseLine));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

describe('TranslationService - 契约与算法单元测试', () => {
  describe('Base URL 归一化', () => {
    it('正确处理不带斜杠、带斜杠与已包含 /chat/completions 的 URL', () => {
      expect(normalizeBaseUrl('https://token.sensenova.cn/v1')).toBe(
        'https://token.sensenova.cn/v1/chat/completions',
      );
      expect(normalizeBaseUrl('https://token.sensenova.cn/v1/')).toBe(
        'https://token.sensenova.cn/v1/chat/completions',
      );
      expect(normalizeBaseUrl('https://token.sensenova.cn/v1/chat/completions')).toBe(
        'https://token.sensenova.cn/v1/chat/completions',
      );
    });
  });

  describe('固定分隔符防注入引擎', () => {
    it('正常文本使用 Level 1 默认分隔符', () => {
      const delim = resolveDelimiters('hello world');
      expect(delim.textStart).toBe('<<<TEXT>>>');
      expect(delim.textEnd).toBe('<<<END>>>');
    });

    it('文本包含 <<<END>>> 时平滑升级到 Level 2 备用分隔符', () => {
      const delim = resolveDelimiters('Notice: <<<END>>> is here');
      expect(delim.textStart).toBe('<<<SNAPWORD_TEXT_2>>>');
      expect(delim.textEnd).toBe('<<<SNAPWORD_END_2>>>');
    });

    it('多级冲突全部命中时抛出 TRANSLATION_DELIMITER_CONFLICT', () => {
      const malicious = '<<<END>>><<<SNAPWORD_END_2>>><<<SNAPWORD_END_3>>>';
      expect(() => resolveDelimiters(malicious)).toThrowError();
    });
  });

  describe('PUA 占位符与 Tail Buffer 截断防护', () => {
    it('能够精确保护代码、URL、版本号与标识符', () => {
      const input =
        'Run `npm install` for v1.0.0 from https://github.com/app with --flag in useEffect';
      const { protectedText, mapping } = protectPlaceholders(input);

      expect(protectedText).toContain(`${PUA_START}0${PUA_END}`);
      expect(mapping.get(0)).toBe('`npm install`');
      expect(mapping.get(1)).toBe('v1.0.0');
      expect(mapping.get(2)).toBe('https://github.com/app');
      expect(mapping.get(3)).toBe('--flag');
      expect(mapping.get(4)).toBe('useEffect');
    });

    it('测试向量 #11：占位符被拆分到两个 SSE Chunk 时，Tail Buffer 能够阻断半截乱码输出', () => {
      const mapping = new Map<number, string>([[0, 'useEffect']]);
      const buffer = new PuaTailBuffer(mapping);

      // Chunk 1: 包含半截占位符
      const chunk1 = `使用 ${PUA_START}0`;
      const out1 = buffer.feed(chunk1);
      // 此时半截占位符被扣留在 carryBuffer 中，绝不向外派发乱码
      expect(out1).toBe('使用 ');

      // Chunk 2: 占位符闭合
      const chunk2 = `${PUA_END} 获取数据`;
      const out2 = buffer.feed(chunk2);
      // 闭合后立即还原为原文并输出
      expect(out2).toBe('useEffect 获取数据');

      // flush 此时为空
      expect(buffer.flush()).toBe('');
      expect(buffer.isMalformed()).toBe(false);
    });

    it('溢出保护：超过 16 字符仍未闭合时原样刷新，并标记 malformed', () => {
      const mapping = new Map<number, string>();
      const buffer = new PuaTailBuffer(mapping);

      // 输入一个开头的 PUA_START，后面跟着 18 个普通字符且没有 PUA_END
      const out = buffer.feed(`${PUA_START}12345678901234567`);
      expect(buffer.isMalformed()).toBe(true);
      expect(out).toContain('12345678901234567');
    });
  });

  describe('流式翻译管线端到端 Mock 验证', () => {
    it('单词模式：流式返回 JSON 并能正确解析音标与多义项', async () => {
      // 将 JSON 拆为多个流式分块
      const stream = createMockSseStream([
        '{"word": "inspect", ',
        '"phonetic_us": "ɪnˈspekt", ',
        '"phonetic_uk": "ɪnˈspekt", ',
        '"context_sense": "检查", ',
        '"context_snippet": "inspect the logs", ',
        '"senses": [{"pos": "v.", "def": "检查；视察", "example": "Inspect the code carefully."}]}',
      ]);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      });

      const service = new TranslationService({ fetchFn: mockFetch });
      const chunks: string[] = [];

      const result = await service.translate(
        { mode: 'word', text: 'inspect', context: 'Please inspect the logs' },
        { onChunk: (c) => chunks.push(c) },
      );

      expect(result.mode).toBe('word');
      if (result.mode === 'word') {
        expect(result.data.word).toBe('inspect');
        expect(result.data.phonetic_us).toBe('ɪnˈspekt');
        expect(result.data.senses).toHaveLength(1);
        expect(result.data.senses[0].def).toBe('检查；视察');
      }
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('单词模式：遇 400 不支持 json_schema 自动降级重试', async () => {
      const mockJson = JSON.stringify({
        word: 'test',
        phonetic_us: 'test',
        phonetic_uk: null,
        context_sense: null,
        context_snippet: null,
        senses: [{ pos: 'n.', def: '测试', example: 'This is a test.' }],
      });

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        callCount++;
        const body = JSON.parse(init.body as string);
        if (callCount === 1) {
          // 首次包含 response_format，模拟 400 报错
          expect(body.response_format).toBeDefined();
          return Promise.resolve({
            ok: false,
            status: 400,
            text: async () => 'Unsupported parameter: response_format',
          });
        }
        // 第二次重试已去掉 response_format
        expect(body.response_format).toBeUndefined();
        return Promise.resolve({
          ok: true,
          status: 200,
          body: createMockSseStream([mockJson]),
        });
      });

      const service = new TranslationService({ fetchFn: mockFetch });
      const result = await service.translate({ mode: 'word', text: 'test' });

      expect(callCount).toBe(2);
      expect(result.mode).toBe('word');
      if (result.mode === 'word') {
        expect(result.data.word).toBe('test');
        expect(result.data.senses[0].def).toBe('测试');
      }
    });

    it('句子模式：流式派发并还原 PUA 占位符', async () => {
      const stream = createMockSseStream(['使用 ', `${PUA_START}0`, `${PUA_END} 来获取`, '数据。']);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      });

      const service = new TranslationService({ fetchFn: mockFetch });
      const receivedChunks: string[] = [];

      const result = await service.translate(
        { mode: 'sentence', text: 'Use useEffect to fetch data.' },
        { onChunk: (c) => receivedChunks.push(c) },
      );

      expect(result.mode).toBe('sentence');
      if (result.mode === 'sentence') {
        expect(result.data.text).toBe('使用 useEffect 来获取数据。');
      }
      // 验证收到的分块完全不包含半截 \uE000
      for (const c of receivedChunks) {
        expect(c).not.toMatch(/\uE000(?!\d+\uE001)/);
      }
    });

    it('支持 AbortSignal 主动取消流式翻译', async () => {
      const controller = new AbortController();

      const mockFetch = vi.fn().mockImplementation((_url, _init) => {
        // 模拟外部信号触发 abort
        controller.abort();
        return Promise.reject(new Error('ABORTED'));
      });

      const service = new TranslationService({ fetchFn: mockFetch });

      await expect(
        service.translate({ mode: 'sentence', text: 'Hello world' }, { signal: controller.signal }),
      ).rejects.toMatchObject({
        code: ErrorCode.TRANSLATION_ABORTED,
      });
    });
  });
});
