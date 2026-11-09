import fs from 'node:fs';
import path from 'node:path';
import { type AppConfig, configSchema, DEFAULT_CONFIG } from '@app/shared/schemas/config';
import { app } from 'electron';
import Store from 'electron-store';
import type { AppModule } from '../AppModule';
import type { ModuleContext } from '../ModuleContext';
import { getLogManager } from './log.module';

export type { AppConfig };
export { DEFAULT_CONFIG };

export class ConfigStore implements AppModule {
  private readonly store: Store<AppConfig> | null;
  private config: AppConfig;

  constructor(customDir?: string) {
    this.store = this.openStore(customDir);
    this.config = this.loadConfig();
  }

  enable(_context: ModuleContext): void {
    // electron-store 每次 set 同步原子落盘，无需 before-quit 兜底
  }

  // conf 构造期即读取整个文件，JSON 语法损坏会直接抛错：
  // 用默认值覆盖坏文件后重试一次，仍失败则退化为仅内存模式，不阻塞启动
  private openStore(customDir?: string): Store<AppConfig> | null {
    try {
      return new Store<AppConfig>({ cwd: customDir });
    } catch (error) {
      this.logError('Config reset to defaults: config file is not valid JSON:', error);
    }
    try {
      const dir = customDir ?? (app ? app.getPath('userData') : undefined);
      if (dir) {
        fs.writeFileSync(
          path.join(dir, 'config.json'),
          JSON.stringify(DEFAULT_CONFIG, null, '\t'),
          'utf-8',
        );
      }
      return new Store<AppConfig>({ cwd: customDir });
    } catch (error) {
      this.logError('Config reset failed to persist, running with defaults in memory only:', error);
      return null;
    }
  }

  private loadConfig(): AppConfig {
    if (!this.store) {
      return { ...DEFAULT_CONFIG };
    }
    const parsed = configSchema.safeParse(this.store.store);
    if (parsed.success) {
      return parsed.data;
    }
    // 检验失败即重置：默认值立即写回，覆盖坏文件
    this.logError(
      'Config reset to defaults: on-disk config failed schema validation:',
      parsed.error.issues,
    );
    try {
      this.store.store = { ...DEFAULT_CONFIG };
    } catch (error) {
      this.logWarn('Config write failed:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  private persist(): void {
    if (!this.store) return;
    try {
      // 整对象写回：顺带清掉磁盘上已废弃的残留键
      this.store.store = this.config;
    } catch (error) {
      this.logWarn('Config write failed:', error);
    }
  }

  private logWarn(message: string, detail: unknown): void {
    this.logScoped('warn', message, detail);
  }

  private logError(message: string, detail: unknown): void {
    this.logScoped('error', message, detail);
  }

  private logScoped(level: 'warn' | 'error', message: string, detail: unknown): void {
    try {
      getLogManager().scoped(this)[level](message, detail);
    } catch {
      // 日志系统自身不可用时静默，不影响配置链路
    }
  }

  public getAll(): AppConfig {
    return { ...this.config };
  }

  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  public set(partial: Partial<AppConfig>): AppConfig {
    // IPC 入口已校验，此处兜住非 IPC 直连调用方（如 counter.service）：
    // 非法输入拒绝并留痕，不抛错不断链路
    const parsed = configSchema.safeParse({ ...this.config, ...partial });
    if (!parsed.success) {
      this.logWarn('Invalid config update rejected:', parsed.error.issues);
      return { ...this.config };
    }
    this.config = parsed.data;
    this.persist();
    return { ...this.config };
  }

  public reset(): AppConfig {
    this.config = { ...DEFAULT_CONFIG };
    this.persist();
    return { ...this.config };
  }
}

// 默认单例供应用全局使用
let singletonInstance: ConfigStore | null = null;

export function getAppConfigStore(customDir?: string): ConfigStore {
  if (!singletonInstance) {
    singletonInstance = new ConfigStore(customDir);
  }
  return singletonInstance;
}

export function createConfigModule(customDir?: string): ConfigStore {
  return getAppConfigStore(customDir);
}
