import { Alert, App, Button, Input, Tag } from 'antd';
import { useState } from 'react';

/**
 * 翻译页占位（C-05 主窗口外壳，RM-03 最小形态）：
 * 输入区 / 翻译按钮 / 结果区 / 最近的骨架与文案先就位；
 * 翻译链路与共享历史未接入，点击「翻译」仅提示占位（不发请求、不写历史）。
 * 字符上限 20000 用 maxLength 硬截断，超限禁用逻辑随链路接入一并实现（RM-03）。
 */
export const TranslatePage = () => {
  const [value, setValue] = useState('');
  const { message } = App.useApp();
  const canTranslate = value.trim().length > 0;

  // RM-03：Ctrl+Enter 等效点击翻译按钮
  const handleTranslate = () => {
    if (!canTranslate) {
      return;
    }
    message.info('P4 骨架占位：翻译链路尚未接入');
  };

  return (
    <section className="app-page flex h-full flex-col gap-4">
      <header>
        <h1 className="text-heading-sm font-semibold text-text">翻译</h1>
        <p className="mt-1 text-body text-text-secondary">手动文本翻译与最近结果</p>
      </header>
      <Alert type="info" showIcon message="P4 骨架占位：翻译链路尚未接入，本页仅演示外壳与主题。" />
      <div className="app-card rounded-md p-4">
        <Tag>英语 → 简体中文</Tag>
        <Input.TextArea
          className="mt-2"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === 'Enter') {
              event.preventDefault();
              handleTranslate();
            }
          }}
          placeholder="粘贴或输入英文，Ctrl+Enter 翻译"
          autoSize={{ minRows: 4, maxRows: 10 }}
          maxLength={20000}
          showCount
          variant="borderless"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button disabled={!value} onClick={() => setValue('')}>
            清空
          </Button>
          <Button type="primary" disabled={!canTranslate} onClick={handleTranslate}>
            翻译
          </Button>
        </div>
      </div>
      <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-md border border-split bg-surface-1">
        <span className="text-body text-text-tertiary">翻译结果会显示在这里</span>
      </div>
      <div>
        <h2 className="text-body font-semibold">最近</h2>
        <div className="mt-2 rounded-md border border-split bg-surface-1 py-6 text-center text-body text-text-tertiary">
          暂无最近翻译（将显示共享会话历史的前 5 条）
        </div>
      </div>
    </section>
  );
};
