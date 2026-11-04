import { Button } from 'antd';
import { useLocation } from 'wouter';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

/**
 * 翻译历史页占位（RM-04 最小形态）：顶部硬性说明 + 空态 + [去翻译]。
 * 列表 / 搜索 / 筛选 / 条目操作随共享历史链路接入。
 */
export const HistoryPage = () => {
  const [, navigate] = useLocation();
  return (
    <PagePlaceholder
      title="翻译历史"
      banner="仅保留本次运行，退出后清空"
      emptyText="还没有翻译记录"
      action={
        <Button type="primary" onClick={() => navigate('/')}>
          去翻译
        </Button>
      }
    />
  );
};
