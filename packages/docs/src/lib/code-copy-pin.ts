const PRE_SELECTOR = 'pre.shiki';

let started = false;

/**
 * 复制/换行按钮是 <pre>（横向滚动容器）的绝对定位子元素，会随内容一起横向滚动。
 * 监听 <pre> 的 scroll，用 translateX(scrollLeft) 抵消内容位移，按钮固定在可视区右上角。
 * 单行代码块 Vocs 用 -translate-y-1/2 垂直居中，这里一并保留。
 */
function pin(pre: HTMLElement): void {
  const offset = pre.scrollLeft;
  for (const button of pre.querySelectorAll<HTMLElement>('button[data-single-line]')) {
    const vertical = button.dataset.singleLine === 'true' ? '-50%' : '0';
    button.style.transform = `translate(${offset}px, ${vertical})`;
  }
}

function pinAll(): void {
  for (const pre of document.querySelectorAll<HTMLElement>(PRE_SELECTOR)) pin(pre);
}

function setup(): void {
  for (const pre of document.querySelectorAll<HTMLElement>(PRE_SELECTOR)) {
    if (pre.dataset.codeCopyPinned === 'true') continue;
    pre.dataset.codeCopyPinned = 'true';
    pre.addEventListener('scroll', () => pin(pre), { passive: true });
    pin(pre);
  }
}

export function setupCodeCopyPin(): void {
  if (started || !document.body) return;
  started = true;
  setup();
  new MutationObserver(setup).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', pinAll);
}
