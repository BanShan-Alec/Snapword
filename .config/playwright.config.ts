import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { findRepoRoot } from '../build/lib/repo-paths.ts';

// 基于配置文件自身位置向上锁定仓库物理根目录
const ROOT_DIR = findRepoRoot(__dirname);

/**
 * Playwright E2E Configuration for Electron
 * Placed in .config/ for clean repository root structure.
 */
export default defineConfig({
  testDir: path.join(ROOT_DIR, 'e2e'),
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1, // Electron E2E must run sequentially to avoid display/process lock conflicts
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(ROOT_DIR, 'playwright-report'), open: 'never' }],
  ],
  outputDir: path.join(ROOT_DIR, 'test-results'),
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
