import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { DipPoint, DipRect, SelectionPayload } from '@app/shared/schemas/capture';
import { MockSelectionEmitter } from './mock-selection-emitter';

export interface NativeProbeResult {
  success: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  source: 'hotkey' | 'dot';
  seq: number;
  text: string;
  textTruncated: boolean;
  rects: DipRect[];
  anchor: DipPoint;
  pointer: DipPoint;
  processName: string;
  processId: number;
  windowTitle: string;
  paragraph: string;
  paragraphError?: string | null;
  paragraphTruncated: boolean;
  capturedAt: string;
  elapsedMs: number;
  dpiScale: number;
  coordinateSpace: 'dip';
  selectionRanges: number;
  isEnglish: boolean;
  warnings: string[];
}

export interface NativeForegroundInfo {
  processName: string;
  processId: number;
  windowTitle: string;
  isFullscreen: boolean;
}

export interface NativeDiagnoseResult {
  uiaAvailable: boolean;
  hookInstalled: boolean;
  dotVisible: boolean;
  foreground?: NativeForegroundInfo | null;
  addonVersion: string;
  osVersion: string;
  dpiScale: number;
  warnings: string[];
}

export interface NativeDotEvent {
  eventType: 'clicked' | 'hidden' | 'foreground_changed';
  seq: number;
  reason?: string;
  payload?: NativeProbeResult;
  foreground?: NativeForegroundInfo;
}

export interface INativeAddon {
  readonly isMock: boolean;
  probeSelection(timeoutMs?: number): NativeProbeResult;
  probeSelectionDetailed(timeoutMs?: number, windowTitle?: string): NativeProbeResult;
  probeExpandUnits(
    timeoutMs?: number,
    windowTitle?: string,
  ): Array<{ unitName: string; charCount: number; textSample: string }>;
  probeRangeFromPoint(
    x: number,
    y: number,
    timeoutMs?: number,
    windowTitle?: string,
  ): NativeProbeResult;
  startDot(callback: (event: NativeDotEvent) => void): void;
  stopDot(): void;
  hideDot(): void;
  diagnose(): NativeDiagnoseResult;
}

/**
 * 真实 Rust 原生 N-API Addon 适配包装类
 */
export class RealNativeAdapter implements INativeAddon {
  public readonly isMock = false;
  // biome-ignore lint/suspicious/noExplicitAny: native binding interface
  private readonly raw: any;

  // biome-ignore lint/suspicious/noExplicitAny: native binding interface
  constructor(rawAddon: any) {
    this.raw = rawAddon;
  }

  public probeSelection(timeoutMs?: number): NativeProbeResult {
    return this.raw.probeSelection(timeoutMs);
  }

  public probeSelectionDetailed(timeoutMs?: number, windowTitle?: string): NativeProbeResult {
    return this.raw.probeSelectionDetailed(timeoutMs, windowTitle);
  }

  public probeExpandUnits(
    timeoutMs?: number,
    windowTitle?: string,
  ): Array<{ unitName: string; charCount: number; textSample: string }> {
    return this.raw.probeExpandUnits(timeoutMs, windowTitle);
  }

  public probeRangeFromPoint(
    x: number,
    y: number,
    timeoutMs?: number,
    windowTitle?: string,
  ): NativeProbeResult {
    return this.raw.probeRangeFromPoint(x, y, timeoutMs, windowTitle);
  }

  public startDot(callback: (event: NativeDotEvent) => void): void {
    this.raw.startDot(callback);
  }

  public stopDot(): void {
    this.raw.stopDot();
  }

  public hideDot(): void {
    this.raw.hideDot();
  }

  public diagnose(): NativeDiagnoseResult {
    return this.raw.diagnose();
  }
}

/**
 * Mock 降级适配器：在无 MSVC/Rust 编译环境或非 Windows 平台时保证测试与 CI 100% 顺畅执行
 */
export class MockNativeAdapter implements INativeAddon {
  public readonly isMock = true;
  private readonly mockEmitter = new MockSelectionEmitter();
  private dotVisible = false;
  private dotCallback: ((event: NativeDotEvent) => void) | null = null;
  private seq = 1;

  public probeSelection(_timeoutMs?: number): NativeProbeResult {
    const mock = this.mockEmitter.createMockSelection({ source: 'hotkey' });
    return {
      success: true,
      errorCode: null,
      errorMessage: null,
      source: 'hotkey',
      seq: this.seq++,
      text: mock.text,
      textTruncated: mock.textTruncated,
      rects: mock.rects,
      anchor: mock.anchor,
      pointer: mock.pointer,
      processName: mock.processName,
      processId: mock.processId,
      windowTitle: mock.windowTitle,
      paragraph: mock.paragraph,
      paragraphError: mock.paragraphError,
      paragraphTruncated: mock.paragraphTruncated,
      capturedAt: mock.capturedAt,
      elapsedMs: mock.elapsedMs,
      dpiScale: mock.dpiScale,
      coordinateSpace: 'dip',
      selectionRanges: mock.selectionRanges,
      isEnglish: true,
      warnings: [],
    };
  }

  public probeSelectionDetailed(timeoutMs?: number, _windowTitle?: string): NativeProbeResult {
    return this.probeSelection(timeoutMs);
  }

