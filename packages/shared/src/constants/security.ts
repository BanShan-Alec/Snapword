/**
 * 安全策略常量（主进程独占）
 *
 * 允许通过 shell.openExternal 打开的外部域名白名单。
 * P4 骨架阶段为空集：渲染层当前没有外链入口；
 * 后续接入帮助页/官网链接时在此登记，准入判定始终在主进程 external-urls 模块。
 */
export const ALLOWED_EXTERNAL_URLS = [] as const;
