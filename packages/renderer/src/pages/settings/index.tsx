import { Card, Segmented } from 'antd';
import { type ThemeMode, useAppStore } from '@/stores/useAppStore';

/**
 * 设置页占位（C-05 最小形态）：仅「主题」一项真实生效（RC-16 / RM-13），
 * 当前选择存 zustand 占位 store，P5 配置层（config.json + safeStorage）落地后
 * 迁移到 setting 表并持久化。其余设置分组（API / 取词 / 卡片 / 数据 / 系统 / 朗读）
 * 随配置层接入。
 */
const THEME_OPTIONS: Array<{ label: string; value: ThemeMode }> = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
];

export const SettingsPage = () => {
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  return (
    <section className="app-page flex h-full flex-col gap-4">
      <header>
        <h1 className="text-heading-sm font-semibold text-text">设置</h1>
        <p className="mt-1 text-body text-text-secondary">
          设置项后续持久化到配置层；本页当前仅主题可切换。
        </p>
      </header>
      <Card title="外观">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-body">主题</div>
            <div className="mt-1 text-caption text-text-tertiary">
              跟随系统 / 浅色 / 深色；切换立即对所有页面生效
            </div>
          </div>
          <Segmented
            value={themeMode}
            onChange={(value) => setThemeMode(value)}
            options={THEME_OPTIONS}
          />
        </div>
      </Card>
    </section>
  );
};
