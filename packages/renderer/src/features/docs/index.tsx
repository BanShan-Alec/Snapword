import { DocsView } from './components/DocsView';
import { useDocsFrame } from './hooks/useDocsFrame';

/**
 * 文档站域入口：全出血 iframe + 加载/超时遮罩。
 * 挂载与 keep-alive 由 App 壳层负责，本域只关心 iframe 自身的加载状态。
 */
function DocsFeature() {
  const { status, reloadKey, handleLoad, handleRetry, handleOpenExternal } = useDocsFrame();

  return (
    <DocsView
      status={status}
      reloadKey={reloadKey}
      onLoad={handleLoad}
      onRetry={handleRetry}
      onOpenExternal={handleOpenExternal}
    />
  );
}

export { DocsFeature };
