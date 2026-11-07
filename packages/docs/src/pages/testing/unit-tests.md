---

title: 单元测试（Vitest）
description: 借助 Vitest 原生 ESM 与别名推导秒级执行 19 套件，纯逻辑常量直连与边界值断言。
---

# 单元测试（Vitest）

> **TL;DR**：全仓采用 Vitest 统一驱动单元测试。纯 Node 环境极速运行全仓 19 个套件、100+ 单元测试。配置文件下沉收敛至 `.config/`，通过源码单一真源常量驱动边界值断言，彻底杜绝测试中的手写重复定义。

## 1. 选型理由

- **原生 ESM 与 Vite 共享生态**：无需像 Jest 那样配置复杂的 Babel/ts-jest 转译链路，与子包构建配置同源，秒级热重载与执行。
- **纯 Node 环境极致轻量**：坚持单测不引 jsdom（避免虚假 DOM 环境带来的性能损耗与伪阳性），纯逻辑与数据处理全部脱壳测试，DOM 交互交给真实 Playwright E2E。
- **别名与架构边界同构**：直接消费 `packages/tsconfig/base.json` 中的统一路径别名，monorepo 子包间跨引用零摩擦。

## 2. 核心机制

### 集中式 Vitest 配置文件

→ 源码：[.config/vitest.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.config/vitest.config.ts)

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { findRepoRoot } from '../build/lib/repo-paths.ts';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = findRepoRoot(configDir);
const isBenchmark = process.env.BENCHMARK === 'true';

export default defineConfig({
  root: rootDir,
  tsconfig: path.join(rootDir, 'tsconfig.json'),
  resolve: {
    tsconfigPaths: true, // Vite 原生别名推导
  },
  test: {
    environment: 'node',
    globals: true,
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

### 源码常量直连驱动边界断言

→ 源码：[packages/main/tests/unit/renderer-log-line.test.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/tests/unit/renderer-log-line.test.ts)

```ts
import { RENDERER_LINE_MAX_LENGTH } from '@app/main/constants/logging';
import { truncateRenderedLine } from '@app/main/modules/log.module';
import { describe, expect, it } from 'vitest';

describe('truncateRenderedLine', () => {
  it('超长日志行精准截断并保留总长度等于上限阈值', () => {
    const line = 'x'.repeat(RENDERER_LINE_MAX_LENGTH + 500);
    const result = truncateRenderedLine(line);
    const expectedSuffix = ' [truncated 500 chars]';

    // 核心设计：直接引用源码 RENDERER_LINE_MAX_LENGTH 常量，而非在测试里硬编码 2000
    expect(result.length).toBe(RENDERER_LINE_MAX_LENGTH);
    expect(result.endsWith(expectedSuffix)).toBe(true);
    expect(result.startsWith('x'.repeat(RENDERER_LINE_MAX_LENGTH - expectedSuffix.length))).toBe(
      true,
    );
  });
});
```

## 3. 桌面端避坑注意事项

| 避坑要点               | 事故表现与原因                                                                                  | 本仓库对齐方案                                                                                     |
| :--------------------- | :---------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| **测试硬编码破坏真源** | 测试中手写常量（如 `expect(len).toBe(2000)`），源码常量调整后测试未同步修改发生误报或漏报。     | 测试文件直接 import 源码中的业务常量（如 `RENDERER_LINE_MAX_LENGTH`、`WINDOW_IDS` 等），真源联动。 |
| **工作目录漂移风险**   | Vitest 配置写在根目录依赖 `process.cwd()`，当在子包目录下执行或从外部目录执行时找不到测试用例。 | 配置文件放在 `.config/vitest.config.ts`，基于 `findRepoRoot(configDir)` 物理推导 monorepo 根路径。 |
| **单测环境过度庞大**   | 为测试一个工具函数引入 jsdom / happy-dom，CI 执行时间翻倍甚至偶发内存泄漏。                     | 单元测试环境严格锁定为 `node`；DOM、渲染和 CSS 行为统一由 Playwright 真实窗口矩阵验证。            |
