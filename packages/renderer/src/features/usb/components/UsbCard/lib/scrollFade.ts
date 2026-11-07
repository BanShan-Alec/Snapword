export interface ScrollFadeState {
  topOpacity: number;
  bottomOpacity: number;
}

// 渐隐生效的距离（px）：距边界进入该范围后透明度线性过渡到 0
const SCROLL_FADE_DISTANCE_PX = 80;

// 可滚动量的判定下限（px）：忽略子像素舍入造成的 0.x px 假溢出
const MIN_SCROLL_OVERFLOW_PX = 1;

export function getScrollFadeOpacity(distanceFromEdge: number, fadeDistance: number): number {
  return Math.max(0, Math.min(1, distanceFromEdge / fadeDistance));
}

export function getScrollFadeState({
  scrollTop,
  clientHeight,
  scrollHeight,
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): ScrollFadeState {
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const hasOverflow = maxScrollTop > MIN_SCROLL_OVERFLOW_PX;

  return {
    topOpacity: hasOverflow ? getScrollFadeOpacity(scrollTop, SCROLL_FADE_DISTANCE_PX) : 0,
    bottomOpacity: hasOverflow
      ? getScrollFadeOpacity(maxScrollTop - scrollTop, SCROLL_FADE_DISTANCE_PX)
      : 0,
  };
}
