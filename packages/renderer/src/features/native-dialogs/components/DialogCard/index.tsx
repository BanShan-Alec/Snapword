import { FileOutlined, FolderOpenOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Button } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';
import { statusBoxClass } from '@/lib/classNames';
import type { DialogAction } from '../../hooks/useNativeDialogs';

// 私有常量

// 可抽离的逻辑处理函数/组件

const _DialogCard = (props: DialogCardProps) => {
  useLingui();
  // 变量声明、解构
  const {
    selectedPath,
    statusMessage,
    activeAction,
    isLoading = false,
    onOpenFile,
    onOpenDirectory,
    onSaveFile,
    onShowInFolder,
  } = props;

  // 组件状态
  const isAnyLoading = activeAction !== undefined ? activeAction !== null : isLoading;
  const isActionLoading = (action: DialogAction) =>
    activeAction !== undefined ? activeAction === action : isLoading;

  // 网络IO

  // 数据转换

  // 逻辑处理函数

  // 组件Effect

  // 组件渲染
  return (
    <AppCard
      title={
        <CardTitle
          icon={<FolderOpenOutlined />}
          title={t`原生对话框与文件定位 (Native Dialogs)`}
          subtitle={t`经由安全 Controller & Preload 调起系统文件管理器与访达`}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="primary"
            size="small"
            icon={<FileOutlined />}
            loading={isActionLoading('openFile')}
            disabled={isAnyLoading && !isActionLoading('openFile')}
            onClick={onOpenFile}
          >
            {t`选择文件`}
          </Button>
          <Button
            size="small"
            icon={<FolderOpenOutlined />}
            loading={isActionLoading('openDirectory')}
            disabled={isAnyLoading && !isActionLoading('openDirectory')}
            onClick={onOpenDirectory}
          >
            {t`选择目录`}
          </Button>
          <Button
            size="small"
            icon={<SaveOutlined />}
            loading={isActionLoading('saveFile')}
            disabled={isAnyLoading && !isActionLoading('saveFile')}
            onClick={onSaveFile}
          >
            {t`另存为`}
          </Button>
          <Button
            size="small"
            icon={<SearchOutlined />}
            loading={isActionLoading('showInFolder')}
            disabled={!selectedPath || isAnyLoading}
            onClick={onShowInFolder}
          >
            {t`在资源管理器中定位`}
          </Button>
        </div>

        {statusMessage && <div className={statusBoxClass({ breakAll: true })}>{statusMessage}</div>}
      </div>
    </AppCard>
  );
};

// props 类型定义
interface DialogCardProps {
  selectedPath: string;
  statusMessage: string;
  activeAction?: DialogAction | null;
  isLoading?: boolean;
  onOpenFile: () => void;
  onOpenDirectory: () => void;
  onSaveFile: () => void;
  onShowInFolder: () => void;
}

export const DialogCard = memo(_DialogCard);
