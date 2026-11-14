import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import type { TranslationHistoryItem } from '@app/shared/schemas/history';
import { broadcast } from '../modules/window/window-registry';

/**
 * 翻译历史内存共享服务 (RM-04 / IA-14/15/26/27)
 * 仅保留本次运行最近 20 条记录，退出应用即清空
 */
export class TranslationHistoryService {
  private history: TranslationHistoryItem[] = [];
  private readonly maxItems = 20;

  addRecord(item: TranslationHistoryItem): void {
    this.history = [item, ...this.history.filter((h) => h.id !== item.id)].slice(0, this.maxItems);
    this.broadcastChanged();
  }

  getRecords(): TranslationHistoryItem[] {
    return [...this.history];
  }

  deleteRecord(id: string): boolean {
    const prevLen = this.history.length;
    this.history = this.history.filter((h) => h.id !== id);
    const deleted = this.history.length < prevLen;
    if (deleted) {
      this.broadcastChanged();
    }
    return deleted;
  }

  clearRecords(): void {
    this.history = [];
    this.broadcastChanged();
  }

  private broadcastChanged(): void {
    try {
      broadcast(IPC_CHANNELS.HISTORY_EVENT_CHANGED, this.getRecords());
    } catch {
      // 在无窗口环境或单元测试中容错静默
    }
  }
}

export const translationHistoryService = new TranslationHistoryService();
