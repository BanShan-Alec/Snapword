import type { CaptureConfigSnapshot } from '@app/shared/types/capture-protocol';

/**
 * 取词服务配置快照（B-02 §2.4）的主进程侧事实源。
 *
 * P4 骨架：设置页尚未落地（P5），先提供契约默认值；revision 从 0 起，
 * 之后每次通过 CaptureServiceManager.updateConfig() 下发时单调递增。
 * 取词服务只接受 revision 更大的快照（B-02 §2.4）。
 */
export function createDefaultCaptureConfig(): CaptureConfigSnapshot {
  return {
    revision: 0,
    whitelist: ['chrome.exe', 'msedge.exe'],
    dotEnabled: true,
    fullscreenSuppress: true,
    captureTimeoutMs: 500,
    dedupeWindowMs: 300,
    minEnglishRatio: 0.3,
    maxTextChars: 20_000,
    paragraphReadLimit: 2_000,
    contextMaxChars: 300,
  };
}
