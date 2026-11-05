import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import type { SpanRecord } from '@app/shared/types/telemetry';
import { app, shell } from 'electron';
import type { LogMessage } from 'electron-log';
import log from 'electron-log/main';
import type { AppModule } from '../AppModule';
import {
  LOG_ARCHIVE_MAX_DAYS,
  LOG_ARCHIVE_MAX_FILES,
  LOG_FILE_MAX_SIZE_BYTES,
  RENDERER_LINE_MAX_LENGTH,
  TRACE_FILE_MAX_SIZE_BYTES,
} from '../constants/logging';
import { isDev } from '../env';
import type { ModuleContext } from '../ModuleContext';
import { getTracer } from '../telemetry/tracer';
import { cleanArchivedLogs, createCustomArchiveLogFn } from './log-archiver';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export function truncateRenderedLine(line: string, max = RENDERER_LINE_MAX_LENGTH): string {
  if (line.length <= max) return line;
  // 标记本身占长度，需从上限里预留，保证截断后总长仍不超过 max
  const suffix = ` [truncated ${line.length - max} chars]`;
  const available = max - suffix.length;
  if (available <= 0) return suffix.slice(0, max);
  return `${line.slice(0, available)}${suffix}`;
}

export interface IScopedLogger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

export class LogManager implements AppModule {
  public readonly mainLogger = log;
  public readonly traceLogger = log.create({ logId: 'traces' });
  private readonly windowLoggers = new Map<string, ReturnType<typeof log.create>>();

  private readonly injectTraceHook = (message: LogMessage): LogMessage => {
    const ctx = getTracer().getActiveContext();
    if (!ctx || !message.data || message.data.length === 0) {
      return message;
    }
    const traceTag = `[trace_id:${ctx.traceId} span_id:${ctx.spanId}]`;
    const data = [...message.data];
    if (typeof data[0] === 'string') {
      if (!data[0].includes('[trace_id:')) {
        data[0] = `${traceTag} ${data[0]}`;
      }
    } else {
      data.unshift(traceTag);
    }
    return { ...message, data };
  };

  constructor() {
    this.setupLoggers();
    (globalThis as unknown as { __appLogManager?: LogManager }).__appLogManager = this;
  }

  public getWindowLogger(windowName = 'home'): ReturnType<typeof log.create> {
    let winLogger = this.windowLoggers.get(windowName);
    if (!winLogger) {
      winLogger = log.create({ logId: `renderer-${windowName}` });
      winLogger.transports.file.fileName = `renderer-${windowName}.log`;
      winLogger.transports.file.maxSize = LOG_FILE_MAX_SIZE_BYTES;
      winLogger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
      winLogger.transports.file.archiveLogFn = createCustomArchiveLogFn();
      winLogger.hooks.push(this.injectTraceHook);
      this.windowLoggers.set(windowName, winLogger);
    }
    return winLogger;
  }

  public removeWindowLogger(windowName: string): void {
    if (windowName === 'home') return;
    this.windowLoggers.delete(windowName);
  }

  public get rendererLogger(): ReturnType<typeof log.create> {
    return this.getWindowLogger('home');
  }

  private setupLoggers(): void {
    // 主日志 5MB / 遥测日志 10MB 轮转上限
    const MAX_SIZE = LOG_FILE_MAX_SIZE_BYTES;
    const TRACE_MAX_SIZE = TRACE_FILE_MAX_SIZE_BYTES;

    // 主进程日志配置
    this.mainLogger.transports.file.fileName = 'main.log';
    this.mainLogger.transports.file.maxSize = MAX_SIZE;
    this.mainLogger.transports.file.archiveLogFn = createCustomArchiveLogFn();

    // 遥测拓扑日志配置 (NDJSON 独立文件)
    this.traceLogger.transports.file.fileName = 'traces.ndjson';
    this.traceLogger.transports.file.maxSize = TRACE_MAX_SIZE;
    this.traceLogger.transports.file.format = '{text}';
    this.traceLogger.transports.console.level = false;
    this.traceLogger.transports.file.archiveLogFn = createCustomArchiveLogFn();

    // 格式化输出
    const format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    this.mainLogger.transports.file.format = format;

    // 捕获未捕获异常并落盘
    this.mainLogger.errorHandler.startCatching({
      showDialog: false,
      onError: ({ error }) => {
        this.mainLogger.error('[Uncaught Exception]', error);
      },
    });

    // 注册主进程 Trace 注入 Hook
    this.mainLogger.hooks.push(this.injectTraceHook);

    // 预初始化默认 home 窗口的 logger
    this.getWindowLogger('home');

    // 监听 Span 结束，以 NDJSON 格式落盘至 traces.ndjson
    getTracer().onSpanEnd((record: SpanRecord) => {
      try {
        this.traceLogger.info(JSON.stringify(record));
      } catch (err) {
        this.mainLogger.warn('[LogManager] Failed to write SpanRecord:', err);
      }
    });
  }

