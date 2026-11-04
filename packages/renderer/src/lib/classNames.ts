import { clsx } from 'clsx';

const STATUS_BOX_BASE =
  'p-3 bg-background-sunken border border-border rounded-lg text-xs font-mono text-foreground select-text';

/**
 * 诊断类卡片（DevTools / 日志 / 原生对话框）共用的状态输出框。
 * 默认不回折长文本；仅原生对话框需要展示超长绝对路径，需显式开启 breakAll。
 */
export function statusBoxClass(options?: { breakAll?: boolean }) {
  return clsx(STATUS_BOX_BASE, { 'break-all': options?.breakAll });
}
