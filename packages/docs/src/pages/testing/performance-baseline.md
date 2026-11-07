---

title: 性能基线（Benchmark）
description: 采用 JIT 预热与多轮中位数采样消除系统抖动，设置独立门禁守护高频遥测纳秒级开销。
---

# 性能基线（Benchmark）

> **TL;DR**：性能劣化（如埋点侵入导致的微秒级抖动）在日常功能测试中极难察觉。通过 V8 JIT 预热（500 次）与 5 轮 2000 次中位数（Median）统计，配合 10x 宽松回归护栏，将高频调用开销严格卡死在安全范围内，并通过独立环境变量从日常 CI 门禁中彻底隔离。

## 1. 选型理由

- **微观性能隐蔽性强**：在桌面端主进程 IPC 分发与链路追踪中，单次处理耗时若增加 0.2ms，肉眼完全无感，但高频循环下会直接造成界面掉帧（Jank）。
- **杜绝 V8 JIT 冷启动与 GC 误报**：单次运行测速往往因为 V8 字节码解释执行、代码优化反优化或单次垃圾回收（GC）突刺而导致测试随机翻红。必须引入严谨的预热轮次与中位数聚合。
- **与日常 CI 隔离**：基准测试需要稳定且不受虚拟化共享核干扰的 CPU 资源，因此排除在普通 PR 门禁之外，作为本地基准与特定发布流水线任务按需触发。

## 2. 核心机制

### 预热 + 多轮中位数性能基准套件

→ 源码：[packages/main/tests/benchmark/tracer-perf.test.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/tests/benchmark/tracer-perf.test.ts)

```ts
import { getTracer } from '@app/main/telemetry/tracer';
import { describe, expect, it } from 'vitest';

const ITERATIONS_PER_ROUND = 2000;
const ROUNDS = 5;
const WARMUP_ITERATIONS = 500;

async function measurePerCall(run: (index: number) => Promise<unknown>): Promise<number> {
  const startedAt = performance.now();
  for (let i = 0; i < ITERATIONS_PER_ROUND; i++) {
    await run(i);
  }
  return (performance.now() - startedAt) / ITERATIONS_PER_ROUND;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

describe('性能基准测试 (Tracer Benchmark)', () => {
  it('追踪埋点附加开销必须受控 (中位数守护)', async () => {
    const tracer = getTracer();
    const work = async (value: number) => value * 2;

    // 1. 预热阶段：先让 JIT 稳定，避免首轮解释执行污染基线
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      await work(i);
      await tracer.startActiveSpan('benchmark.warmup', undefined, () => work(i));
    }

    // 2. 5 轮实验采样
    const baselineSamples: number[] = [];
    const tracedSamples: number[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      baselineSamples.push(await measurePerCall(work));
      tracedSamples.push(
        await measurePerCall((index) =>
          tracer.startActiveSpan('benchmark.operation', { attributes: { index } }, () =>
            work(index),
          ),
        ),
      );
    }

    // 3. 计算单次调用开销的中位数
    const overheadSamples = tracedSamples.map((traced, i) => traced - baselineSamples[i]);
    const stats = {
      baselineMedianMs: median(baselineSamples),
      tracedMedianMs: median(tracedSamples),
      overheadMedianMs: median(overheadSamples),
    };

    // 4. 单轮计时受 JIT / GC / 调度噪声影响，不作为精确门槛；
    // 这里保留 10x 于原目标值（0.1ms）的宽松回归护栏（<1ms），防止数量级退化
    expect(stats.overheadMedianMs).toBeLessThan(1);
  });
});
```

### 独立配置与环境隔离

→ 源码：[.config/vitest.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.config/vitest.config.ts)

```ts
const isBenchmark = process.env.BENCHMARK === 'true';

export default defineConfig({
  test: {
    // 日常 `pnpm test` 点名排除 benchmark，仅在 `pnpm test:bench` 下独立执行
    include: isBenchmark
      ? ['packages/main/tests/benchmark/**/*.test.ts']
      : ['packages/**/tests/unit/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
    exclude: isBenchmark
      ? ['**/node_modules/**', '**/dist/**']
      : [
          '**/node_modules/**',
          '**/dist/**',
          'packages/main/tests/benchmark/**',
          'packages/pr-review/**',
        ],
  },
});
```

## 3. 桌面端避坑注意事项

| 避坑要点                     | 事故表现与原因                                                                        | 本仓库对齐方案                                                                                    |
| :--------------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------ |
| **单次粗暴采样翻红**         | 仅循环 1000 次取一次 `performance.now()`，在 CI 共享 CPU 突发抖动时导致基线测试翻红。 | 必须引入 `WARMUP_ITERATIONS` 预热 JIT，并进行 5 轮采样计算 `median`（中位数），过滤毛刺值。       |
| **断言过于严苛引发误报**     | 将真实断言卡死在 0.1ms，在不同机器负荷下容易误触。                                    | 结合实际调度考量，基线断言保留 10x 宽松护栏（`< 1ms`），目标对齐 0.1ms，防止数量级性能滑坡。      |
| **污染日常 CI 时效**         | 若将耗时较长的基准测试混入 PR 必经的 `pnpm test`，会导致开发提交频繁等待。            | 通过 `BENCHMARK=true` 环境变量切分，日常门禁秒级通过，性能基准由专属命令 `pnpm test:bench` 驱动。 |
| **测试逻辑与生产逻辑不同构** | 对照组和实验组执行的底层异步代码结构不一致，测出的仅仅是 Promise 封装本身的开销。     | 对照组与实验组必须同构循环，仅对比“有无追踪包裹”的差值（`traced - baseline`）。                   |
