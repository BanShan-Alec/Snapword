import {
  BookOutlined,
  EditOutlined,
  HistoryOutlined,
  SettingOutlined,
  TableOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Menu } from 'antd';
import type React from 'react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import logo from '@/assets/logo.svg';

/**
 * 主窗口外壳（C-05，RM-01 / RM-02 最小实现）：
 * - 定宽 200px 侧栏导航（interaction-spec-v2 §6.2）：图标 + 文字，当前项高亮（antd Menu 令牌配色）；
 * - 内容区自适应，最大宽度 1100px，宽屏居中；
 * - `Ctrl+1` ~ `Ctrl+6` 切换页面（RM-02）。
 * 窗口行为（尺寸/托盘/单实例）已在 main 进程 WindowManager 落地（P4）。
 */

// 私有常量
/** 导航顺序即 RM-02 表格顺序，index 对应 Ctrl+N 的 N-1 */
const NAV_ITEMS = [
  { path: '/', icon: <EditOutlined />, label: '翻译' },
  { path: '/history', icon: <HistoryOutlined />, label: '翻译历史' },
  { path: '/vocabulary', icon: <BookOutlined />, label: '生词本' },
  { path: '/glossary', icon: <TableOutlined />, label: '术语表' },
  { path: '/settings', icon: <SettingOutlined />, label: '设置' },
  { path: '/help', icon: <ToolOutlined />, label: '帮助与诊断' },
] as const;

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, navigate] = useLocation();

  // RM-02：Ctrl+1 ~ Ctrl+6 切换页面（主窗口获焦时）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < NAV_ITEMS.length) {
        event.preventDefault();
        navigate(NAV_ITEMS[index].path);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return (
    <div className="flex h-screen bg-surface-0 text-text">
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-split bg-surface-sidebar">
        <div className="flex items-center gap-2 px-4 pt-4 pb-1">
          <img src={logo} alt="" className="size-5" />
          <span className="text-body font-semibold">Snapword</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[currentPath]}
          items={NAV_ITEMS.map(({ path, icon, label }) => ({ key: path, icon, label }))}
          onClick={({ key }) => navigate(key)}
          className="flex-1 border-none bg-transparent"
        />
        <div className="px-4 py-3 text-caption text-text-tertiary">P4 骨架占位</div>
      </aside>
      <main className="stable-scrollbar min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto h-full w-full max-w-[1100px] px-6 py-6">{children}</div>
      </main>
    </div>
  );
};
