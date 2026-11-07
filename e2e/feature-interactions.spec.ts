import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/fixture';

const SYSTEM_INFO_LABELS = [
  '平台架构',
  'Electron 版本',
  'Node.js 版本',
  'Chromium 版本',
  'CPU 核心 / 架构',
  '可用内存 / 总内存',
  '主进程堆内存占用',
  '系统运行时间',
  'V8 引擎版本',
];

test.describe('Feature interactions', () => {
  test('system info card keeps its data grid without a refresh control', async ({ page }) => {
    const systemCard = page.locator('.ant-card').filter({ hasText: '系统与运行环境' });
    await expect(systemCard).toBeVisible();

    // 无刷新入口：卡片内既没有按钮（含 header action），也没有刷新文案
    await expect(systemCard.getByRole('button')).toHaveCount(0);
    await expect(systemCard.getByText('刷新')).toHaveCount(0);

    // 九个数据项以用户可见的标签与值呈现
    for (const label of SYSTEM_INFO_LABELS) {
      const labelNode = systemCard.getByText(label, { exact: true });
      await expect(labelNode).toBeVisible();
      await expect(labelNode.locator('xpath=following-sibling::span[1]')).not.toBeEmpty();
    }
  });

  test('system info polling omits successful IPC spans from the trace log', async ({
    page,
    tempUserDataDir,
  }) => {
    const tracePath = path.join(tempUserDataDir, 'logs', 'traces.ndjson');
    const systemInfoSpan = 'ipc.receive:system:get-info';
    const calculatorSpan = 'ipc.receive:calculator:calculate';

    // NDJSON 逐行解析；末尾可能是尚未写完的半行，跳过而不是让整份文件解析失败
    const readSpans = (): Array<{ name?: string }> => {
      if (!fs.existsSync(tracePath)) return [];
      return fs
        .readFileSync(tracePath, 'utf8')
        .split('\n')
        .flatMap((line) => {
          if (!line.trim()) return [];
          try {
            return [JSON.parse(line) as { name?: string }];
          } catch {
            return [];
          }
        });
    };
    const countSpans = (name: string) => readSpans().filter((span) => span.name === name).length;

    // 等 trace 写入器就绪（已有记录落盘）再取基线，避免把启动期写入误判为轮询新增
    await expect.poll(() => readSpans().length, { timeout: 15_000 }).toBeGreaterThan(0);

    const systemCard = page.locator('.ant-card').filter({ hasText: '系统与运行环境' });
    await expect(systemCard.getByText('系统运行时间', { exact: true })).toBeVisible();

    const baseline = countSpans(systemInfoSpan);

    // 卡片文案含精确到秒的运行时间，每次轮询落地都会更新：
    // 观察到两次变化即证明至少完成了两个轮询周期，测试不会在轮询已停摆时误通过
    const initialText = await systemCard.innerText();
    await expect.poll(() => systemCard.innerText()).not.toBe(initialText);
    const afterFirstPoll = await systemCard.innerText();
    await expect.poll(() => systemCard.innerText()).not.toBe(afterFirstPoll);

    // 轮询之后发一条必定落盘的 traced 调用，等它出现在文件里：
    // 单写入器顺序追加，说明此前所有 span 都已刷盘，此时再核对计数才可信
    const calculatorBaseline = countSpans(calculatorSpan);
    const probe = await page.evaluate(async () => {
      const api = (
        window as unknown as {
          api: {
            calculator: {
              calculate: (input: {
                a: number;
                b: number;
                op: string;
              }) => Promise<{ success: boolean }>;
            };
          };
        }
      ).api;
      return api.calculator.calculate({ a: 1, b: 2, op: 'add' });
    });
    expect(probe.success).toBe(true);
    await expect
      .poll(() => countSpans(calculatorSpan), { timeout: 15_000 })
      .toBeGreaterThan(calculatorBaseline);

    expect(countSpans(systemInfoSpan)).toBe(baseline);
  });

  test('feature cards deepen their shadow without changing border color on hover', async ({
    page,
  }) => {
    const card = page.locator('.ant-card').filter({ hasText: '系统与运行环境' });
    await page.mouse.move(0, 0);
    const before = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderColor, boxShadow: style.boxShadow };
    });

    await card.hover();
    await expect
      .poll(() => card.evaluate((element) => getComputedStyle(element).boxShadow))
      .not.toBe(before.boxShadow);
    await expect
      .poll(() => card.evaluate((element) => getComputedStyle(element).borderColor))
      .toBe(before.borderColor);
  });

  test('architecture code samples can be copied independently', async ({ page }) => {
    await page.getByRole('tab', { name: '架构全貌' }).click();

    const installClipboardStub = (mode: 'record' | 'reject') =>
      page.evaluate((clipboardMode) => {
        const state = window as Window & {
          __clipboardOwnDescriptor?: PropertyDescriptor | null;
          __copiedTexts?: string[];
        };
        // 只保存一次原始描述符，后续替换 stub 不能覆盖它
        if (state.__clipboardOwnDescriptor === undefined) {
          state.__clipboardOwnDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        }
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              if (clipboardMode === 'reject') throw new Error('clipboard unavailable');
              state.__copiedTexts ??= [];
              state.__copiedTexts.push(text);
            },
          },
        });
      }, mode);

    const restoreClipboard = () =>
      page.evaluate(() => {
        const state = window as Window & {
          __clipboardOwnDescriptor?: PropertyDescriptor | null;
          __copiedTexts?: string[];
        };
        if (state.__clipboardOwnDescriptor) {
          Object.defineProperty(navigator, 'clipboard', state.__clipboardOwnDescriptor);
        } else {
          Reflect.deleteProperty(navigator, 'clipboard');
        }
        delete state.__clipboardOwnDescriptor;
        delete state.__copiedTexts;
        window.getSelection()?.removeAllRanges();
      });

    try {
      await installClipboardStub('record');

      const copyButtons = page.getByRole('button', { name: '复制代码' });
      await expect(copyButtons).toHaveCount(2);
      const expectedSamples = await page
        .locator('pre')
        .evaluateAll((elements) => elements.map((element) => element.textContent?.trim()));

      await copyButtons.nth(0).click();
      await expect(page.getByText('代码已复制')).toBeVisible();
      await copyButtons.nth(1).click();
      await expect(page.getByText('代码已复制').last()).toBeVisible();

      const copied = await page.evaluate(
        () => (window as Window & { __copiedTexts?: string[] }).__copiedTexts,
      );
      expect(copied).toEqual(expectedSamples);

      await installClipboardStub('reject');
      await copyButtons.nth(1).click();
      await expect(page.getByText('复制代码失败')).toBeVisible();
    } finally {
      await restoreClipboard();
      await page.getByRole('tab', { name: '总览看板' }).click();
    }
  });
});
