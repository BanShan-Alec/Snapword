import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Alert, App, Button, Input, Tag } from 'antd';
import { useAppStore } from '@/stores/useAppStore';

/** RM-03：单次翻译输入上限（超过时保留文本、禁用翻译并提示） */
const MAX_TRANSLATE_CHARS = 20_000;

/**
 * 翻译页占位（C-05 主窗口外壳，RM-03 最小形态）：
 * 输入区 / 翻译按钮 / 结果区 / 最近的骨架与文案先就位；
 * 翻译链路与共享历史未接入，点击「翻译」仅提示占位（不发请求、不写历史）。
 * 输入草稿放共享 store：页面切换卸载后不丢（RM-03）。
 */
export const TranslatePage = () => {
  useLingui();
  const value = useAppStore((state) => state.translateInput);
  const setValue = useAppStore((state) => state.setTranslateInput);
  const { message } = App.useApp();
  const isOverLimit = value.length > MAX_TRANSLATE_CHARS;
  const canTranslate = value.trim().length > 0 && !isOverLimit;

  // RM-03：Ctrl+Enter 等效点击翻译按钮
  const handleTranslate = () => {
    if (!canTranslate) {
      return;
    }
    message.info(t`翻译功能将在后续版本开放。`);
  };

  return (
    <section className="app-page flex h-full flex-col gap-4">
      <header>
        <h1 className="text-heading-sm font-semibold text-text">{t`翻译`}</h1>
        <p className="mt-1 text-body text-text-secondary">{t`手动翻译文本，并回看最近结果。`}</p>
      </header>
      <Alert type="info" showIcon message={t`翻译功能将在后续版本开放。`} />
      <div className="app-card rounded-md p-4">
        <Tag>{t`英语 → 简体中文`}</Tag>
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
          placeholder={t`粘贴或输入英文，Ctrl+Enter 翻译`}
          autoSize={{ minRows: 4, maxRows: 10 }}
          showCount
          status={isOverLimit ? 'error' : undefined}
          variant="borderless"
        />
        {isOverLimit ? (
          <Alert
            className="mt-2"
            type="warning"
            showIcon
            message={t`已超过 20000 字符上限，请删减后再翻译。`}
          />
        ) : null}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button disabled={!value} onClick={() => setValue('')}>
            {t`清空`}
          </Button>
          <Button type="primary" disabled={!canTranslate} onClick={handleTranslate}>
            {t`翻译`}
          </Button>
        </div>
      </div>
      <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-md border border-split bg-surface-1">
        <span className="text-body text-text-tertiary">{t`翻译结果会显示在这里`}</span>
      </div>
      <div>
        <h2 className="text-body font-semibold">{t`最近`}</h2>
        <div className="mt-2 rounded-md border border-split bg-surface-1 py-6 text-center text-body text-text-tertiary">
          {t`暂无最近翻译（将显示共享会话历史的前 5 条）`}
        </div>
      </div>
    </section>
  );
};
