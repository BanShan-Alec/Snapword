import { StartupReadinessModule } from '@app/main/modules/startup-readiness.module';
import * as windowRegistry from '@app/main/modules/window/window-registry';
import * as ipcTracer from '@app/main/telemetry/ipc-tracer';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('StartupReadinessModule', () => {
  let broadcastSpy: ReturnType<typeof vi.spyOn>;
  let handleTracedSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    broadcastSpy = vi.spyOn(windowRegistry, 'broadcast').mockImplementation(() => {});
    handleTracedSpy = vi.spyOn(ipcTracer, 'handleTraced').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with mainReady = false and registers IPC handler', () => {
    const module = new StartupReadinessModule();
    module.enable();

    expect(handleTracedSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.STARTUP_GET_SNAPSHOT,
      expect.any(Function),
    );

    const snapshot = module.getSnapshot();
    expect(snapshot.mainReady).toBe(false);
    expect(snapshot.payload).toBeNull();
  });

  it('marks ready, updates snapshot, and broadcasts event', () => {
    const module = new StartupReadinessModule();
    module.enable();

    module.markReady();

    const snapshot = module.getSnapshot();
    expect(snapshot.mainReady).toBe(true);
    expect(snapshot.payload).toBeDefined();
    expect(snapshot.payload?.initMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.payload?.latchedAt).toBeGreaterThan(0);

    expect(broadcastSpy).toHaveBeenCalledWith(
      IPC_CHANNELS.STARTUP_EVENT_MAIN_READY,
      snapshot.payload,
    );
  });

  it('is idempotent on multiple markReady calls', () => {
    const module = new StartupReadinessModule();
    module.markReady();
    const firstPayload = module.getSnapshot().payload;

    module.markReady();
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(module.getSnapshot().payload).toEqual(firstPayload);
  });
});
