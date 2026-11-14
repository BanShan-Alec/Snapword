import { APP_ENV } from '@app/shared/constants/env';
import { APP_FEATURES, buildSentryTags, SENTRY_TAGS } from '@app/shared/constants/telemetry';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import * as Sentry from '@sentry/electron/renderer';
import { Button, Empty } from 'antd';
import { Component, type ErrorInfo, Fragment, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 发生未捕获异常时的自定义业务回调（如自定义日志或状态通知） */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
  resetKey: number;
}

interface FallbackProps {
  error: unknown;
  resetError?: () => void;
}

function FallbackView({ error, resetError }: FallbackProps) {
  useLingui();
  const isDev = window.__APP_ENV__?.mode === APP_ENV.DEVELOPMENT || import.meta.env.DEV;
  const errorMessage = error instanceof Error ? error.message : String(error || '');

  const description = (
    <div className="flex flex-col items-center gap-2">
      <span className="text-base font-medium text-foreground">{t`页面出错啦~`}</span>
      {isDev && errorMessage ? (
        <span className="text-xs text-foreground-secondary font-mono max-w-lg break-all text-center">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );

  const handleReload = (): void => {
    if (resetError) {
      resetError();
    }
    const url = new URL(window.location.href);
    url.searchParams.set('skip_animation', '1');
    window.location.replace(url.toString());
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 bg-background text-foreground">
      <Empty image={Empty.PRESENTED_IMAGE_DEFAULT} description={description} />
      <Button type="primary" onClick={handleReload}>
        {t`刷新重试`}
      </Button>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      resetKey: 0,
    };
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 1. 渲染进程崩溃捕获并上报至 Sentry
    Sentry.captureException(error, {
      tags: buildSentryTags(APP_FEATURES.RENDERER_HOME, {
        [SENTRY_TAGS.LOGGER]: this.constructor.name,
        [SENTRY_TAGS.PROCESS]: 'renderer',
      }),
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });

    // 2. 落盘：Sentry 未激活（dev/无 DSN）时这是渲染崩溃的唯一磁盘痕迹；
    //    组件名取 componentStack 首帧（即崩溃组件本身），免翻长栈定位
    const crashedComponent =
      /^\s*at\s+([A-Za-z0-9_$]+)/m.exec(errorInfo.componentStack ?? '')?.[1] ?? 'unknown';
    logger.error(`React component crashed in <${crashedComponent}>:`, error, {
      componentStack: errorInfo.componentStack,
    });

    // 3. 执行外部业务传入的 onError 回调
    this.props.onError?.(error, errorInfo);
  }

  resetError = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetKey: prev.resetKey + 1,
    }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return <FallbackView error={this.state.error} resetError={this.resetError} />;
    }
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}
