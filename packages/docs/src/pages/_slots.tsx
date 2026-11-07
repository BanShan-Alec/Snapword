import { useEffect } from 'react';
import { Link } from 'vocs';

// Mermaid 放大：模块与 Panzoom 都按需加载（Panzoom 在第一次打开图时才 import），
// 不增加首屏体积；data 标记不再需要，setup 内部自带幂等保护。
function MermaidZoomLoader() {
  useEffect(() => {
    let cancelled = false;
    void import('../lib/mermaid-zoom')
      .then(({ setupMermaidZoom }) => {
        if (!cancelled) setupMermaidZoom();
      })
      .catch((error) => {
        console.error('[mermaid-zoom] setup failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

// 代码块复制按钮：抵消横向滚动位移，固定在可视区右上角。
function CodeCopyPinLoader() {
  useEffect(() => {
    let cancelled = false;
    void import('../lib/code-copy-pin')
      .then(({ setupCodeCopyPin }) => {
        if (!cancelled) setupCodeCopyPin();
      })
      .catch((error) => {
        console.error('[code-copy-pin] setup failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

// 侧栏顶部品牌位：Vocs 的 Logo 组件配了 logoUrl 后只渲染图不渲染 title 文字，
// 「图 + 品牌名同一行」的组合靠本 slot 补齐（导航栏 gutter 的纯图标此时会与之重叠，
// 故 vocs.config.ts 不配 logoUrl，导航栏品牌完全由这里承担）。
export function SidebarHeader() {
  return (
    <>
      <MermaidZoomLoader />
      <CodeCopyPinLoader />
      <Link to="/" className="flex items-center gap-2 no-underline py-1">
        <img
          src="/electron-react-monorepo-template/icon.png"
          alt="Electron React Template"
          className="h-6 w-6"
        />
        <span
          style={{ lineHeight: '1.1' }}
          className="text-[14px] font-bold text-heading tracking-tight"
        >
          Electron React Template
          <br />
          <span className="text-[10px] font-medium text-muted">解法合集</span>
        </span>
      </Link>
    </>
  );
}
