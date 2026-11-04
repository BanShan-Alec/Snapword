import { RENDERER_LINE_MAX_LENGTH } from '@app/main/constants/logging';
import { truncateRenderedLine } from '@app/main/modules/log.module';
import { describe, expect, it } from 'vitest';

describe('truncateRenderedLine', () => {
  it('should keep short lines unchanged', () => {
    expect(truncateRenderedLine('[Renderer] [home] hello')).toBe('[Renderer] [home] hello');
  });

  it('should keep a line at exactly the max length unchanged', () => {
    const line = 'x'.repeat(RENDERER_LINE_MAX_LENGTH);
    expect(truncateRenderedLine(line)).toBe(line);
  });

  it('should truncate over-long lines and keep the total length within max', () => {
    const line = 'x'.repeat(2500);
    const result = truncateRenderedLine(line);
    const suffix = ' [truncated 500 chars]';

    expect(result).toContain(`[truncated ${500} chars]`);
    expect(result.length).toBe(RENDERER_LINE_MAX_LENGTH);
    expect(result.endsWith(suffix)).toBe(true);
    expect(result.startsWith('x'.repeat(RENDERER_LINE_MAX_LENGTH - suffix.length))).toBe(true);
  });

  it('should bound the result even when the marker exceeds the custom max', () => {
    const result = truncateRenderedLine('abcdef', 3);
    expect(result.length).toBe(3);
  });
});
