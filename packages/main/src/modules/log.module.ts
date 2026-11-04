import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { app, shell } from 'electron';
import log from 'electron-log/main';
import type { AppModule } from '../AppModule';
import {
  LOG_ARCHIVE_MAX_DAYS,
  LOG_ARCHIVE_MAX_FILES,
  LOG_FILE_MAX_SIZE_BYTES,
  RENDERER_LINE_MAX_LENGTH,
} from '../constants/logging';
import { isDev } from '../env';
import type { ModuleContext } from '../ModuleContext';
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
  private readonly windowLoggers = new Map<string, ReturnType<typeof log.create>>();

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
    // 主日志 5MB 轮转上限
    const MAX_SIZE = LOG_FILE_MAX_SIZE_BYTES;

    // 主进程日志配置
    this.mainLogger.transports.file.fileName = 'main.log';
    this.mainLogger.transports.file.maxSize = MAX_SIZE;
    this.mainLogger.transports.file.archiveLogFn = createCustomArchiveLogFn();

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

    // 预初始化默认 home 窗口的 logger
    this.getWindowLogger('home');
  }

  public enable({ app: electronApp }: ModuleContext): void {
    electronApp.whenReady().then(() => {
      this.cleanOldLogs();
      // 固定标记的启动分隔行，标记一轮 App 运行的边界（main.log 独有；
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
    fn(formatted);
  }

  /**
   * 写入渲染窗口的启动分隔行：标记该窗口本轮创建。
   * reload 不重建窗口，因此不会重复写。
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
