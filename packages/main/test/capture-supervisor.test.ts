import { EventEmitter } from 'node:events';
import { CaptureService, type MessagePortLike } from '@app/main/capture/capture-service';
import { MockSelectionEmitter } from '@app/main/capture/mock-selection-emitter';
import {
  CaptureSupervisorModule,
  type UtilityProcessLike,
} from '@app/main/modules/capture-supervisor.module';
import {
  CAPTURE_PROTOCOL_VERSION,
  DEFAULT_CAPTURE_CONFIG,
  selectionPayloadSchema,
} from '@app/shared/schemas/capture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockUtilityProcess extends EventEmitter implements UtilityProcessLike {
  public pid = 12345;
  public postedMessages: unknown[] = [];
  public isKilled = false;

  public postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }

  public kill(): boolean {
    this.isKilled = true;
    this.emit('exit', 0);
    return true;
  }
}

class MockPort extends EventEmitter implements MessagePortLike {
  public postedMessages: unknown[] = [];

  public postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }
}

describe('Capture Subsystem (Slice-01)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('MockSelectionEmitter', () => {
    it('produces valid selection payloads strictly complying with DIP coordinates', () => {
      const emitter = new MockSelectionEmitter();
      const payload = emitter.createMockSelection({
        source: 'hotkey',
        text: 'hello world',
      });

      const parseResult = selectionPayloadSchema.safeParse(payload);
      expect(parseResult.success).toBe(true);
      expect(payload.coordinateSpace).toBe('dip');
      expect(payload.seq).toBe(1);
      expect(payload.rects.length).toBeGreaterThan(0);
      expect(payload.anchor.y).toBe(payload.rects[0].y + payload.rects[0].height + 8);
    });

    it('increments monotonic sequence numbers sequentially', () => {
      const emitter = new MockSelectionEmitter();
      expect(emitter.nextSeq()).toBe(1);
      expect(emitter.nextSeq()).toBe(2);
      expect(emitter.getSeq()).toBe(2);
      emitter.resetSeq();
      expect(emitter.getSeq()).toBe(0);
    });
  });

  describe('CaptureService (utilityProcess side)', () => {
    it('sends hello on start and replies config_ack upon receiving hello_ack', () => {
      const mockPort = new MockPort();
      const service = new CaptureService({
        port: mockPort,
        exitOnShutdown: false,
        handshakeTimeoutMs: 5000,
      });

      service.start();

      // Should have sent hello
      expect(mockPort.postedMessages.length).toBe(1);
      const helloMsg = mockPort.postedMessages[0] as { type: string; protocolVersion: number };
      expect(helloMsg.type).toBe('hello');
      expect(helloMsg.protocolVersion).toBe(CAPTURE_PROTOCOL_VERSION);

      // Simulate main replying with hello_ack
      mockPort.emit('message', {
        type: 'hello_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        appVersion: '1.0.0',
        configRevision: 1,
        config: DEFAULT_CAPTURE_CONFIG,
      });

      // Service should reply with config_ack and enter ready state
      expect(service.getState()).toBe('ready');
      const configAck = mockPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'config_ack',
      );
      expect(configAck).toBeDefined();

      service.stop();
    });

    it('emits periodic heartbeat service_status every 5 seconds once ready', () => {
      const mockPort = new MockPort();
      const service = new CaptureService({
        port: mockPort,
        exitOnShutdown: false,
        heartbeatIntervalMs: 5000,
      });

      service.start();
      mockPort.emit('message', {
        type: 'hello_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        appVersion: '1.0.0',
        configRevision: 1,
        config: DEFAULT_CAPTURE_CONFIG,
      });

      mockPort.postedMessages = [];
      vi.advanceTimersByTime(5000);

      const heartbeat = mockPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'service_status',
      );
      expect(heartbeat).toBeDefined();
      expect((heartbeat as { state: string }).state).toBe('ready');

      service.stop();
    });

    it('rejects stale config revisions with config_error', () => {
      const mockPort = new MockPort();
      const service = new CaptureService({
        port: mockPort,
        exitOnShutdown: false,
      });

      service.start();
      mockPort.emit('message', {
        type: 'hello_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        appVersion: '1.0.0',
        configRevision: 5,
        config: DEFAULT_CAPTURE_CONFIG,
      });

      mockPort.postedMessages = [];

      // Send config_update with older revision 4
      mockPort.emit('message', {
        type: 'config_update',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: 'req-stale',
        revision: 4,
        config: DEFAULT_CAPTURE_CONFIG,
      });

      const configError = mockPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'config_error',
      );
      expect(configError).toBeDefined();

      service.stop();
    });

    it('dispatches capture_result when receiving capture_current', () => {
      const mockPort = new MockPort();
      const service = new CaptureService({
        port: mockPort,
        exitOnShutdown: false,
      });

      service.start();
      mockPort.emit('message', {
        type: 'hello_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        appVersion: '1.0.0',
        configRevision: 1,
        config: DEFAULT_CAPTURE_CONFIG,
      });

      mockPort.postedMessages = [];

      mockPort.emit('message', {
        type: 'capture_current',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: 'req-capture-1',
        reason: 'hotkey',
        timeoutMs: 500,
      });

      const result = mockPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'capture_result',
      ) as { requestId: string; payload: unknown };
      expect(result).toBeDefined();
      expect(result.requestId).toBe('req-capture-1');

      service.stop();
    });

    it('handles shutdown and responds with shutdown_ack', () => {
      const mockPort = new MockPort();
      const service = new CaptureService({
        port: mockPort,
        exitOnShutdown: false,
      });

      service.start();
      mockPort.emit('message', {
        type: 'shutdown',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: 'req-shutdown-1',
        reason: 'app_quit',
      });

      const ack = mockPort.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'shutdown_ack',
      ) as { requestId: string };
      expect(ack).toBeDefined();
      expect(ack.requestId).toBe('req-shutdown-1');
      expect(service.getState()).toBe('stopping');
    });
  });

  describe('CaptureSupervisorModule (main process supervisor)', () => {
    let mockChild: MockUtilityProcess;

    beforeEach(() => {
      mockChild = new MockUtilityProcess();
    });

    it('completes 3-step handshake and becomes ready', () => {
      const supervisor = new CaptureSupervisorModule({
        forkFn: () => mockChild,
      });

      supervisor.start();
      expect(supervisor.getState()).toBe('starting');
      expect(supervisor.isReady()).toBe(false);

      // Child sends hello
      mockChild.emit('message', {
        type: 'hello',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        serviceVersion: '1.0.0',
        addonVersion: '1.0.0-mock',
        pid: 12345,
        startedAt: new Date().toISOString(),
        capabilities: {
          uia: true,
          dot: true,
          rangeFromPoint: true,
          fullscreenDetection: true,
        },
      });

      // Supervisor should reply with hello_ack
      const helloAck = mockChild.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'hello_ack',
      );
      expect(helloAck).toBeDefined();

      // Child replies config_ack
      mockChild.emit('message', {
        type: 'config_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: '',
        revision: 1,
        appliedAt: new Date().toISOString(),
      });

      expect(supervisor.isReady()).toBe(true);
      expect(supervisor.getState()).toBe('ready');
    });

    it('triggers handshake timeout after 5000ms if no hello received and initiates restart', () => {
      let forkCount = 0;
      const supervisor = new CaptureSupervisorModule({
        forkFn: () => {
          forkCount += 1;
          return mockChild;
        },
        handshakeTimeoutMs: 5000,
        backoffDelays: [1000, 2000, 4000],
      });

      supervisor.start();
      expect(forkCount).toBe(1);

      // Advance by 5000ms: handshake timeout!
      vi.advanceTimersByTime(5000);
      expect(mockChild.isKilled).toBe(true);
      expect(supervisor.getRestartCount()).toBe(1);

      // Advance by 1000ms: 1st backoff restart triggered!
      vi.advanceTimersByTime(1000);
      expect(forkCount).toBe(2);
    });

    it('detects missing heartbeat after 12s and restarts service', () => {
      let forkCount = 0;
      const supervisor = new CaptureSupervisorModule({
        forkFn: () => {
          forkCount += 1;
          mockChild = new MockUtilityProcess();
          return mockChild;
        },
        heartbeatCheckIntervalMs: 5000,
        heartbeatTimeoutMs: 12000,
        backoffDelays: [1000, 2000, 4000],
      });

      supervisor.start();

      // Complete handshake
      mockChild.emit('message', {
        type: 'hello',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        serviceVersion: '1.0.0',
        addonVersion: '1.0.0-mock',
        pid: 12345,
        startedAt: new Date().toISOString(),
        capabilities: {
          uia: true,
          dot: true,
          rangeFromPoint: true,
          fullscreenDetection: true,
        },
      });
      mockChild.emit('message', {
        type: 'config_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: '',
        revision: 1,
        appliedAt: new Date().toISOString(),
      });
      expect(supervisor.isReady()).toBe(true);

      // Advance by 15s without any heartbeat
      vi.advanceTimersByTime(15000);

      // Child should have been killed for heartbeat timeout
      expect(supervisor.getRestartCount()).toBe(1);

      // 1s silent restart
      vi.advanceTimersByTime(1000);
      expect(forkCount).toBe(2);
    });

    it('performs exponential backoff restarts (1s, 2s, 4s) with silent restarts for first 2 and degraded on 3rd', () => {
      let forkCount = 0;
      const degradedEvents: Array<{ restartCount: number; reason: string }> = [];

      const supervisor = new CaptureSupervisorModule({
        forkFn: () => {
          forkCount += 1;
          mockChild = new MockUtilityProcess();
          return mockChild;
        },
        backoffDelays: [1000, 2000, 4000],
      });

      supervisor.on('degraded', (info) => {
        degradedEvents.push(info);
      });

      supervisor.start();
      expect(forkCount).toBe(1);

      // Crash 1
      mockChild.emit('exit', 1);
      expect(supervisor.getRestartCount()).toBe(1);
      expect(degradedEvents.length).toBe(0); // silent

      // Wait 1000ms for 1st restart
      vi.advanceTimersByTime(1000);
      expect(forkCount).toBe(2);

      // Crash 2
      mockChild.emit('exit', 1);
      expect(supervisor.getRestartCount()).toBe(2);
      expect(degradedEvents.length).toBe(0); // silent

      // Wait 2000ms for 2nd restart
      vi.advanceTimersByTime(2000);
      expect(forkCount).toBe(3);

      // Crash 3
      mockChild.emit('exit', 1);
      expect(supervisor.getRestartCount()).toBe(3);
      expect(degradedEvents.length).toBe(1); // 3rd crash alarms & degrades!
      expect(supervisor.getState()).toBe('degraded');

      // Wait 4000ms for 3rd restart attempt
      vi.advanceTimersByTime(4000);
      expect(forkCount).toBe(4);

      // Crash 4 (exceeds 3 restarts): halts automatic restart loops
      mockChild.emit('exit', 1);
      expect(supervisor.getRestartCount()).toBe(4);
      expect(supervisor.getState()).toBe('degraded');
      vi.advanceTimersByTime(10000);
      expect(forkCount).toBe(4); // No further fork!
    });

    it('performs graceful shutdown within 1s, sending shutdown and awaiting shutdown_ack', async () => {
      const supervisor = new CaptureSupervisorModule({
        forkFn: () => mockChild,
        shutdownTimeoutMs: 1000,
      });

      supervisor.start();

      // Handshake
      mockChild.emit('message', {
        type: 'hello',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        serviceVersion: '1.0.0',
        addonVersion: '1.0.0-mock',
        pid: 12345,
        startedAt: new Date().toISOString(),
        capabilities: {
          uia: true,
          dot: true,
          rangeFromPoint: true,
          fullscreenDetection: true,
        },
      });
      mockChild.emit('message', {
        type: 'config_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: '',
        revision: 1,
        appliedAt: new Date().toISOString(),
      });

      const shutdownPromise = supervisor.shutdown();

      const shutdownMsg = mockChild.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'shutdown',
      ) as { requestId: string };
      expect(shutdownMsg).toBeDefined();

      // Child replies shutdown_ack
      mockChild.emit('message', {
        type: 'shutdown_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: shutdownMsg.requestId,
      });

      await shutdownPromise;
      expect(supervisor.isReady()).toBe(false);
      expect(supervisor.getChild()).toBeNull();
    });

    it('force kills child process if shutdown_ack times out after 1s', async () => {
      const supervisor = new CaptureSupervisorModule({
        forkFn: () => mockChild,
        shutdownTimeoutMs: 1000,
      });

      supervisor.start();
      const shutdownPromise = supervisor.shutdown();

      // Do NOT send shutdown_ack, advance timer by 1000ms
      vi.advanceTimersByTime(1000);

      await shutdownPromise;
      expect(mockChild.isKilled).toBe(true);
      expect(supervisor.getChild()).toBeNull();
    });

    it('delegates captureCurrent request and returns SelectionPayload', async () => {
      const supervisor = new CaptureSupervisorModule({
        forkFn: () => mockChild,
      });

      supervisor.start();

      // Complete handshake
      mockChild.emit('message', {
        type: 'hello',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        serviceVersion: '1.0.0',
        addonVersion: '1.0.0-mock',
        pid: 12345,
        startedAt: new Date().toISOString(),
        capabilities: {
          uia: true,
          dot: true,
          rangeFromPoint: true,
          fullscreenDetection: true,
        },
      });
      mockChild.emit('message', {
        type: 'config_ack',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: '',
        revision: 1,
        appliedAt: new Date().toISOString(),
      });

      const capturePromise = supervisor.captureCurrent('hotkey', 500);

      const captureMsg = mockChild.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'capture_current',
      ) as { requestId: string };
      expect(captureMsg).toBeDefined();

      const mockEmitter = new MockSelectionEmitter();
      const mockPayload = mockEmitter.createMockSelection({ text: 'CaptureTest' });

      mockChild.emit('message', {
        type: 'capture_result',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        requestId: captureMsg.requestId,
        payload: mockPayload,
      });

      const result = await capturePromise;
      expect(result.text).toBe('CaptureTest');
      expect(result.coordinateSpace).toBe('dip');
    });

    it('emits dot_clicked and immediately replies hide_dot command', () => {
      const supervisor = new CaptureSupervisorModule({
        forkFn: () => mockChild,
      });

      supervisor.start();

      let clickedPayload = null;
      supervisor.on('dot_clicked', (payload) => {
        clickedPayload = payload;
      });

      const mockEmitter = new MockSelectionEmitter();
      const payload = mockEmitter.createMockSelection({ source: 'dot' });

      mockChild.emit('message', {
        type: 'dot_clicked',
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        sentAt: new Date().toISOString(),
        seq: payload.seq,
        payload,
      });

      expect(clickedPayload).toEqual(payload);
      const hideDot = mockChild.postedMessages.find(
        (m: unknown) => (m as { type: string }).type === 'hide_dot',
      );
      expect(hideDot).toBeDefined();
    });
  });

  describe('End-to-End In-Memory Pairing (CaptureSupervisor <-> CaptureService)', () => {
    it('successfully connects supervisor and service through simulated port, fulfilling whole lifecycle', async () => {
      // Create a bidirectional connected pair
      const servicePort = new MockPort();
      const supervisorPort = new MockUtilityProcess();

      // Synchronously cross-connect ports for deterministic event loop execution
      servicePort.postMessage = (msg: unknown) => {
        supervisorPort.emit('message', msg);
      };
      supervisorPort.postMessage = (msg: unknown) => {
        servicePort.emit('message', msg);
      };

      const service = new CaptureService({
        port: servicePort,
        exitOnShutdown: false,
      });

      const supervisor = new CaptureSupervisorModule({
        forkFn: () => supervisorPort,
      });

      // Start both
      supervisor.start();
      service.start();

      expect(supervisor.isReady()).toBe(true);
      expect(service.getState()).toBe('ready');

      // Request selection
      const capturePromise = supervisor.captureCurrent('hotkey');
      const result = await capturePromise;

      expect(result).toBeDefined();
      expect(result.coordinateSpace).toBe('dip');
      expect(result.text).toBe('Snapword');

      // Shutdown
      const shutdownPromise = supervisor.shutdown();
      await shutdownPromise;

      expect(supervisor.isReady()).toBe(false);
      expect(service.getState()).toBe('stopping');
    });
  });
});