  public enable({ app }: ModuleContext): void {
    app.whenReady().then(() => {
      this.cleanOldLogs();
      // D7 替代方案：固定标记的启动分隔行，标记一轮 App 运行的边界（main.log 独有；
      // 渲染窗口的创建边界另由 logWindowStarted 写入 renderer-<window>.log）
      this.mainLogger.info(`[App Lifecycle] ===== App started (v${app.getVersion()}) =====`);
      this.mainLogger.info('[App Lifecycle] Application ready, logging system initialized');
    });
  }

  /**
   * 清理过期（> 7天）或超额（> 5个）的历史归档日志
   */
  public cleanOldLogs(maxDays = LOG_ARCHIVE_MAX_DAYS, maxFiles = LOG_ARCHIVE_MAX_FILES): void {
    const logsDir = this.getLogDirectory();
    cleanArchivedLogs(logsDir, { maxDays, maxFilesPerCategory: maxFiles });
  }

  /**
   * 自动生成带 [Module] 前缀的作用域子 Logger
   * @param target 字符串（如 'WindowManager'）或直接传对象/实例 `this`（自动提取 Class 名）
   */
  public scoped(target: string | object): IScopedLogger {
    const tag = typeof target === 'string' ? target : target.constructor.name;
    const prefix = `[${tag}]`;

    return {
      info: (message: string, ...args: unknown[]) =>
        this.mainLogger.info(`${prefix} ${message}`, ...args),
      warn: (message: string, ...args: unknown[]) =>
        this.mainLogger.warn(`${prefix} ${message}`, ...args),
      error: (message: string, ...args: unknown[]) =>
        this.mainLogger.error(`${prefix} ${message}`, ...args),
      debug: (message: string, ...args: unknown[]) => {
        // debug 仅开发构建生效：生产排障靠 info/warn/error，高频细节不进文件
        if (!isDev) return;
        this.mainLogger.debug(`${prefix} ${message}`, ...args);
      },
    };
  }

  public getLogDirectory(): string {
    const file = this.mainLogger.transports.file.getFile();
    return path.dirname(file.path);
  }

  public async openLogFolder(): Promise<void> {
    const dir = this.getLogDirectory();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await shell.openPath(dir);
  }

  public logRendererMessage(
    level: LogLevel,
    message: string,
    args?: unknown[],
    windowName?: string,
    traceId?: string,
    spanId?: string,
  ): void {
    const targetName = windowName || 'home';
    const targetLogger = this.getWindowLogger(targetName);
    const fn = targetLogger[level] || targetLogger.info;
    // 与 console 变参语义对齐：util.format 统一渲染（%s 模板、对象 inspect、循环安全），
    // 预处理已在 preload 完成，此处参数均为 clone 安全值
    const formatted = truncateRenderedLine(
      util.formatWithOptions(
        { depth: 5 },
        `[Renderer] [${targetName}] ${message}`,
        ...(args ?? []),
      ),
    );
    const line = traceId
      ? `[trace_id:${traceId}${spanId ? ` span_id:${spanId}` : ''}] ${formatted}`
      : formatted;
    fn(line);
  }

  /**
   * 写入渲染窗口的启动分隔行：标记该窗口本轮创建。
   * reload 不重建窗口，因此不会重复写；updater 窗口重新创建时会产生新的一行。
   */
  public logWindowStarted(windowName: string): void {
    this.logRendererMessage(
      'info',
      `[Window Lifecycle] ===== Window started (v${app.getVersion()}) =====`,
      undefined,
      windowName,
    );
  }
}

let loggerInstance: LogManager | null = null;

export function getLogManager(): LogManager {
  if (!loggerInstance) {
    loggerInstance = new LogManager();
  }
  return loggerInstance;
}

export function createLogModule(): LogManager {
  return getLogManager();
}
