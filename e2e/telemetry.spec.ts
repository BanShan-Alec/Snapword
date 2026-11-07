import fs from 'node:fs';
import path from 'node:path';
import type { ConsoleMessage } from '@playwright/test';
import { RENDERER_LINE_MAX_LENGTH } from '../packages/main/src/constants/logging';
import { expect, test } from './helpers/fixture';

test.describe('本地遥测系统 (Mini-OTel) E2E 验证与日志捞取', () => {
  test('端到端调用产生 trace 并成功落盘 main.log 和 traces.ndjson', async ({
    page,
    electronApp,
    tempUserDataDir,
  }) => {
    // 1. 等待主窗口就绪
    await expect(page.locator('body')).toHaveClass(/app-startup-ready/, { timeout: 3000 });

    const logsDir = path.join(tempUserDataDir, 'logs');
    const mainLogPath = path.join(logsDir, 'main.log');
    const rendererHomeLogPath = path.join(logsDir, 'renderer-home.log');
    const tracesPath = path.join(logsDir, 'traces.ndjson');
    const readLog = (logPath: string) =>
      fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : '';

    // 回显采集：logger 调用同时进 DevTools（page console）；用例内摘除，避免跨 spec 泄漏
    const consoleTexts: string[] = [];
    const onConsole = (msg: ConsoleMessage) => consoleTexts.push(msg.text());
    page.on('console', onConsole);

    try {
      // 2. 模拟渲染进程发起带追踪的 IPC 请求（包含计数器、计算器和全局 logger 业务日志）
      const truncationProbeLength = RENDERER_LINE_MAX_LENGTH + 1000;
      const res = await page.evaluate(async (repeatCount) => {
        const { api, logger } = window as unknown as {
          api: {
            counter: { increment: (args: unknown) => Promise<unknown> };
            calculator: {
              calculate: (
                args: unknown,
              ) => Promise<{ success: boolean; data: { result: number }; traceId?: string }>;
            };
            config: { update: (input: unknown) => Promise<unknown> };
          };
          logger: {
            info: (message: string, ...args: unknown[]) => void;
            withTrace: (
              traceId: string,
              spanId?: string,
            ) => { info: (message: string, ...args: unknown[]) => void };
          };
        };
        const counterRes = await api.counter.increment({ step: 1 });
        const calcRes = await api.calculator.calculate({ a: 15, b: 27, op: 'add' });
        // Handling 入口标记已降为 debug（test/生产不落盘）；用 config.update 内部的主进程
        // info 日志继续校验 main.log 的跨进程 trace 注入
        await api.config.update({ serverCounter: 1 });
        // 经 withTrace 显式绑定业务 Trace 打业务日志（端到端贯通验证）
        logger
          .withTrace('4bf92f3577b34da6a3ce929d0e0e4736', '00f067aa0ba902b7')
          .info('Business action executed in traced context');
        // D2：超长渲染行经主进程静默截断（超过 RENDERER_LINE_MAX_LENGTH）
        logger.info(`Truncation probe ${'x'.repeat(repeatCount)}`);
        return { counterRes, calcRes };
      }, truncationProbeLength);

      expect(res.calcRes.success).toBe(true);
      expect(res.calcRes.data.result).toBe(42);
      expect(res.calcRes.traceId).toBeDefined();
      expect(res.calcRes.traceId).toMatch(/^[0-9a-f]{32}$/);

      // 3. 轮询等待各 sink 真正落盘（替代固定 500ms 刷盘等待）
      await expect
        .poll(() => consoleTexts.some((text) => text.includes('Business action executed')))
        .toBe(true);
      await expect
        .poll(() => readLog(rendererHomeLogPath))
        .toContain('Business action executed in traced context');
      await expect.poll(() => readLog(rendererHomeLogPath)).toContain(' [truncated ');
      await expect.poll(() => readLog(mainLogPath)).toContain('===== App started');
      await expect.poll(() => readLog(tracesPath)).toContain('ipc.receive:calculator:calculate');

      const mainLogContent = readLog(mainLogPath);
      const rendererLogContent = readLog(rendererHomeLogPath);
      const tracesContent = readLog(tracesPath);

      expect(fs.existsSync(logsDir)).toBe(true);
      expect(fs.existsSync(mainLogPath)).toBe(true);
      expect(fs.existsSync(rendererHomeLogPath)).toBe(true);
      expect(fs.existsSync(tracesPath)).toBe(true);

      // 4. 校验 traces.ndjson 内容与因果关系
      const lines = tracesContent.trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);

      const records = lines.map((line) => JSON.parse(line));
      const spanNames = records.map((record) => record.name);

      expect(spanNames).toContain('window.initialization');
      expect(spanNames).toContain('ipc.receive:counter:increment');
      expect(spanNames).toContain('ipc.receive:calculator:calculate');
      // diagnostics:log 仅作为静默传输管道，不生成无意义伪 Span 污染拓扑
      expect(spanNames).not.toContain('ipc.receive:diagnostics:log');

      // 校验 main.log 中成功注入了 trace_id 与 span_id（config.update handler 内的 info 日志）
      expect(mainLogContent).toMatch(/\[trace_id:[0-9a-f]{32}\s+span_id:[0-9a-f]{16}\]/);

      // Handling 入口标记已降为 debug：test/生产模式的 main.log 不应再出现
      expect(mainLogContent).not.toContain('Handling ');

      // 校验 renderer-home.log 中由 withTrace 显式绑定的业务 trace 上下文与窗口 attribution
      expect(rendererLogContent).toMatch(
        /\[trace_id:4bf92f3577b34da6a3ce929d0e0e4736\s+span_id:00f067aa0ba902b7\]/,
      );
      expect(rendererLogContent).toContain('[Renderer] [home]');

      // D7 替代方案：窗口创建分隔行标记渲染窗口边界（reload 不重复写）
      expect(rendererLogContent).toContain(
        '[Renderer] [home] [Window Lifecycle] ===== Window started',
      );
      expect(rendererLogContent).toContain('Document started');

      // D7 替代方案：启动分隔行标记本轮 App 运行边界（main.log 独有）
      expect(mainLogContent).toContain('===== App started');

      // D2：超长渲染行被静默截断并追加标记
      expect(rendererLogContent).toMatch(/ \[truncated \d+ chars\]$/m);

      // 验证每条 SpanRecord 的基础结构
      for (const record of records) {
        expect(record.type).toBe('span');
        expect(record.trace_id).toMatch(/^[0-9a-f]{32}$/);
        expect(record.span_id).toMatch(/^[0-9a-f]{16}$/);
        expect(typeof record.duration_ms).toBe('number');
        expect(['OK', 'ERROR']).toContain(record.status);
      }

      const calcRecord = records.find(
        (record) => record.name === 'ipc.receive:calculator:calculate',
      );
      expect(calcRecord?.status).toBe('OK');

      // 5. 验证真实 Electron 运行时中的日志轮转机制 (时间戳归档与主日志重置)
      const rotated = await electronApp.evaluate(() => {
        const g = globalThis as any;
        const logMgr = g.__appLogManager;
        if (!logMgr) return false;
        const testLogger = logMgr.getWindowLogger('rotation-test');
        // 记录原阈值供 finally 恢复，避免把极小 maxSize 留给共享 logger
        g.__rotationOriginalMaxSize = testLogger.transports.file.maxSize;
        testLogger.transports.file.maxSize = 100; // 设定 100 字节极小阈值触发轮转
        testLogger.info(
          'Line 1: Exceed the size threshold of one hundred bytes to trigger rotation',
        );
        testLogger.info('Line 2: New log line written after rotation into active file');
        return true;
      });

      expect(rotated).toBe(true);

      const isRotationArchive = (fileName: string) =>
        /^renderer-rotation-test-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_\d+)?\.log$/.test(fileName);
      await expect
        .poll(() => fs.readdirSync(logsDir).filter(isRotationArchive).length, { timeout: 5000 })
        .toBeGreaterThanOrEqual(1);

      const filesAfterRotation = fs.readdirSync(logsDir);
      expect(filesAfterRotation).toContain('renderer-rotation-test.log');
    } finally {
      await electronApp
        .evaluate(() => {
          const g = globalThis as any;
          const logMgr = g.__appLogManager;
          if (!logMgr || g.__rotationOriginalMaxSize === undefined) return;
          logMgr.getWindowLogger('rotation-test').transports.file.maxSize =
            g.__rotationOriginalMaxSize;
          delete g.__rotationOriginalMaxSize;
        })
        .catch(() => undefined);
      page.off('console', onConsole);
    }
  });
});