  public probeExpandUnits(
    _timeoutMs?: number,
    _windowTitle?: string,
  ): Array<{ unitName: string; charCount: number; textSample: string }> {
    return [
      { unitName: 'Word', charCount: 6, textSample: 'thread' },
      {
        unitName: 'Paragraph',
        charCount: 40,
        textSample: 'A long thread about distributed systems.',
      },
    ];
  }

  public probeRangeFromPoint(
    x: number,
    y: number,
    timeoutMs?: number,
    _windowTitle?: string,
  ): NativeProbeResult {
    const res = this.probeSelection(timeoutMs);
    res.pointer = { x, y };
    return res;
  }

  public startDot(callback: (event: NativeDotEvent) => void): void {
    this.dotCallback = callback;
    this.dotVisible = true;
  }

  public stopDot(): void {
    this.dotVisible = false;
    this.dotCallback = null;
  }

  public hideDot(): void {
    if (this.dotVisible) {
      this.dotVisible = false;
      this.dotCallback?.({
        eventType: 'hidden',
        seq: this.seq,
        reason: 'outside_click',
      });
    }
  }

  public diagnose(): NativeDiagnoseResult {
    return {
      uiaAvailable: true,
      hookInstalled: true,
      dotVisible: this.dotVisible,
      foreground: {
        processName: 'chrome.exe',
        processId: 12345,
        windowTitle: 'Example — Google Chrome',
        isFullscreen: false,
      },
      addonVersion: '1.0.0-mock',
      osVersion: process.platform,
      dpiScale: 1.0,
      warnings: [],
    };
  }

  /**
   * 测试辅助：模拟触发圆点点击
   */
  public triggerMockDotClick(override?: Partial<SelectionPayload>): void {
    if (this.dotCallback) {
      const seq = override?.seq ?? this.seq++;
      const mock = this.mockEmitter.createMockSelection({
        source: 'dot',
        ...override,
      });
      mock.seq = seq;

      const probeRes: NativeProbeResult = {
        success: true,
        errorCode: null,
        errorMessage: null,
        source: 'dot',
        seq,
        text: mock.text,
        textTruncated: mock.textTruncated,
        rects: mock.rects,
        anchor: mock.anchor,
        pointer: mock.pointer,
        processName: mock.processName,
        processId: mock.processId,
        windowTitle: mock.windowTitle,
        paragraph: mock.paragraph,
        paragraphError: mock.paragraphError,
        paragraphTruncated: mock.paragraphTruncated,
        capturedAt: mock.capturedAt,
        elapsedMs: mock.elapsedMs,
        dpiScale: mock.dpiScale,
        coordinateSpace: 'dip',
        selectionRanges: mock.selectionRanges,
        isEnglish: true,
        warnings: mock.warnings,
      };

      this.dotCallback({
        eventType: 'clicked',
        seq,
        payload: probeRes,
      });
    }
  }
}

/**
 * 解析并定位原生 Addon 路径候选集
 */
export function resolveNativeAddonCandidates(): string[] {
  const candidates: string[] = [];

  // 1. 打包生产环境 app.asar.unpacked/native/uia-probe.node
  if (typeof process !== 'undefined' && process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'uia-probe.node'),
    );
    candidates.push(
      path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@app',
        'main',
        'dist',
        'native',
        'uia-probe.node',
      ),
    );
  }

  // 2. 本地构建产物 main/dist/native/uia-probe.node
  candidates.push(path.join(__dirname, 'native', 'uia-probe.node'));
  candidates.push(path.join(__dirname, '..', 'native', 'uia-probe.node'));
  candidates.push(path.join(process.cwd(), 'packages', 'main', 'dist', 'native', 'uia-probe.node'));

  // 3. Cargo 编译输出目录
  candidates.push(path.join(process.cwd(), 'native', 'target', 'release', 'uia_probe_addon.dll'));
  candidates.push(path.join(process.cwd(), 'native', 'target', 'debug', 'uia_probe_addon.dll'));

  return candidates;
}

export interface LoadNativeAddonOptions {
  forceMock?: boolean;
}

/**
 * 加载原生 Addon 或无缝降级为 Mock Adapter
 */
export function loadNativeAddon(options?: LoadNativeAddonOptions): INativeAddon {
  if (
    options?.forceMock ||
    process.env.SNAPWORD_NATIVE_MOCK === '1' ||
    (process.env.VITEST && !process.env.SNAPWORD_FORCE_NATIVE && options?.forceMock !== false)
  ) {
    return new MockNativeAdapter();
  }

  if (process.platform !== 'win32') {
    return new MockNativeAdapter();
  }

  const candidates = resolveNativeAddonCandidates();
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const dynamicRequire = createRequire(import.meta.url);
        const addon = dynamicRequire(candidate);
        if (addon && typeof addon.probeSelection === 'function') {
          return new RealNativeAdapter(addon);
        }
      } catch (err) {
        // 继续尝试下一个候选路径
        console.warn(`[native-addon] Failed to load native addon from ${candidate}:`, err);
      }
    }
  }

  // 未找到或加载失败时降级
  return new MockNativeAdapter();
}
