import type {
  SentenceTranslationResult,
  WordTranslationResult,
} from '@app/shared/schemas/translate';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Divider,
  Empty,
  Flex,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { memo } from 'react';

// 1. 私有常量

// 2. 可抽离的纯逻辑/子渲染函数

// 3. 组件本体
const _TranslationResult = (props: TranslationResultProps) => {
  useLingui();
  const { message } = App.useApp();

  // ① 变量声明、解构
  const { isLoading, streamingText, wordResult, sentenceResult, effectiveMode, error } = props;

  // ② 组件状态

  // ③ 网络IO

  // ④ 数据转换 / 派生
  const hasContent = Boolean(streamingText) || Boolean(wordResult) || Boolean(sentenceResult);

  // ⑤ 逻辑处理函数
  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      message.success(t`已复制到剪贴板`);
    } catch {
      message.error(t`复制失败`);
    }
  };

  // ⑥ 组件 Effect

  // ⑦ 组件渲染
  if (error) {
    return <Alert type="error" message={t`翻译出错`} description={error} showIcon />;
  }

  if (isLoading && !hasContent) {
    return (
      <Card size="small" className="bg-background-container">
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  if (!hasContent && !isLoading) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t`暂无翻译结果，请在上方输入后点击翻译`}
      />
    );
  }

  // 单词模式卡片展示
  if (effectiveMode === 'word' && wordResult) {
    return (
      <Card size="small" className="bg-background-container border-border">
        {/* 词头与音标 */}
        <Flex justify="space-between" align="center" className="mb-2">
          <Space align="baseline" size="middle">
            <Typography.Title level={4} className="!mb-0 font-bold">
              {wordResult.word}
            </Typography.Title>
            {wordResult.phonetic_us && (
              <span className="text-sm text-foreground-secondary font-mono">
                US /{wordResult.phonetic_us}/
              </span>
            )}
            {wordResult.phonetic_uk && (
              <span className="text-sm text-foreground-secondary font-mono">
                UK /{wordResult.phonetic_uk}/
              </span>
            )}
          </Space>

          <Space size="small">
            {wordResult.context_missing && <Tag color="warning">{t`未结合语境`}</Tag>}
            {wordResult.example_missing && <Tag color="default">{t`例句暂缺`}</Tag>}
            <Button size="small" type="text" onClick={() => handleCopy(wordResult.word)}>
              {t`复制`}
            </Button>
          </Space>
        </Flex>

        {/* 语境释义 */}
        {wordResult.context_sense && (
          <div className="bg-primary/5 border border-primary/20 rounded p-2.5 mb-3">
            <Space align="center" size="small" className="mb-1">
              <Badge status="processing" color="var(--color-primary)" />
              <span className="text-xs font-semibold text-primary">{t`语境释义`}:</span>
              <span className="text-sm font-medium">{wordResult.context_sense}</span>
            </Space>
            {wordResult.context_snippet && (
              <Typography.Paragraph
                type="secondary"
                italic
                className="!mb-0 text-xs pl-4 border-l-2 border-primary/30"
              >
                "{wordResult.context_snippet}"
              </Typography.Paragraph>
            )}
          </div>
        )}

        <Divider className="my-2" />

        {/* 常见义项列表 */}
        <Typography.Text strong className="text-xs text-foreground-secondary mb-2 block">
          {t`常用词典义项`}:
        </Typography.Text>

        <div className="flex flex-col gap-2.5">
          {wordResult.senses.map((sense, idx) => (
            <div key={`${sense.pos}-${idx}`} className="text-sm">
              <Space align="start" size="small">
                <Tag color="blue" className="font-mono text-xs font-medium">
                  {sense.pos}
                </Tag>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{sense.def}</div>
                  {sense.example && (
                    <Typography.Text type="secondary" italic className="text-xs block mt-0.5">
                      {sense.example}
                    </Typography.Text>
                  )}
                </div>
              </Space>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // 句子模式流式展示
  return (
    <Card size="small" className="bg-background-container border-border">
      <Flex justify="space-between" align="center" className="mb-2">
        <Space size="small">
          <Typography.Text strong className="text-xs text-foreground-secondary">
            {t`译文结果`}
          </Typography.Text>
          {isLoading && (
            <Tag color="processing" className="animate-pulse">
              {t`生成中...`}
            </Tag>
          )}
          {sentenceResult?.untranslated && <Tag color="warning">{t`保留原文`}</Tag>}
          {sentenceResult?.length_anomaly && <Tag color="warning">{t`长度比例异常`}</Tag>}
          {sentenceResult?.placeholder_mismatch && <Tag color="error">{t`代码保护还原失败`}</Tag>}
        </Space>

        <Button
          size="small"
          type="text"
          disabled={!streamingText}
          onClick={() => handleCopy(streamingText)}
        >
          {t`复制译文`}
        </Button>
      </Flex>

      <div className="min-h-24 p-3 bg-background rounded border border-border/50 text-sm leading-relaxed whitespace-pre-wrap select-text font-sans">
        {streamingText}
        {isLoading && (
          <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-pulse align-middle" />
        )}
      </div>
    </Card>
  );
};

// 4. Props 类型定义
export interface TranslationResultProps {
  isLoading: boolean;
  streamingText: string;
  wordResult: WordTranslationResult | null;
  sentenceResult: SentenceTranslationResult | null;
  effectiveMode: 'word' | 'sentence';
  error: string | null;
}

// 5. 导出与 Memo
export const TranslationResult = memo(_TranslationResult);
