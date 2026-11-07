import { describe, expect, it } from 'vitest';
import {
  getScrollFadeOpacity,
  getScrollFadeState,
} from '../../src/features/usb/components/UsbCard/lib/scrollFade';

describe('USB scroll fades', () => {
  it('hides both fades when the list fits', () => {
    expect(getScrollFadeState({ scrollTop: 0, clientHeight: 100, scrollHeight: 100 })).toEqual({
      topOpacity: 0,
      bottomOpacity: 0,
    });
  });

  it('fades edges progressively within the fade distance', () => {
    expect(getScrollFadeOpacity(0, 100)).toBe(0);
    expect(getScrollFadeOpacity(50, 100)).toBe(0.5);
    expect(getScrollFadeOpacity(100, 100)).toBe(1);
  });

  it('shows only the directions with remaining content', () => {
    expect(getScrollFadeState({ scrollTop: 0, clientHeight: 100, scrollHeight: 300 })).toEqual({
      topOpacity: 0,
      bottomOpacity: 1,
    });
    expect(getScrollFadeState({ scrollTop: 100, clientHeight: 100, scrollHeight: 300 })).toEqual({
      topOpacity: 1,
      bottomOpacity: 1,
    });
    expect(getScrollFadeState({ scrollTop: 200, clientHeight: 100, scrollHeight: 300 })).toEqual({
      topOpacity: 1,
      bottomOpacity: 0,
    });
  });
});
