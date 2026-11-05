import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { CaptureServiceManager } from '@app/main/services/capture/capture-service-manager';
import { app, utilityProcess } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notifyCaptureServiceIssue: vi.fn() }));

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.0.0-test') },
  utilityProcess: { fork: vi.fn() },
}));

vi.mock('../../src/modules/log.module', () => ({
  getLogManager: () => ({
    scoped: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));

vi.mock('../../src/modules/tray.module', () => ({
  getTrayManager: () => ({
    notifyCaptureServiceIssue: mocks.notifyCaptureServiceIssue,
  }),
}));

class FakeUtilityProcess extends EventEmitter {
  readonly postMessage = vi.fn();
  readonly kill = vi.fn(() => {
    // 真实 utilityProcess 的 exit 是异步的；同步触发足以驱动状态机测试
    this.emit('exit', 0);
  });
}

function sentMessages(child: FakeUtilityProcess): Array<Record<string, unknown>> {
  return child.postMessage.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

function lastSentOfType(child: FakeUtilityProcess, type: string): Record<string, unknown> {
  const messages = sentMessages(child).filter((message) => message.type === type);
  return messages[messages.length - 1] as Record<string, unknown>;
}

const HELLO = {
  type: 'hello',
  protocolVersion: 1,
  sentAt: '2026-11-05T00:00:00.000Z',
  serviceVersion: '0.1.0',
  addonVersion: 'not-loaded',
  pid: 1234,
  startedAt: '2026-11-05T00:00:00.000Z',
  capabilities: { uia: false, dot: false, rangeFromPoint: false, fullscreenDetection: false },
};

function configAck(revision: number) {
  return {
    type: 'config_ack',
    protocolVersion: 1,
    sentAt: '2026-11-05T00:00:00.001Z',
    requestId: '6f1c8a2e-0000-4000-8000-000000000000',
    revision,
    appliedAt: '2026-11-05T00:00:00.001Z',
  };
}

describe('CaptureServiceManager', () => {
  let forkMock: ReturnType<typeof vi.fn>;
  let children: FakeUtilityProcess[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    children = [];
    forkMock = utilityProcess.fork as unknown as ReturnType<typeof vi.fn>;
    forkMock.mockReset();
    forkMock.mockImplementation(() => {
      const child = new FakeUtilityProcess();
      children.push(child);
      return child;
    });
    mocks.notifyCaptureServiceIssue.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fork 后按 hello → hello_ack → config_ack 完成握手并进入 ready', () => {
    const manager = new CaptureServiceManager();
    manager.start();

    expect(forkMock).toHaveBeenCalledTimes(1);
    expect(forkMock.mock.calls[0]?.[2]).toMatchObject({ serviceName: 'snapword-capture' });
    expect(manager.currentState).toBe('starting');

    const child = children[0] as FakeUtilityProcess;
    child.emit('message', HELLO);

    // hello_ack 携带 appVersion 与当前配置快照（revision 单列于 configRevision）
    const helloAck = lastSentOfType(child, 'hello_ack') as {
      configRevision: number;
      appVersion: string;
      config: Record<string, unknown>;
    };
    expect(helloAck.appVersion).toBe('0.0.0-test');
    expect(helloAck.configRevision).toBe(0);
    expect(helloAck.config).toMatchObject({ whitelist: ['chrome.exe', 'msedge.exe'] });
    expect(helloAck.config.revision).toBeUndefined();

    child.emit('message', configAck(0));
    expect(manager.currentState).toBe('ready');
    expect(manager.isReady).toBe(true);
  });

  it('shutdown 发出后收到 shutdown_ack 不再 kill', async () => {
    const manager = new CaptureServiceManager();
    manager.start();
    const child = children[0] as FakeUtilityProcess;
    child.emit('message', HELLO);
    child.emit('message', configAck(0));

    manager.stop();
    const shutdown = lastSentOfType(child, 'shutdown') as { requestId: string; reason: string };
    expect(shutdown.reason).toBe('app_quit');
    expect(manager.currentState).toBe('stopping');

    child.emit('message', {
      type: 'shutdown_ack',
      protocolVersion: 1,
      sentAt: '2026-11-05T00:00:00.002Z',
      requestId: shutdown.requestId,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(child.kill).not.toHaveBeenCalled();
  });

  it('5s 内未 hello：kill 后 3s 重试，连续 3 次失败进入 degraded 并托盘提示', () => {
    const manager = new CaptureServiceManager();
    manager.start();

    vi.advanceTimersByTime(5_000);
    expect(children[0]?.kill).toHaveBeenCalledTimes(1);
    expect(manager.currentState).toBe('idle');
    expect(mocks.notifyCaptureServiceIssue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3_000);
    expect(forkMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5_000);
    expect(children[1]?.kill).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3_000);
    expect(forkMock).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(5_000);
    expect(children[2]?.kill).toHaveBeenCalledTimes(1);

    // 第三次失败 → degraded，不再自动重启
    expect(manager.currentState).toBe('degraded');
    expect(mocks.notifyCaptureServiceIssue).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(forkMock).toHaveBeenCalledTimes(3);
  });

  it('fork 抛错按失败表有限重试，第三次后 degraded', () => {
    forkMock.mockImplementation(() => {
      throw new Error('spawn EPERM');
    });
    const manager = new CaptureServiceManager();
    manager.start();

    vi.advanceTimersByTime(3_000);
    vi.advanceTimersByTime(3_000);

    expect(forkMock).toHaveBeenCalledTimes(3);
    expect(manager.currentState).toBe('degraded');
    expect(mocks.notifyCaptureServiceIssue).toHaveBeenCalledWith('startup');
  });

  it('握手成功后连续崩溃 3 次才 degraded（config_ack 不清零崩溃计数）', () => {
    const manager = new CaptureServiceManager();
    manager.start();

    for (let attempt = 0; attempt < 3; attempt++) {
      const child = children[attempt] as FakeUtilityProcess;
      child.emit('message', HELLO);
      child.emit('message', configAck(0));
      expect(manager.currentState).toBe('ready');

      child.emit('exit', 1);
      if (attempt < 2) {
        expect(manager.currentState).toBe('idle');
        expect(mocks.notifyCaptureServiceIssue).not.toHaveBeenCalled();
        vi.advanceTimersByTime(3_000);
      }
    }

    expect(manager.currentState).toBe('degraded');
    expect(mocks.notifyCaptureServiceIssue).toHaveBeenCalledWith('crash');
    expect(forkMock).toHaveBeenCalledTimes(3);
  });

  it('12s 未收到 service_status 视为服务死亡并 kill', () => {
    const manager = new CaptureServiceManager();
    manager.start();
    const child = children[0] as FakeUtilityProcess;
    child.emit('message', HELLO);
    child.emit('message', configAck(0));

    vi.advanceTimersByTime(11_999);
    expect(child.kill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('protocolVersion 不匹配的消息 kill 服务（B-02 §2.1）', () => {
    const manager = new CaptureServiceManager();
    manager.start();
    const child = children[0] as FakeUtilityProcess;

    child.emit('message', { ...HELLO, protocolVersion: 2 });

    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('握手期 config_error 按握手失败处理（kill）', () => {
    const manager = new CaptureServiceManager();
    manager.start();
    const child = children[0] as FakeUtilityProcess;

    child.emit('message', {
      type: 'config_error',
      protocolVersion: 1,
      sentAt: '2026-11-05T00:00:00.001Z',
      requestId: '6f1c8a2e-0000-4000-8000-000000000001',
      revision: 0,
      code: 'InvalidConfig',
      message: 'whitelist must be an array of process names',
    });

    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('appVersion 来自 Electron app.getVersion', () => {
    const manager = new CaptureServiceManager();
    manager.start();
    children[0]?.emit('message', HELLO);

    expect(app.getVersion as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(lastSentOfType(children[0] as FakeUtilityProcess, 'hello_ack')).toBeDefined();
  });
});
