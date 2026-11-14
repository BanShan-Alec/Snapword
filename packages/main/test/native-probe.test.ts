import fs from 'node:fs';
import { CAPTURE_PROTOCOL_VERSION } from '@app/shared/schemas/capture';
import { describe, expect, it } from 'vitest';
import { CaptureService, type MessagePortLike } from '../src/capture/capture-service';
import {
  calculateDotPosition,
  DOT_APPEAR_BUDGET_MS,
  DOT_DEBOUNCE_MS,
  DOT_HIT_SIZE,
  DOT_OFFSET,
  DOT_VISUAL_SIZE,
} from '../src/capture/dot-geometry';
import {
  type INativeAddon,
  loadNativeAddon,
  MockNativeAdapter,
  type NativeDotEvent,
  RealNativeAdapter,
  resolveNativeAddonCandidates,
} from '../src/capture/native-addon';

class TestPort implements MessagePortLike {
  public readonly postedMessages: unknown[] = [];
  private listener: ((event: unknown) => void) | null = null;

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }

  on(event: 'message', listener: (event: unknown) => void): this {
    if (event === 'message') {
      this.listener = listener;
    }
    return this;
  }

  off(event: 'message', listener: (event: unknown) => void): this {
    if (event === 'message' && this.listener === listener) {
      this.listener = null;
    }
    return this;
  }

  emit(data: unknown): void {
    if (this.listener) {
      this.listener({ data });
    }
  }
}

