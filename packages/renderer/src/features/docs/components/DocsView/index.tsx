import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { PROJECT_DOCS_URL } from '@shared/constants/docs';
import { Button, Empty, Spin } from 'antd';
import { clsx } from 'clsx';
import { memo } from 'react';
import type { DocsFrameStatus } from '../../types';

const _DocsView = (props: DocsViewProps) => {
  useLingui();

  // ① 变量声明、解构
  const { status, reloadKey, onLoad, onRetry, onOpenExternal } = props;
  const isReady = status === 'ready';

  // ② 组件状态

  // ③ 网络IO

  // ④ 数据转换

  // ⑤ 逻辑处理函数

  // ⑥ 组件Effect

  // ⑦ 组件渲染
  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <iframe
        key={reloadKey}
        src={PROJECT_DOCS_URL}
        title={t`项目文档站`}
        className="absolute inset-0 h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        allow="clipboard-write"
        onLoad={onLoad}
      />

      {/* 不透明遮罩：挡住 iframe 首帧白闪；ready 后淡出并放行交互 */}
      <div
        aria-hidden={isReady}
        className={clsx(
          'absolute inset-0 z-10 flex items-center justify-center bg-background transition-opacity duration-150',
          isReady ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        {status === 'timeout' ? (
          <div className="flex flex-col items-center gap-4">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t`文档站加载超时`} />
            <div className="flex items-center gap-2">
              <Button type="primary" onClick={onRetry}>{t`重试`}</Button>
              <Button onClick={onOpenExternal}>{t`在浏览器中打开`}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Spin size="large" />
            <span className="text-xs text-foreground-secondary">{t`文档站加载中…`}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// props 类型定义
export interface DocsViewProps {
  status: DocsFrameStatus;
  reloadKey: number;
  onLoad: () => void;
  onRetry: () => void;
  onOpenExternal: () => void;
}

export const DocsView = memo(_DocsView);
