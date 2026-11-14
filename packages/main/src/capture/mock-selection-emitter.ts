import type { DipPoint, DipRect, SelectionPayload } from '@app/shared/schemas/capture';

export interface MockSelectionOptions {
  source?: 'hotkey' | 'dot';
  text?: string;
  paragraph?: string;
  processName?: string;
  processId?: number;
  windowTitle?: string;
  rects?: DipRect[];
  anchor?: DipPoint;
  pointer?: DipPoint;
  dpiScale?: number;
  elapsedMs?: number;
  warnings?: string[];
}

/**
 * Mock 选区发射器 (MockSelectionEmitter)
 * 在缺少 Native Addon 环境下派发符合 B-02 IPC 协议与 DIP 屏幕坐标系规范的模拟数据
 */
export class MockSelectionEmitter {
  private currentSeq = 0;

  /**
   * 获取递增序号
   */
  public nextSeq(): number {
    this.currentSeq += 1;
    return this.currentSeq;
  }

  /**
   * 当前序号
   */
  public getSeq(): number {
    return this.currentSeq;
  }

  /**
   * 重置序号（主要供测试使用）
   */
  public resetSeq(): void {
    this.currentSeq = 0;
  }

  /**
   * 生成符合 DIP 规范的标准模拟选区数据
   */
  public createMockSelection(options?: MockSelectionOptions): SelectionPayload {
    const seq = this.nextSeq();
    const source = options?.source ?? 'hotkey';
    const text = options?.text ?? 'Snapword';
    const paragraph =
      options?.paragraph ??
      'Snapword is an efficient, context-aware smart dictionary and translation tool.';
    const processName = options?.processName ?? 'chrome.exe';
    const processId = options?.processId ?? 12345;
    const windowTitle = options?.windowTitle ?? 'GitHub — Snapword Project';
    const dpiScale = options?.dpiScale ?? 1.0;
    const elapsedMs = options?.elapsedMs ?? 15.0;

    // DIP 屏幕坐标模拟：左上角 (512, 320)，宽度 48，高度 22
    const rects: DipRect[] = options?.rects ?? [{ x: 512, y: 320, width: 48, height: 22 }];

    // 锚点规则（B-02 §2.2）：最后一个 rect 的左下角向下 8 DIP
    const lastRect = rects[rects.length - 1];
    const anchor: DipPoint = options?.anchor ?? {
      x: lastRect.x,
      y: lastRect.y + lastRect.height + 8,
    };

    // 鼠标释放点 (DIP)
    const pointer: DipPoint = options?.pointer ?? {
      x: lastRect.x + lastRect.width / 2,
      y: lastRect.y + lastRect.height / 2,
    };

    return {
      source,
      seq,
      text,
      textTruncated: false,
      rects,
      anchor,
      pointer,
      processName,
      processId,
      windowTitle,
      paragraph,
      paragraphError: null,
      paragraphTruncated: false,
      capturedAt: new Date().toISOString(),
      elapsedMs,
      dpiScale,
      coordinateSpace: 'dip',
      selectionRanges: 1,
      warnings: options?.warnings ?? [],
    };
  }
}
