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
  // 别名真源：packages/tsconfig/base.json（Vite 8 原生 tsconfigPaths）
  resolve: {
    tsconfigPaths: true,
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
