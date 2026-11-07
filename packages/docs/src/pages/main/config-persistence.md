---

title: 配置持久化（Electron-store）
description: 运行期偏好落盘至 userData，Zod Schema 强校验、坏文件自愈与跨窗口广播。
---

# 配置持久化（Electron-store）

> **TL;DR**：用户运行时偏好（主题、语言、关闭行为、自动更新等）持久化至 `userData/config.json`；依托 Zod Schema 整体校验与默认值派生，遭遇非法 JSON 或破损字段时自动覆盖自愈，配置变更通过 IPC 广播全量窗口。

## 1. 选型理由

桌面客户端的本地配置文件（如 JSON）是不可信输入：
1. **人为或断电损坏**：用户可能手动编辑导致 JSON 语法错误，或者断电导致写入半截文件。若直接读取，应用将在启动期抛出未捕获异常并直接白屏崩溃。
2. **跨版本字段漂移**：升级新版本后新增了必填字段，旧版本的配置文件缺失该键，导致运行时类型报错。

工程通过 Zod 强类型 Schema 定义结合加载期双重自愈机制，确保配置链路坚不可摧。

## 2. 核心机制

### 单一真源 Schema 与默认值派生

→ 源码：[packages/shared/src/schemas/config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/shared/src/schemas/config.ts)

```ts
export const configSchema = z.object({
  theme: z.enum(THEME_MODES).default(DEFAULT_THEME_MODE),
  minimizeToTray: z.boolean().default(true),
  language: z.enum(SUPPORTED_LOCALES).default(DEFAULT_LANGUAGE),
  autoCheckUpdate: z.boolean().default(true),
  serverCounter: z.number().int().default(0),
});

export type AppConfig = z.infer<typeof configSchema>;
export const updateConfigInputSchema = configSchema.partial();
export const DEFAULT_CONFIG: AppConfig = configSchema.parse({});
```

每个字段均附带 `.default()`，默认值由 Schema 自动派生，全仓杜绝手写字面量。

### 加载期自愈策略（语法损坏覆盖 + 校验失败重置）

→ 源码：[packages/main/src/modules/config.module.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/config.module.ts)

1. **第一道防线（语法损坏）**：`electron-store` 构造期直接读取，若 JSON 损坏抛错，立即用 `DEFAULT_CONFIG` 覆盖写入坏文件并重试；若目录不可写则降级为纯内存模式。
2. **第二道防线（字段校验）**：文件可解析但字段不合规时，`configSchema.safeParse` 失败立即记录错误日志，并将整对象重置为默认值落盘：

```ts
private loadConfig(): AppConfig {
  if (!this.store) return { ...DEFAULT_CONFIG };
  const parsed = configSchema.safeParse(this.store.store);
  if (parsed.success) return parsed.data;

  // 校验失败即自愈：记录 issues 并整对象覆盖坏文件
  this.logError('Config reset to defaults: on-disk config failed schema validation:', parsed.error.issues);
  try {
    this.store.store = { ...DEFAULT_CONFIG };
  } catch (error) {
    this.logWarn('Config write failed:', error);
  }
  return { ...DEFAULT_CONFIG };
}
```

配置变更由 `ConfigService` 统一分发，触发原生副作用（如主题切换、托盘多语言重绘）并通过 `broadcast(IPC_CHANNELS.CONFIG_EVENT_CHANGED, updated)` 实时通知全部渲染窗口。

## 3. 桌面端避坑注意事项

- **Service 内持有 Store 严禁在构造函数立即求值**：
  - 业务 Service（如 `CounterService`）若需读写配置，必须在具体方法调用时懒加载 `getAppConfigStore()`，切勿在模块顶层 `new Service()` 构造期直接读取，避免与主进程模块初始化时序冲突。
- **写入路径采用“整对象替换”清理死键**：
  - 写入配置时使用 `this.store.store = this.config` 进行整对象赋值，可顺带清理掉磁盘上旧版本遗留的无用垃圾字段，保持 `config.json` 干净。
- **构建期配置与运行期偏好严格分离**：
  - `userData/config.json` 仅承载用户运行期偏好，构建配置（tsconfig、Biome、Vite）属于静态资产，绝对不进用户存储目录。
