import { CheckCircleOutlined, CloseOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { ErrorCode } from '@shared/constants/error-codes';
import { Alert, Button, Spin } from 'antd';
import type React from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { EllipsisText } from '@/components/ui/EllipsisText';
import { ChangelogCard } from './components/ChangelogCard';
import { ProgressCard } from './components/ProgressCard';
import { useUpdater } from './hooks/useUpdater';

export const UpdaterFeature: React.FC = () => {
  useLingui();
  const { snapshot, handleDownload, handleCancel, handleInstall, handleClose, handleRetry } =
    useUpdater();

  const getStatusHeader = (): { title: string; subtitle: string } => {
    switch (snapshot.state) {
      case 'checking':
        return {
          title: t`检查更新中`,
          subtitle: t`正在与更新服务器建立连接，请稍候...`,
        };
      case 'available':
        return {
          title: t`发现新版本`,
          subtitle: t`新版本已经准备就绪，包含最新的功能与改进。`,
        };
      case 'downloading':
        return {
          title: t`正在下载更新`,
          subtitle: t`安装包下载中，完成后即可进行安装升级。`,
        };
      case 'downloaded':
        return {
          title: t`更新已准备就绪`,
          subtitle: t`新版本已完成下载，重启应用后即可完成升级。`,
        };
      case 'up-to-date':
        return {
          title: t`已是最新版本`,
          subtitle: t`当前安装的应用已包含所有最新功能与安全更新。`,
        };
      case 'error':
        return {
          title: t`更新失败`,
          subtitle: t`检查或下载更新时发生异常，请检查网络后重试。`,
        };
      default:
        return {
          title: t`软件更新`,
          subtitle: t`暂无可用更新信息。`,
        };
    }
  };

  const header = getStatusHeader();
  // 仅在已获取到版本元数据时渲染变更日志卡片；检查失败且无版本号时走独立的错误提示卡片
  const hasVersionMetadata = Boolean(snapshot.version);
  const showChangelog =
    hasVersionMetadata &&
    (snapshot.state === 'available' ||
      snapshot.state === 'downloading' ||
      snapshot.state === 'downloaded' ||
      snapshot.state === 'error');

  // 错误主文案按语义码本地化，原始报错降级为次要行保留排查线索
  const renderErrorContent = () => {
    const errorText = (() => {
      switch (snapshot.code) {
        case ErrorCode.UPDATER_NETWORK_ERROR:
          return t`网络连接失败或超时，请检查网络后重试。`;
        case ErrorCode.UPDATER_NOT_CONFIGURED:
          return t`更新服务未配置。`;
        default:
          return t`更新过程中出现未知错误，请稍后重试。`;
      }
    })();

    return (
      <>
        <Alert type="error" showIcon message={t`更新发生错误`} description={errorText} />
        {snapshot.error && (
          <p className="text-xs text-foreground-secondary m-0 break-all select-text">
            {snapshot.error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={handleClose}>{t`关闭`}</Button>
          <Button type="primary" onClick={handleRetry}>{t`重试`}</Button>
        </div>
      </>
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground select-none overflow-hidden border border-border">
      {/* 标题栏区域：无边框窗口自绘标题栏，通过 no-wco 隔离 WCO 边距，支持拖拽移动窗口 */}
      <div className="drag-region no-wco flex items-center justify-between px-5 py-3.5 border-b border-border bg-background select-none cursor-move shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-base text-primary shrink-0">
            <CloudDownloadOutlined />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground tracking-tight m-0 leading-5">
              <EllipsisText className="block truncate" tooltip={header.title}>
                {header.title}
              </EllipsisText>
            </h2>
            <p className="text-xs text-foreground-secondary m-0 mt-0.5 leading-4">
              <EllipsisText className="block truncate" tooltip={header.subtitle}>
                {header.subtitle}
              </EllipsisText>
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label={t`关闭`}
          className="no-drag text-foreground-muted hover:text-foreground hover:bg-foreground/10 active:bg-foreground/20 rounded-md w-8 h-8 transition-colors duration-150 inline-flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 shrink-0"
          onClick={handleClose}
        >
          <CloseOutlined className="text-sm" />
        </button>
      </div>

      {/* 主体内容区域：对称内边距对齐 Header，移除 stable-scrollbar 消除非溢出下的异常留白 */}
      <div className="flex-1 p-5 flex flex-col gap-3 min-h-0 overflow-y-auto">
        {snapshot.state === 'checking' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
            <Spin size="large" />
            <span className="text-xs text-foreground-secondary">{t`正在检查更新...`}</span>
          </div>
        )}

        {snapshot.state === 'up-to-date' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
            <CheckCircleOutlined className="text-success text-3xl mb-1" />
            <span className="text-sm font-medium text-foreground">{t`已是最新版本`}</span>
            <span className="text-xs text-foreground-secondary">{t`您的应用已保持在最新版本，无需更新。`}</span>
          </div>
        )}

        {showChangelog && (
          <div className="flex flex-col gap-2">
            <ChangelogCard
              version={snapshot.version}
              releaseDate={snapshot.releaseDate}
              releaseNotes={snapshot.releaseNotes}
            />
            {snapshot.state === 'available' && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button onClick={handleClose}>{t`稍后提醒`}</Button>
                <Button type="primary" onClick={handleDownload}>{t`立即更新`}</Button>
              </div>
            )}
            {snapshot.state === 'downloaded' && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button onClick={handleClose}>{t`稍后安装`}</Button>
                <Button type="primary" onClick={handleInstall}>{t`重启并安装`}</Button>
              </div>
            )}
            {snapshot.state === 'error' && renderErrorContent()}
          </div>
        )}

        {/* 检查更新网络异常且未拉取到版本元数据时，在此独立渲染错误提示与重试按钮 */}
        {!showChangelog && snapshot.state === 'error' && (
          <div className="flex flex-col gap-2">{renderErrorContent()}</div>
        )}

        {snapshot.state === 'downloading' && (
          <div className="flex flex-col gap-2">
            <ProgressCard progress={snapshot.progress} />
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button onClick={handleCancel}>{t`取消下载`}</Button>
              <Button type="primary" onClick={handleClose}>{t`隐藏到后台`}</Button>
            </div>
          </div>
        )}

        {!showChangelog && snapshot.state === 'downloaded' && (
          <div className="flex flex-col gap-2">
            <AppCard size="small" className="bg-background-elevated">
              <div className="flex items-center gap-3">
                <CheckCircleOutlined className="text-success text-2xl shrink-0" />
                <div className="text-xs text-foreground-secondary">
                  {t`新版本已完成下载，重启应用后即可完成升级。`}
                </div>
              </div>
            </AppCard>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button onClick={handleClose}>{t`稍后安装`}</Button>
              <Button type="primary" onClick={handleInstall}>{t`重启并安装`}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdaterFeature;
