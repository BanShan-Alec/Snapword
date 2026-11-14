import {
  ClearOutlined,
  DownloadOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import { Button, Input, Modal, Radio, Select } from 'antd';
import type React from 'react';
import { useState } from 'react';

export interface VocabularyToolbarProps {
  total: number;
  search: string;
  onSearchChange: (val: string) => void;
  selectedTag: string | undefined;
  onTagChange: (tag: string | undefined) => void;
  availableTags: string[];
  sort: 'time' | 'alpha';
  onSortChange: (sort: 'time' | 'alpha') => void;
  onExportCsv: () => void;
  onClearAll: () => void;
}

export const VocabularyToolbar: React.FC<VocabularyToolbarProps> = ({
  total,
  search,
  onSearchChange,
  selectedTag,
  onTagChange,
  availableTags,
  sort,
  onSortChange,
  onExportCsv,
  onClearAll,
}) => {
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const handleConfirmClear = () => {
    if (confirmInput.trim().toLowerCase() === 'delete') {
      onClearAll();
      setClearModalOpen(false);
      setConfirmInput('');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border select-none">
      {/* 搜索与筛选 */}
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
        <Input
          placeholder="搜索单词或释义..."
          prefix={<SearchOutlined className="text-foreground-secondary" />}
          allowClear
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-56"
        />

        {availableTags.length > 0 && (
          <Select
            placeholder="筛选标签"
            allowClear
            value={selectedTag}
            onChange={onTagChange}
            className="w-36"
            options={availableTags.map((t) => ({ label: t, value: t }))}
          />
        )}

        <Radio.Group
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="middle"
        >
          <Radio.Button value="time">
            <SortDescendingOutlined className="mr-1" />
            时间
          </Radio.Button>
          <Radio.Button value="alpha">
            <SortAscendingOutlined className="mr-1" />
            字母
          </Radio.Button>
        </Radio.Group>
      </div>

      {/* 导出与清空操作 */}
      <div className="flex items-center gap-2">
        <Button icon={<DownloadOutlined />} onClick={onExportCsv} disabled={total === 0}>
          导出 CSV
        </Button>

        <Button
          danger
          icon={<ClearOutlined />}
          onClick={() => {
            setConfirmInput('');
            setClearModalOpen(true);
          }}
          disabled={total === 0}
        >
          清空
        </Button>
      </div>

      {/* 清空二次确认弹窗 (要求输入 delete) */}
      <Modal
        title="清空生词本确认"
        open={clearModalOpen}
        onCancel={() => setClearModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setClearModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            disabled={confirmInput.trim().toLowerCase() !== 'delete'}
            onClick={handleConfirmClear}
          >
            确认清空
          </Button>,
        ]}
      >
        <p className="text-sm text-foreground-secondary mb-3">
          清空后将隐藏生词本中全部 <strong>{total}</strong> 个单词（5 秒内仍可在底部撤销）。 请输入{' '}
          <strong className="text-danger font-mono font-semibold">delete</strong> 以确认操作：
        </p>
        <Input
          placeholder="输入 delete"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          onPressEnter={handleConfirmClear}
        />
      </Modal>
    </div>
  );
};
