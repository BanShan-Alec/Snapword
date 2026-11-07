/**
 * 安全策略常量（主进程独占）
 *
 * 允许通过 shell.openExternal 打开的外部域名白名单。
 * 渲染进程的示例链接只是演示 UI，真正的准入判定始终在这里。
 */
export const ALLOWED_EXTERNAL_URLS = [
  'https://github.com',
  'https://vite.dev',
  'https://react.dev',
] as const;
