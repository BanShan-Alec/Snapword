# 落盘日志语言与用词规范 (English-Only Logging Specification)

在本项目中，所有持久化写入磁盘日志（包括 `main.log`、`renderer-<window>.log`、`electron-log` 以及 `LogManager` / `ScopedLogger`）的代码必须严格遵循以下原则：

## 1. 强制纯英文（English Only）

- **禁止中文**：落盘日志消息字符串必须使用纯英文，严禁写入中文字符或中英夹杂。
- **与 UI 解耦**：用户可见的页面文案、弹窗对话框、系统 Notification 提示走 i18n 多语言体系，但后台落盘日志必须始终为英文。

## 2. 用词简单常用（Simple & Standard Vocabulary）

- 选用高频、通用的技术英语单词，杜绝生僻词或复杂语法结构。
- 动词推荐：
  - 初始化与生命周期：`init`, `start`, `stop`, `ready`, `create`, `destroy`, `restore`, `close`, `hide`, `quit`
  - 成功与失败：`success`, `failed`, `skipped`, `intercepted`, `timeout`
  - 交互与传输：`send`, `receive`, `push`, `emit`, `listen`, `register`, `request`

## 3. 句子简短易懂（Concise & Direct Sentences）

- 保持句子精炼（建议 3~10 个词），优先使用祈使句或现在完成时动宾短语。
- 统一错误日志句式：`Failed to <action>: <reason>` 或 `Cannot <action>: <reason>`。

## 4. 示例对比

### ❌ 错误示范

```ts
logger.info('[Sentry] 主进程初始化成功（仅打包采集 + 行为/性能监控已禁用）');
logger.warn('获取无响应窗口 URL 失败:', err);
logger.error('渲染进程非预期退出:', details);
```

### ✅ 正确示范

```ts
logger.info('Sentry initialized successfully');
logger.warn(`Failed to get URL for unresponsive window (id=${window.id}):`, err);
logger.error(`Renderer process gone unexpectedly: reason=${details.reason}`);
```

## 5. 渲染进程叙事纪律（全局 logger）

- **生命周期事件记 info**：窗口创建（`Window started`，主进程在创建窗口时写入 `renderer-<window>.log`，每窗口一次）、文档加载（`Document started`，两个 entry 各一行，每次 reload 各一行）、路由切换（`Route changed`，每次路径变化一行）、ErrorBoundary 崩溃（error 级，message 带崩溃组件名，附 `componentStack`）。
- **用户动作只记操作结果**：成功/失败各一行，不记意图与参数；本地路径、URL、业务数据一律不入日志。
- **走 IPC 的动作只补成功行**：失败已被 `lib/ipc.ts` 的 `logIpc` 中心化记录（channel + 耗时 + 错误文案），feature 层再记即双写。
- **错误态呈现必须记行（铁律「UI 有错 ⇒ 渲染日志必有行」）**：错误经事件推送或初始快照到达（如 updater 的 `state === 'error'`），不存在调用失败行，消费方必须补一行呈现日志（error 态记 warn）；它与同一失败的调用失败行并存属预期语义，不算双写。
- **主进程 service 层已叙事的事件不重复记**：config 变更、更新检查/可用/下载等主进程已有 info 日志，渲染层不碰。
- **debug 级仅开发构建生效**：渲染 `logger.debug` 与主进程 `scoped().debug` 在生产构建均 no-op。

## 6. 跨进程排障链路（trace_id 约定）

- **invoke 主干已通**：走 `callIpc` 的调用失败，渲染失败行（`logIpc`）、主进程同一调用的日志行（AsyncLocalStorage 注入）、`traces.ndjson` span 三处共用同一 trace_id，凭行内 `[trace_id:...]` 互查。
- **事件推送路径无 trace**：不经 invoke 的错误（如 `updater:event:state` 推送）其呈现行不带 trace_id、不产生 span，真实原因按写入点文案到 `main.log` 检索（降级查法）。
- **主进程背景异步无 trace 属预期**：electron-updater 事件回调、定时器等不在任何 invoke 上下文内，按写入点文案检索即可。
- **启动静默降级必须有行**：UI 静默回落默认值（如 `config.get` 失败不弹窗）时，落盘日志是唯一痕迹，不得空吞——这是「UI 有错必有行」铁律在无提示侧的对偶。

## 7. 渲染层 IPC 调用合规基线（2026-10-24 全量审计）

全仓 26 个 `window.api.*` 调用点的合规基线；新增调用一律经 `callIpc`/`useIpc`（`lib/ipc.ts` 头注释纪律：禁止裸调 + 自行消费 Result），code review 按此核对：

| 类别              | 数量 | 失败日志                                        | UI 反馈                   |
| ----------------- | ---- | ----------------------------------------------- | ------------------------- |
| callIpc 直用      | 11   | `logIpc` 自动落盘                               | 调用方 onError 提供       |
| useIpc hook       | 6    | 同上                                            | 同上，附带 loading 状态机 |
| 事件订阅（onXxx） | 3    | 失败语义由快照承载，消费方记呈现行              | 随快照状态渲染            |
| fire-and-forget   | 2    | `callIpc` + 空 catch（如 `shell.openExternal`） | 不打扰用户                |
| 同步读取          | 1    | 不适用（`usePlatform`，非 Result）              | 不适用                    |

裸调违规于 2026-10-24 审计后清零（修复见 PR #54、#55）。

## 8. 异常上报约定（Sentry）

落盘日志与 Sentry 上报是两条独立链路：日志全量留在本地，Sentry 只收需要跨用户聚合的异常。判断标准：

| 场景                                         |       上报 Sentry       | 日志级别 |
| -------------------------------------------- | :---------------------: | :------: |
| 未捕获的全局崩溃 / OOM                       | ✅ 必报（SDK 自动托管） | `error`  |
| 底层硬件 / 驱动不可逆故障（如 USB 枚举崩溃） |         ✅ 上报         | `error`  |
| 文件读写权限异常 / IO 崩溃                   |         ✅ 上报         | `error`  |
| 表单校验未通过（`VALIDATION_ERROR`）         |         ❌ 不报         |  `warn`  |
| 用户主动取消对话框 / 取消升级                |         ❌ 不报         |  `info`  |
| 接口网络超时（偶发重试成功）                 |         ❌ 不报         |  `warn`  |

- **上报必须带分组信息**：`tags.domain`（业务域，如 `hardware.usb`）、平台字段，以及 `extra.traceId` / `extra.code`——云端异常与本地日志靠 trace_id 对账。
- **IPC 级别随错误码**：主进程 IPC 失败的日志级别由 `ipc-tracer` 按 `ErrorCode` 决定，业务层不要重复定级，也不要手写数字状态码。
- **展示脱敏、日志留存**：底层错误串只进日志；界面呈现走 i18n 文案，不得把原始错误串直接抛给用户。
