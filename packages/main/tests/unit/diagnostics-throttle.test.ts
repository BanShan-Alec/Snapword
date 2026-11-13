import { createRenderLogThrottle } from '@app/main/services/diagnostics.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createRenderLogThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // 恢复真实 timer 前清掉残留定时器，避免跨用例回调继续触发
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should admit up to the limit within the window and drop the rest', () => {
    const onAggregate = vi.fn();
    const allow = createRenderLogThrottle(onAggregate, { limit: 3, windowMs: 1000 });

    const results = Array.from({ length: 6 }, () => allow('wc#1'));

    expect(results).toEqual([true, true, true, false, false, false]);
    expect(onAggregate).not.toHaveBeenCalled();
  });

  it('should emit exactly one aggregate warning after the window slides', () => {
    const onAggregate = vi.fn();
    const allow = createRenderLogThrottle(onAggregate, { limit: 2, windowMs: 1000 });

    allow('wc#1');
    allow('wc#1');
    allow('wc#1'); // dropped
    allow('wc#1'); // dropped
    vi.advanceTimersByTime(1000);

    expect(onAggregate).toHaveBeenCalledTimes(1);
    expect(onAggregate).toHaveBeenCalledWith('wc#1', 2);
  });

  it('should recover after the window slides without explicit reset', () => {
    const onAggregate = vi.fn();
    const allow = createRenderLogThrottle(onAggregate, { limit: 2, windowMs: 1000 });

    allow('wc#1');
    allow('wc#1');
    expect(allow('wc#1')).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(allow('wc#1')).toBe(true);
    expect(allow('wc#1')).toBe(true);
  });

  it('should keep independent windows per key', () => {
    const onAggregate = vi.fn();
    const allow = createRenderLogThrottle(onAggregate, { limit: 1, windowMs: 1000 });

    expect(allow('wc#1')).toBe(true);
    expect(allow('wc#2')).toBe(true);
    expect(allow('wc#1')).toBe(false);
    expect(allow('wc#2')).toBe(false);
  });
});
