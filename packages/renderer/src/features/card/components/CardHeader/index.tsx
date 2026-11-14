import {
  CloseOutlined,
  HolderOutlined,
  MoreOutlined,
  PushpinFilled,
  PushpinOutlined,
  SettingOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, type MenuProps, Tag, Tooltip } from 'antd';
import type React from 'react';

export interface CardHeaderProps {
  mode: 'word' | 'sentence';
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onOpenInHome: () => void;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  mode,
  isPinned,
  onTogglePin,
  onClose,
  onOpenInHome,
}) => {
  const menuItems: MenuProps['items'] = [
    {
      key: 'open_in_home',
      icon: <WindowsOutlined />,
      label: '在主窗口打开',
      onClick: onOpenInHome,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
      onClick: onOpenInHome,
    },
  ];

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-border px-3 select-none [app-region:drag] [-webkit-app-region:drag]">
      {/* 左侧可拖拽区域与模式徽标 */}
      <div className="flex items-center gap-2 cursor-move">
        <HolderOutlined className="text-sm text-foreground-muted" />
        <Tag color={mode === 'word' ? 'blue' : 'purple'} className="m-0 font-medium px-2 py-0.5">
          {mode === 'word' ? '词典' : '翻译'}
        </Tag>
      </div>

      {/* 右侧交互控件（严禁响应拖拽） */}
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag] [app-region:no-drag]">
        <Tooltip
          title={isPinned ? '取消防误关' : '只防止点击外部关闭；切换应用仍会关闭，新划词会替换内容'}
        >
          <Button
            type="text"
            size="small"
            icon={isPinned ? <PushpinFilled className="text-primary" /> : <PushpinOutlined />}
            onClick={onTogglePin}
            className="flex h-7 w-7 items-center justify-center p-0"
          />
        </Tooltip>

        <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            className="flex h-7 w-7 items-center justify-center p-0"
          />
        </Dropdown>

        <Tooltip title="关闭卡片">
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined className="text-xs" />}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center p-0 hover:text-danger"
          />
        </Tooltip>
      </div>
    </header>
  );
};
