---

title: 本地日志（Electron-log）
description: 主进程与渲染窗口日志分文件落盘与独立归档，安全预处理与滑窗限流保护。
---

# 本地日志（Electron-log）

> **TL;DR**：主进程日志（`main.log`）、渲染窗口日志（`renderer-<name>.log`）与遥测拓扑（`traces.ndjson`）按职责分文件独立落盘与大小轮转；Preload 提供克隆安全的日志桥，主进程施加滑窗限流防止刷爆磁盘。

## 1. 选型理由

生产环境没有 Chrome DevTools，原生 `console.log` 随着进程销毁荡然无存：
1. **进程时序混淆**：若所有窗口和主进程的日志全混在一个文件里，并发异步调用极易让日志穿插错乱。
2. **失控死循环刷爆磁盘**：若渲染进程因 React 状态死循环疯狂打印，短时间内即可写入数 GB 日志，直接挤爆用户系统盘。

工程依托 `electron-log` 构建分级落盘与背压保护系统。

## 2. 核心机制

### 分文件独立轮转与异常捕获

→ 源码：[packages/main/src/modules/log.module.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/log.module.ts)

```ts
// 1. 主进程日志（上限 5MB，超出归档轮转，保留 7 天最多 5 份）
this.mainLogger.transports.file.fileName = 'main.log';
this.mainLogger.transports.file.maxSize = 5 * 1024 * 1024;
this.mainLogger.transports.file.archiveLogFn = createCustomArchiveLogFn();

// 2. 遥测拓扑日志（NDJSON 独立文件）
this.traceLogger.transports.file.fileName = 'traces.ndjson';
this.traceLogger.transports.file.maxSize = 10 * 1024 * 1024;

// 3. 全局未捕获异常自动落盘
this.mainLogger.errorHandler.startCatching({
  showDialog: false,
  onError: ({ error }) => {
    this.mainLogger.error('[Uncaught Exception]', error);
  },
});
```

### 渲染端日志桥与滑窗节流保护

Preload 对参数进行安全脱敏（消除函数、循环引用与超深对象），主进程提供滑窗节流拦截：

→ 源码：[packages/preload/src/logger.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/preload/src/logger.ts) · [packages/main/src/services/diagnostics.service.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/services/diagnostics.service.ts)

```ts
// Preload 侧实现双写：DevTools 原生控制台 + 异步落盘通道（fire-and-forget）
nativeConsole[level](message, ...cleanArgs);
const payload: LogInput = { level, message, args: toCloneSafeArgs(cleanArgs), traceId, spanId };
void ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_LOG, payload).catch(() => {});
```

主进程施加滑窗限流：**单窗口每秒最多准入 50 条日志**，超限时主动丢弃并在恢复时汇总一条告警（`Dropped N renderer log line(s)`），单行超过 2000 字符自动截断。

## 3. 桌面端避坑注意事项

- **业务代码禁止裸调 log 实例**：
  - 主进程打日志必须通过 `getLogManager().scoped(this)` 创建带 `[模块名]` 前缀的 Logger，开发态 `debug` 生效，生产打包自动剔除 `debug` 细节。
- **渲染端严禁裸写 `console.log`**：
  - 生产打包后 `console` 等同于丢弃。页面业务日志统一调用全局 `window.logger.info()`、`logger.error()`。
- **日志管道自身绝不抛出异常**：
  - 日志管道属于辅助可观测性基座，写入失败必须通过 try/catch 默默消化，严禁向业务调用方反向抛错导致核心业务中断。