describe('Slice-06: Native UIA Probe & Win32 Layered Dot Window', () => {
  describe('1. Dot Geometry & Boundary Flipping (RD-01 / IA-01)', () => {
    const screenWidth = 1920;
    const screenHeight = 1080;

    it('defines correct visual size (10px) and hit area (24px)', () => {
      expect(DOT_VISUAL_SIZE).toBe(10);
      expect(DOT_HIT_SIZE).toBe(24);
      expect(DOT_OFFSET).toBe(8);
      expect(DOT_DEBOUNCE_MS).toBe(300);
      expect(DOT_APPEAR_BUDGET_MS).toBe(120);
    });

    it('positions dot at selection bottom-right (Priority 1) when space allows', () => {
      const rect = { x: 500, y: 300, width: 100, height: 20 };
      const pointer = { x: 600, y: 320 };

      const pos = calculateDotPosition(rect, pointer, screenWidth, screenHeight);
      expect(pos).toEqual({
        x: 500 + 100 + 8, // 608
        y: 300 + 20 + 8, // 328
      });
    });

    it('flips to selection top-left (Priority 2) when bottom-right overflows screen', () => {
      // Selection at bottom-right corner of screen
      const rect = { x: 1850, y: 1060, width: 50, height: 15 };
      const pointer = { x: 1900, y: 1075 };

      const pos = calculateDotPosition(rect, pointer, screenWidth, screenHeight);
      expect(pos).toEqual({
        x: 1850 - 24 - 8, // 1818
        y: 1060 - 24 - 8, // 1028
      });
    });

    it('flips to selection right-center (Priority 3) when bottom overflows but top is tight', () => {
      const rect = { x: 500, y: 1070, width: 80, height: 20 };
      const pointer = { x: 580, y: 1080 };

      const pos = calculateDotPosition(rect, pointer, screenWidth, screenHeight);
      // y1 (1070+20+8=1098 > 1080) -> overflows
      // y2 (1070-24-8=1038) -> check right-center or top-left
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.x + 24).toBeLessThanOrEqual(screenWidth);
      expect(pos.y + 24).toBeLessThanOrEqual(screenHeight);
    });

    it('falls back to screen center (Priority 5) on extreme boundary overflow', () => {
      const hugeRect = { x: -10, y: -10, width: 2000, height: 1200 };
      const pointer = { x: 1950, y: 1100 };

      const pos = calculateDotPosition(hugeRect, pointer, screenWidth, screenHeight);
      expect(pos).toEqual({
        x: (1920 - 24) / 2, // 948
        y: (1080 - 24) / 2, // 528
      });
    });
  });

  describe('2. Native Addon Discovery & Real/Mock Adapter Lifecycle', () => {
    it('resolves standard candidate paths for uia-probe.node', () => {
      const candidates = resolveNativeAddonCandidates();
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some((c) => c.endsWith('uia-probe.node'))).toBe(true);
    });

    it('MockNativeAdapter provides consistent interface and mock selections', () => {
      const mockAdapter = new MockNativeAdapter();
      expect(mockAdapter.isMock).toBe(true);

      const probe = mockAdapter.probeSelection(500);
      expect(probe.success).toBe(true);
      expect(probe.source).toBe('hotkey');
      expect(probe.text.length).toBeGreaterThan(0);
      expect(probe.rects.length).toBeGreaterThan(0);
      expect(probe.coordinateSpace).toBe('dip');
      expect(probe.isEnglish).toBe(true);

      const diag = mockAdapter.diagnose();
      expect(diag.uiaAvailable).toBe(true);
      expect(diag.addonVersion).toBe('1.0.0-mock');

      const units = mockAdapter.probeExpandUnits(500);
      expect(units.length).toBe(2);
      expect(units[0].unitName).toBe('Word');
      expect(units[1].unitName).toBe('Paragraph');
    });

    it('MockNativeAdapter handles dot lifecycle and click events', () => {
      const mockAdapter = new MockNativeAdapter();
      const events: NativeDotEvent[] = [];

      mockAdapter.startDot((evt) => {
        events.push(evt);
      });

      expect(mockAdapter.diagnose().dotVisible).toBe(true);

      // Trigger simulated click
      mockAdapter.triggerMockDotClick({ text: 'distributed' });
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('clicked');
      expect(events[0].payload?.text).toBe('distributed');

      // Trigger hide
      mockAdapter.hideDot();
      expect(events.length).toBe(2);
      expect(events[1].eventType).toBe('hidden');
      expect(events[1].reason).toBe('outside_click');

      mockAdapter.stopDot();
      expect(mockAdapter.diagnose().dotVisible).toBe(false);
    });

    it('RealNativeAdapter loads compiled Rust binary if available on Windows', () => {
      const candidates = resolveNativeAddonCandidates();
      const existing = candidates.find((c) => fs.existsSync(c));

      if (process.platform === 'win32' && existing) {
        // biome-ignore lint/security/noGlobalEval: Dynamic require test
        const rawAddon = eval('require')(existing);
        const realAdapter = new RealNativeAdapter(rawAddon);

        expect(realAdapter.isMock).toBe(false);
        const diag = realAdapter.diagnose();
        expect(diag.uiaAvailable).toBe(true);
        expect(diag.hookInstalled).toBe(true);
        expect(diag.osVersion).toBe('Windows');
        expect(diag.addonVersion).toBe('1.0.0');

        const probe = realAdapter.probeSelection(200);
        expect(probe).toBeDefined();
        // In headless runner, returns NoForegroundWindow or valid probe result
        expect(typeof probe.coordinateSpace).toBe('string');
      } else {
        // Fallback test
        const adapter = loadNativeAddon({ forceMock: true });
        expect(adapter.isMock).toBe(true);
      }
    });
  });

  describe('3. CaptureService with Native Integration', () => {
    it('initializes with native addon and sends addonVersion in hello packet', () => {
      const testPort = new TestPort();
      const mockAdapter = new MockNativeAdapter();
      const service = new CaptureService({
        port: testPort,
        addon: mockAdapter,
        exitOnShutdown: false,
      });

      service.start();

      const hello = testPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'hello',
      ) as { addonVersion: string; capabilities: { uia: boolean; dot: boolean } };

      expect(hello).toBeDefined();
      expect(hello.addonVersion).toBe('1.0.0-mock');
      expect(hello.capabilities.uia).toBe(true);
      expect(hello.capabilities.dot).toBe(true);

      service.stop();
    });

    it('forwards native dot click to main process as dot_clicked', () => {
      const testPort = new TestPort();
      const mockAdapter = new MockNativeAdapter();
      const service = new CaptureService({
        port: testPort,
        addon: mockAdapter,
        exitOnShutdown: false,
      });

      service.start();

      // Complete handshake
      testPort.emit({
        type: 'hello_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        configRevision: 1,
        config: service.getConfig(),
      });

      testPort.postedMessages.length = 0;

      // Trigger native dot click
      mockAdapter.triggerMockDotClick({ text: 'architecture', seq: 88 });

      const dotClickMsg = testPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'dot_clicked',
      ) as { seq: number; payload: { text: string; source: string } };

      expect(dotClickMsg).toBeDefined();
      expect(dotClickMsg.seq).toBe(88);
      expect(dotClickMsg.payload.text).toBe('architecture');
      expect(dotClickMsg.payload.source).toBe('dot');

      service.stop();
    });

    it('handles capture_current request using native addon', () => {
      const testPort = new TestPort();
      const mockAdapter = new MockNativeAdapter();
      const service = new CaptureService({
        port: testPort,
        addon: mockAdapter,
        exitOnShutdown: false,
      });

      service.start();

      testPort.emit({
        type: 'hello_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        configRevision: 1,
        config: service.getConfig(),
      });

      testPort.postedMessages.length = 0;

      testPort.emit({
        type: 'capture_current',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: 'req-test-native-1',
        reason: 'hotkey',
        timeoutMs: 500,
      });

      const result = testPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'capture_result',
      ) as { requestId: string; payload: { text: string; source: string } };

      expect(result).toBeDefined();
      expect(result.requestId).toBe('req-test-native-1');
      expect(result.payload.source).toBe('hotkey');
      expect(result.payload.text.length).toBeGreaterThan(0);

      service.stop();
    });

    it('responds to diagnose with accurate addon and foreground status', () => {
      const testPort = new TestPort();
      const mockAdapter = new MockNativeAdapter();
      const service = new CaptureService({
        port: testPort,
        addon: mockAdapter,
        exitOnShutdown: false,
      });

      service.start();
      testPort.postedMessages.length = 0;

      testPort.emit({
        type: 'diagnose',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: 'req-diag-1',
        timeoutMs: 2000,
      });

      const diagResult = testPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'diagnose_result',
      ) as {
        requestId: string;
        uiaAvailable: boolean;
        hookInstalled: boolean;
        dotVisible: boolean;
        foreground: { processName: string };
      };

      expect(diagResult).toBeDefined();
      expect(diagResult.requestId).toBe('req-diag-1');
      expect(diagResult.uiaAvailable).toBe(true);
      expect(diagResult.hookInstalled).toBe(true);
      expect(diagResult.foreground.processName).toBe('chrome.exe');

      service.stop();
    });

    it('dispatches capture_error with Timeout code when probe fails or times out', () => {
      const testPort = new TestPort();
      // Custom adapter that simulates timeout error
      const timeoutAdapter: INativeAddon = {
        isMock: true,
        probeSelection: () => ({
          success: false,
          errorCode: 'Timeout',
          errorMessage: 'UIA probe timed out after 500ms',
          source: 'hotkey',
          seq: 99,
          text: '',
          textTruncated: false,
          rects: [],
          anchor: { x: 0, y: 0 },
          pointer: { x: 0, y: 0 },
          processName: 'chrome.exe',
          processId: 100,
          windowTitle: 'Google',
          paragraph: '',
          paragraphError: null,
          paragraphTruncated: false,
          capturedAt: new Date().toISOString(),
          elapsedMs: 501,
          dpiScale: 1.0,
          coordinateSpace: 'dip',
          selectionRanges: 0,
          isEnglish: false,
          warnings: ['Timeout'],
        }),
        probeSelectionDetailed: () => timeoutAdapter.probeSelection(),
        probeExpandUnits: () => [],
        probeRangeFromPoint: () => timeoutAdapter.probeSelection(),
        startDot: () => {},
        stopDot: () => {},
        hideDot: () => {},
        diagnose: () => ({
          uiaAvailable: true,
          hookInstalled: true,
          dotVisible: false,
          addonVersion: '1.0.0',
          osVersion: 'Windows',
          dpiScale: 1.0,
          warnings: [],
        }),
      };

      const service = new CaptureService({
        port: testPort,
        addon: timeoutAdapter,
        exitOnShutdown: false,
      });

      service.start();
      testPort.postedMessages.length = 0;

      testPort.emit({
        type: 'capture_current',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: 'req-timeout-1',
        reason: 'hotkey',
        timeoutMs: 500,
      });

      const errorMsg = testPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'capture_error',
      ) as { requestId: string; code: string; retryable: boolean };

      expect(errorMsg).toBeDefined();
      expect(errorMsg.requestId).toBe('req-timeout-1');
      expect(errorMsg.code).toBe('Timeout');
      expect(errorMsg.retryable).toBe(true);

      service.stop();
    });
  });
});
