import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Tag } from 'antd';
import type React from 'react';
import { useState } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { callIpc } from '@/lib/ipc';

// 链接打开失败不打扰用户（含白名单拦截拒绝）：失败行已由 callIpc 统一落盘
function openExternal(url: string): void {
  void callIpc('shell.openExternal', [url]).catch(() => {});
}

interface ChangelogCardProps {
  version?: string;
  releaseDate?: string;
  releaseNotes?: string[];
}

function formatInlineMarkdown(text: string): React.ReactNode[] {
  const tokens = text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g);
  let counter = 0;
  return tokens.map((token) => {
    const key = `token-${counter++}`;
    const mdLinkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (mdLinkMatch) {
      const [, label, url] = mdLinkMatch;
      return (
        <a
          key={key}
          href={url}
          onClick={(e) => {
            e.preventDefault();
            openExternal(url);
          }}
          className="text-primary hover:underline cursor-pointer"
        >
          {label}
        </a>
      );
    }
    const boldMatch = token.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {boldMatch[1]}
        </strong>
      );
    }
    if (/^https?:\/\/[^\s]+$/.test(token)) {
      return (
        <a
          key={key}
          href={token}
          onClick={(e) => {
            e.preventDefault();
            openExternal(token);
          }}
          className="text-primary hover:underline cursor-pointer"
        >
          {token}
        </a>
      );
    }
    return token;
  });
}

export const ChangelogCard: React.FC<ChangelogCardProps> = ({
  version,
  releaseDate,
  releaseNotes,
}) => {
  const { i18n } = useLingui();
  const [expanded, setExpanded] = useState(false);

  const formattedDate = releaseDate
    ? new Date(releaseDate).toLocaleDateString(i18n.locale)
    : undefined;
  const hasNotes = Boolean(releaseNotes && releaseNotes.length > 0);
  const isLongNotes = Boolean(releaseNotes && releaseNotes.length > 4);

  const normalizedNotes = (releaseNotes ?? []).map((note, index) => ({
    id: `${index}-${note}`,
    text: note,
  }));

  return (
    <AppCard
      size="small"
      className="bg-background-elevated"
      title={
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">{t`更新日志`}</span>
            {version && (
              <Tag color="blue" className="font-mono text-xs font-medium">
                {`v${version}`}
              </Tag>
            )}
          </div>
          {formattedDate && (
            <span className="text-xs text-foreground-secondary font-normal">{formattedDate}</span>
          )}
        </div>
      }
    >
      <div className="text-xs text-foreground-secondary space-y-1.5">
        <div
          className={
            expanded || !isLongNotes
              ? 'max-h-52 overflow-y-auto pr-1'
              : 'line-clamp-4 overflow-hidden'
          }
        >
          {hasNotes ? (
            <ul className="list-disc pl-4 space-y-1">
              {normalizedNotes.map((item) => (
                <li key={item.id} className="leading-relaxed break-words">
                  {formatInlineMarkdown(item.text)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-foreground-secondary italic">{t`包含常规稳定性改进与性能优化。`}</p>
          )}
        </div>
        {isLongNotes && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-primary hover:text-primary-hover text-xs font-normal cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {expanded ? t`收起` : t`展开全部`}
            </button>
          </div>
        )}
      </div>
    </AppCard>
  );
};
