---

title: 国际化文案规范（Copy）
description: 英文优先短短语：R1–R11 规则、术语表、长度预算与真实 before/after。
---

# 国际化文案规范（Copy）

> **TL;DR**：英文优先短句/短语，不逐字对译；按钮 ≤3 词、卡片标题 ≤5 词、说明句 ≤12 词，统一 Sentence case。

适用范围：`zh-CN` 源文案与 `en-US` 译文。规则与工具无关；本仓用 Lingui 落地，机制与选型见 [国际化（i18n）](/ui/i18n)。

## 四条原则

**Useful / Concise / Human / Clear**——有用、短、像人话、说得清。其中 Concise 是硬约束：界面空间有限，英文长度直接决定布局是否成立。

## 规则

| #   | 规则                       | 判定方法                                                                                                 |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| R1  | 短语优先                   | 按钮/标签 ≤3 词，卡片标题 ≤5 词，说明句 ≤12 词                                                           |
| R2  | 动词开头                   | 按钮用动词短语（Check for updates），不用名词化（Perform a check）                                       |
| R3  | 删冗余                     | 去掉 please / successfully / currently / just / simply / your；标题不重复上下文                          |
| R4  | 术语固定                   | IPC、main process、renderer、preload、updater、tray、contract；产品名（Electron、Zod、V8、Sentry）保原样 |
| R5  | Sentence case              | 首词大写，专名与缩写按 R4；短标签无句号，整句有句号                                                      |
| R6  | 复数走 ICU                 | 不写 "(s)"，用 `plural` 宏                                                                               |
| R7  | 不拼接                     | 译文不与动态值用 `+` 拼接；占位符用具名 `{path}` 而不是 `{0}`                                            |
| R8  | 单位紧凑                   | `12 min` / `5 MB`；完整句子中写全称                                                                      |
| R9  | 可省略中文括号里的实现名词 | `(ConfigStore)`、`(Theme)` 在英文里可删；中文源不动                                                      |
| R10 | 平台中立                   | 不写 Explorer / Finder，统一 "Show in folder"                                                            |
| R11 | 不译清单                   | 产品名、协议名、代码标识符、文件路径、单位缩写、VID/PID 原样保留                                         |

## 长度预算

review 时的目标值，不进门禁（`.po` 没有槽位元数据，自动检查误报高）：

| 槽位               | 上限    |
| ------------------ | ------- |
| 按钮 / 标签 / 导航 | 20 字符 |
| 卡片标题           | 28 字符 |
| 卡片副标题         | 55 字符 |
| 状态标签           | 18 字符 |
| Toast / 错误行     | 80 字符 |

## 术语表

| 中文              | English        |
| ----------------- | -------------- |
| 主进程            | main process   |
| 渲染进程 / 渲染端 | renderer       |
| 预加载            | preload        |
| 托盘              | tray           |
| 更新器            | updater        |
| 契约              | contract       |
| 类型安全          | type-safe      |
| 校验              | validation     |
| 落盘              | write to disk  |
| 轮转              | rotation       |
| 定位              | show in folder |
| 看板              | dashboard      |
| 架构全貌          | architecture   |
| 偏好设置          | preferences    |

## Before / After

| 中文源（不动）                                        | 改前                                                                                  | 改后                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 应用偏好设置 (ConfigStore)                            | Preferences (ConfigStore)                                                             | Preferences                                                          |
| 系统与运行环境                                        | System & Runtime Environment                                                          | Runtime environment                                                  |
| 进程间通信 (IPC Ping)                                 | Inter-Process Communication (IPC Ping)                                                | IPC ping                                                             |
| 企业级端到端类型安全桌面客户端脚手架                  | Enterprise-Grade End-to-End Type-Safe Desktop Client Boilerplate                      | Type-safe desktop starter                                            |
| 代码耦合 & 契约混乱                                   | Coupled Code & Messy Contracts                                                        | Coupled and messy                                                    |
| 物理隔离 & Result 契约                                | Physical Isolation & Result Contract                                                  | Isolated and typed                                                   |
| Zod 严格模式入参校验与语义化错误码 Result 契约        | Strict Zod Schema Validation & Semantic Error Code Result Contract                    | Strict Zod validation with typed error codes                         |
| 检查最新版本与下载安装                                | Check latest version, download and install                                            | Check, download, and install                                         |
| 当前安装的应用已包含所有最新功能与安全更新。          | The currently installed app includes all the latest features and security updates.    | You're on the latest version.                                        |
| 正在与更新服务器建立连接，请稍候...                   | Connecting to update server, please wait...                                           | Connecting to the update server…                                     |
| 无法读取部分 USB 设备描述符，请检查设备连接或系统权限 | Failed to read USB device descriptors. Please check device connection or permissions. | Couldn't read some USB devices. Check the connection or permissions. |
| 在资源管理器中定位                                    | Reveal in Explorer                                                                    | Show in folder                                                       |
| 检查更新                                              | Check for Updates                                                                     | Check for updates                                                    |
| 恢复默认值                                            | Restore Defaults                                                                      | Restore defaults                                                     |
| 显示主窗口                                            | Show Main Window                                                                      | Show main window                                                     |

## Review checklist

1. 译文能不能再短一个词？
2. 有没有 `please` / `successfully` / `currently` / `your`？
3. 术语和大小写是否与术语表一致？
4. 短标签有没有句号？整句有没有漏句号？
5. 放进最窄的槽位（卡片标题 ≈28 字符）是否还完整？

## 机器门禁

- `pnpm i18n:extract`：改完源码文案后重新抽词条。
- `pnpm i18n:check`：缺译即非零退出（CI 已接入）。
- `pnpm verify:prebuild`：拦截空译文与译文中的中文残留。
