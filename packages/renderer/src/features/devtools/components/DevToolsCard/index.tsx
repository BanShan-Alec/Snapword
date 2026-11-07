import {
  BookOutlined,
  CodeOutlined,
  GithubOutlined,
  StopOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Button } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';
import { statusBoxClass } from '@/lib/classNames';

// 1. 私有常量

// 2. 可抽离的逻辑处理函数/组件

// 3. 组件本体实现
const _DevToolsCard = (props: DevToolsCardProps) => {
  useLingui();
  // ① 变量声明、解构
  const { actionMessage, onToggleDevTools, onOpenDocs, onOpenGithub, onOpenBlockedUrl } = props;

  // ② 组件状态

  // ③ 网络IO

  // ④ 数据转换

  // ⑤ 逻辑处理函数

  // ⑥ 组件Effect

  // ⑦ 组件渲染
  return (
    <AppCard
      title={
        <CardTitle
          icon={<ToolOutlined />}
          title={t`调试与系统外链 (Security Filter)`}
          subtitle={t`严格协议白名单校验 (仅允许 http/https) 与 DevTools 控制`}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="primary" size="small" icon={<CodeOutlined />} onClick={onToggleDevTools}>
            {t`开关 DevTools`}
          </Button>
          <Button size="small" icon={<BookOutlined />} onClick={onOpenDocs}>
            {t`打开项目文档站`}
          </Button>
          <Button size="small" icon={<GithubOutlined />} onClick={onOpenGithub}>
            {t`打开 GitHub 页面`}
          </Button>
          <Button
            size="small"
            icon={<StopOutlined className="text-danger" />}
            onClick={onOpenBlockedUrl}
          >
            {t`非白名单外链 (example.com)`}
          </Button>
        </div>

        {actionMessage && <div className={statusBoxClass()}>{actionMessage}</div>}
      </div>
    </AppCard>
  );
};

// 4. Props 类型定义
export interface DevToolsCardProps {
  actionMessage: string;
  onToggleDevTools: () => void;
  onOpenDocs: () => void;
  onOpenGithub: () => void;
  onOpenBlockedUrl: () => void;
}

// 5. 导出与 Memo 包装
export const DevToolsCard = memo(_DevToolsCard);
