import type { PanzoomObject } from '@panzoom/panzoom';

type PanzoomModule = typeof import('@panzoom/panzoom');

const WRAP_SELECTOR = '[data-v-mermaid]';
const DIALOG_CLASS = 'mermaid-zoom-dialog';
const STAGE_CLASS = 'mermaid-zoom-stage';
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const EDGE_PADDING = 48;
// 内联预览按 10px 字缩放（mermaid 原始字号 16px）；对话框里仍按 100% / 16px 打开。
const INLINE_SCALE = 10 / 16;

let started = false;
let dialog: HTMLDialogElement | null = null;
let stage: HTMLElement | null = null;
let currentSvg: SVGSVGElement | null = null;
let panzoom: PanzoomObject | null = null;
let panzoomModule: Promise<PanzoomModule> | null = null;
let wheelHandler: ((event: WheelEvent) => void) | null = null;

function loadPanzoom(): Promise<PanzoomModule> {
  panzoomModule ??= import('@panzoom/panzoom');
  return panzoomModule;
}

function onDialogClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target === dialog) {
    dialog?.close();
    return;
  }
  const button = target.closest<HTMLButtonElement>('button[data-zoom]');
  if (!button) return;
  const action = button.dataset.zoom;
  if (action === 'close') dialog?.close();
  else if (action === 'fit') fitView();
  else if (action === 'reset') zoomTo100();
  else if (action === 'in') zoomBy(1.25);
  else if (action === 'out') zoomBy(0.8);
}

function onDialogKeyDown(event: KeyboardEvent): void {
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomBy(1.25);
  } else if (event.key === '-') {
    event.preventDefault();
    zoomBy(0.8);
  } else if (event.key === '0') {
    event.preventDefault();
    fitView();
  }
}

function onDialogClose(): void {
  document.documentElement.classList.remove('mermaid-zoom-open');
  if (stage && wheelHandler) stage.removeEventListener('wheel', wheelHandler);
  wheelHandler = null;
  panzoom?.destroy();
  panzoom = null;
  currentSvg = null;
  stage?.replaceChildren();
}

function ensureDialog(): void {
  if (dialog) return;
  dialog = document.createElement('dialog');
  dialog.className = DIALOG_CLASS;
  dialog.setAttribute('aria-label', '图表放大预览');
  dialog.innerHTML = [
    '<div class="mermaid-zoom-toolbar">',
    '<button type="button" data-zoom="fit">适应宽度</button>',
    '<button type="button" data-zoom="out" aria-label="缩小">−</button>',
    '<button type="button" data-zoom="reset" data-zoom-level title="恢复 100%">100%</button>',
    '<button type="button" data-zoom="in" aria-label="放大">+</button>',
    '<button type="button" data-zoom="close" aria-label="关闭">×</button>',
    '</div>',
    `<div class="${STAGE_CLASS}" data-v-mermaid></div>`,
  ].join('');
  document.body.append(dialog);
  stage = dialog.querySelector<HTMLElement>(`.${STAGE_CLASS}`);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('keydown', onDialogKeyDown);
  dialog.addEventListener('close', onDialogClose);
}

function naturalSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  return {
    width: viewBox.width || rect.width,
    height: viewBox.height || rect.height,
  };
}

function stageContentSize(): { width: number; height: number } | null {
  if (!stage) return null;
  const style = getComputedStyle(stage);
  const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  return { width: stage.clientWidth - padX, height: stage.clientHeight - padY };
}

function syncZoomLabel(): void {
  if (!panzoom || !dialog) return;
  const level = dialog.querySelector<HTMLElement>('[data-zoom-level]');
  if (level) level.textContent = `${Math.round(panzoom.getScale() * 100)}%`;
}

function fitView(): void {
  if (!panzoom || !currentSvg) return;
  const { width, height } = naturalSize(currentSvg);
  const stageSize = stageContentSize();
  if (!width || !height || !stageSize) return;
  const scale = Math.min(
    (stageSize.width - EDGE_PADDING) / width,
    (stageSize.height - EDGE_PADDING) / height,
    1,
  );
  // Panzoom 的 SVG transform-origin 实测是 50% 50%（不是文档说的 0 0）：
  // 缩放本身会把内容向右下挪 (1-s)*width/2，所以居中的本地位移要用完整宽高算，
  // 再除以 scale；用「已缩放宽高」会少算这一截，fit 后整体偏向右下。
  panzoom.setOptions({
    startScale: scale,
    startX: (stageSize.width - width) / (2 * scale),
    startY: (stageSize.height - height) / (2 * scale),
  });
  panzoom.reset({ animate: true });
  syncZoomLabel();
}

