import { SettingOutlined } from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type { AppConfig } from '@shared/schemas/config';
import { App, Button, Select, Skeleton, Switch } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';
import { callIpc } from '@/lib/ipc';

// 私有常量
const TOGGLE_ROW_CLASS =
  'settings-toggle-row flex flex-wrap items-center justify-between gap-y-2 bg-background-sunken p-3 rounded-lg border border-border';

// 可抽离的逻辑处理函数/组件

const _SettingsCard = (props: SettingsCardProps) => {
  useLingui();
  const { message } = App.useApp();
  // 变量声明、解构
  const { appConfig, onUpdate, onReset, isLoading } = props;

  // 组件状态

  // 网络IO

  // 数据转换
  const showSkeleton = isLoading && appConfig === null;
  const themeOptions = [
    { label: t`跟随系统 (System)`, value: 'system' },
    { label: t`浅色模式 (Light)`, value: 'light' },
    { label: t`深色模式 (Dark)`, value: 'dark' },
  ];
  const languageOptions = [
    { label: t`跟随系统 (System)`, value: 'system' },
    { label: '简体中文 (zh-CN)', value: 'zh-CN' },
    { label: 'English (en-US)', value: 'en-US' },
  ];

  // 逻辑处理函数

  // 组件Effect

  // 组件渲染
  return (
    <AppCard
      title={
        <CardTitle
          icon={<SettingOutlined />}
          title={t`应用偏好设置 (ConfigStore)`}
          subtitle={t`类型安全主进程本地持久化存储与动态生效`}
        />
      }
      extra={
        <Button size="small" loading={isLoading} onClick={onReset}>
          {t`恢复默认值`}
        </Button>
      }
    >
      {showSkeleton ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : appConfig ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          {/* 主题模式 */}
          <div className="flex flex-col gap-1.5 bg-background-sunken p-3 rounded-lg border border-border">
            <label htmlFor="theme-select" className="text-foreground-secondary font-medium">
              {t`外观主题 (Theme)`}
            </label>
            <Select
              id="theme-select"
              value={appConfig.theme}
              options={themeOptions}
              onChange={(value) => onUpdate({ theme: value as AppConfig['theme'] })}
            />
          </div>

          {/* 默认语言 */}
          <div className="flex flex-col gap-1.5 bg-background-sunken p-3 rounded-lg border border-border">
            <label htmlFor="lang-select" className="text-foreground-secondary font-medium">
              {t`界面语言 (Language)`}
            </label>
            <Select
              id="lang-select"
              value={appConfig.language}
              options={languageOptions}
              onChange={(value) => onUpdate({ language: value as AppConfig['language'] })}
            />
          </div>

          {/* 关闭窗口后保留在托盘 */}
          <div className={TOGGLE_ROW_CLASS}>
            <label htmlFor="tray-switch" className="cursor-pointer select-none flex-1 pr-3">
              <span className="text-foreground font-medium block">{t`关闭后保留在托盘`}</span>
              <span className="text-xs text-foreground-secondary block mt-0.5">
                {t`点击托盘图标可重新打开`}
              </span>
            </label>
            <Switch
              id="tray-switch"
              checked={appConfig.minimizeToTray}
              onChange={(checked) =>
                onUpdate({
                  minimizeToTray: checked,
                  closeBehaviorConfirmed: true,
                })
              }
            />
          </div>

          {/* 软件更新入口（检查动作内聚在 updater 窗口） */}
          <div className={TOGGLE_ROW_CLASS}>
            <div className="flex-1 pr-3">
              <span className="text-foreground font-medium block">{t`软件更新 (Updater)`}</span>
              <span className="text-xs text-foreground-secondary block mt-0.5">
                {t`检查最新版本与下载安装`}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  // 检查动作内聚在 updater 窗口（开窗即查），此处只负责唤起窗口
                  void callIpc('updater.openWindow').catch(() => {
                    message.error(t`打开更新窗口失败`);
                  });
                }}
              >
                {t`检查更新`}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6 text-foreground-secondary text-xs">
          {t`正在读取偏好设置...`}
        </div>
      )}
    </AppCard>
  );
};

// props 类型定义
interface SettingsCardProps {
  appConfig: AppConfig | null;
  onUpdate: (partial: Partial<AppConfig>) => void;
  onReset: () => void;
  isLoading: boolean;
}

export const SettingsCard = memo(_SettingsCard);
