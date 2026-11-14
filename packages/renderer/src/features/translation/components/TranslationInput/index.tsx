import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Button, Collapse, Flex, Input, Radio, Space, Tooltip } from 'antd';
import type React from 'react';
import { memo } from 'react';
import type { TranslationMode } from '../../hooks/useTranslation';

// 1. 私有常量
const MAX_TEXT_LENGTH = 20000;

// 2. 可抽离的纯逻辑/子渲染函数

// 3. 组件本体
const _TranslationInput = (props: TranslationInputProps) => {
  useLingui();

  // ① 变量声明、解构
  const {
    text,
    onTextChange,
    context,
    onContextChange,
    mode,
    onModeChange,
    effectiveMode,
    isLoading,
    onTranslate,
    onAbort,
    onClear,
  } = props;

  // ② 组件状态

  // ③ 网络IO

  // ④ 数据转换 / 派生

  // ⑤ 逻辑处理函数
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isLoading && text.trim()) {
        onTranslate();
      }
    }
  };

  // ⑥ 组件 Effect

  // ⑦ 组件渲染
  return (
    <div className="flex flex-col gap-3">
      {/* 模式选择与控制条 */}
      <Flex justify="space-between" align="center" wrap="wrap" gap="small">
        <Space orientation="horizontal" size="small">
          <span className="text-xs text-foreground-secondary">{t`模式`}:</span>
          <Radio.Group
            value={mode}
            onChange={(e) => onModeChange(e.target.value as TranslationMode)}
            size="small"
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="auto">
              <Tooltip title={t`单词自动走词典模式，长句走翻译管线`}>
                {t`自动识别 (${effectiveMode === 'word' ? '词典' : '句子'})`}
              </Tooltip>
            </Radio.Button>
            <Radio.Button value="word">{t`单词词典`}</Radio.Button>
            <Radio.Button value="sentence">{t`句子翻译`}</Radio.Button>
          </Radio.Group>
        </Space>

        <Space orientation="horizontal" size="small">
          {isLoading ? (
            <Button danger size="middle" onClick={onAbort}>
              {t`停止`}
            </Button>
          ) : (
            <Button type="primary" size="middle" onClick={onTranslate} disabled={!text.trim()}>
              {t`翻译 (Ctrl+Enter)`}
            </Button>
          )}
          <Button size="middle" onClick={onClear} disabled={isLoading && !text}>
            {t`清空`}
          </Button>
        </Space>
      </Flex>

      {/* 原文输入框 */}
      <Input.TextArea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t`请输入英文单词或句子，按 Ctrl+Enter 快速翻译...`}
        rows={4}
        maxLength={MAX_TEXT_LENGTH}
        showCount
        className="font-mono text-sm resize-y"
      />

      {/* 可选语境面板 */}
      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'context',
            label: (
              <span className="text-xs text-foreground-secondary">
                {t`可选上下文语境 (Context)`}
              </span>
            ),
            children: (
              <Input.TextArea
                value={context}
                onChange={(e) => onContextChange(e.target.value)}
                placeholder={t`输入词句所在的上下文段落（帮助词典模式精准匹配语境义，≤2000字）`}
                rows={2}
                maxLength={2000}
                showCount
                className="text-xs"
              />
            ),
          },
        ]}
      />
    </div>
  );
};

// 4. Props 类型定义
export interface TranslationInputProps {
  text: string;
  onTextChange: (text: string) => void;
  context: string;
  onContextChange: (context: string) => void;
  mode: TranslationMode;
  onModeChange: (mode: TranslationMode) => void;
  effectiveMode: 'word' | 'sentence';
  isLoading: boolean;
  onTranslate: () => void;
  onAbort: () => void;
  onClear: () => void;
}

// 5. 导出与 Memo
export const TranslationInput = memo(_TranslationInput);