function zoomTo100(): void {
  if (!panzoom || !currentSvg) return;
  const { width, height } = naturalSize(currentSvg);
  const stageSize = stageContentSize();
  if (!stageSize) return;
  panzoom.setOptions({
    startScale: 1,
    startX: (stageSize.width - width) / 2,
    startY: (stageSize.height - height) / 2,
  });
  panzoom.reset({ animate: true });
  syncZoomLabel();
}

function zoomBy(factor: number): void {
  if (!panzoom || !stage) return;
  const rect = stage.getBoundingClientRect();
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, panzoom.getScale() * factor));
  panzoom.zoomToPoint(
    next,
    { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
    { animate: true },
  );
}

async function open(wrap: Element): Promise<void> {
  if (dialog?.open) return;
  const svg = wrap.querySelector('svg');
  if (!(svg instanceof SVGSVGElement)) return;
  const { width, height } = naturalSize(svg);
  if (!width || !height) return;

  ensureDialog();
  if (!dialog || !stage) return;

  currentSvg = svg.cloneNode(true) as SVGSVGElement;
  currentSvg.removeAttribute('height');
  currentSvg.style.width = `${width}px`;
  currentSvg.style.height = `${height}px`;
  currentSvg.style.maxWidth = 'none';
  stage.replaceChildren(currentSvg);
  if (!dialog.open) dialog.showModal();
  document.documentElement.classList.add('mermaid-zoom-open');

  let Panzoom: PanzoomModule['default'];
  try {
    Panzoom = (await loadPanzoom()).default;
  } catch {
    stage.style.overflow = 'auto';
    return;
  }
  if (!currentSvg || !stage) return;
  const stageSize = stageContentSize();
  if (!stageSize) return;

  panzoom?.destroy();
  panzoom = Panzoom(currentSvg, {
    canvas: true,
    cursor: 'grab',
    startScale: 1,
    startX: (stageSize.width - width) / 2,
    startY: (stageSize.height - height) / 2,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    touchAction: 'none',
  });
  currentSvg.addEventListener('panzoomzoom', syncZoomLabel);
  currentSvg.addEventListener('panzoomreset', syncZoomLabel);
  syncZoomLabel();
  wheelHandler = (event) => panzoom?.zoomWithWheel(event);
  stage.addEventListener('wheel', wheelHandler, { passive: false });
  requestAnimationFrame(() => {
    dialog?.querySelector<HTMLButtonElement>('button[data-zoom="close"]')?.focus();
  });
}

function updateScrollState(wrap: HTMLElement): void {
  const container = wrap.parentElement;
  if (!container?.hasAttribute('data-v-mermaid-container')) return;
  container.dataset.mermaidZoomable = 'true';
  const scrollable =
    wrap.scrollHeight > wrap.clientHeight + 2 || wrap.scrollWidth > wrap.clientWidth + 2;
  container.dataset.mermaidScrollable = scrollable ? 'true' : 'false';
}

function updateAllScrollStates(): void {
  for (const wrap of document.querySelectorAll<HTMLElement>(WRAP_SELECTOR)) {
    if (wrap.closest(`.${DIALOG_CLASS}`)) continue;
    updateScrollState(wrap);
  }
}

function decorate(): void {
  const wraps = document.querySelectorAll<HTMLElement>(WRAP_SELECTOR);
  for (const wrap of wraps) {
    if (wrap.closest(`.${DIALOG_CLASS}`)) continue;
    if (wrap.dataset.mermaidZoomReady === 'true') continue;
    const svg = wrap.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) continue;
    const { width } = naturalSize(svg);
    if (width) {
      // Vocs 给 svg 设 width=100%，只解 max-width 仍会被容器压扁；按 10px 字显式设宽。
      svg.style.width = `${width * INLINE_SCALE}px`;
      svg.style.maxWidth = 'none';
      svg.style.height = 'auto';
    }
    wrap.dataset.mermaidZoomReady = 'true';
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', '放大图表');
    wrap.title = '点击放大';
    requestAnimationFrame(() => updateScrollState(wrap));
  }
}

function onClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(`.${DIALOG_CLASS}`)) return;
  const wrap = target.closest(WRAP_SELECTOR);
  if (!wrap) return;
  void open(wrap).catch((error) => console.error('[mermaid-zoom] open failed', error));
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const wrap = target.closest(WRAP_SELECTOR);
  if (!wrap) return;
  event.preventDefault();
  void open(wrap).catch((error) => console.error('[mermaid-zoom] open failed', error));
}

export function setupMermaidZoom(): void {
  if (started || !document.body) return;
  started = true;
  decorate();
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', updateAllScrollStates);
}
