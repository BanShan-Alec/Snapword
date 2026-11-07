import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { applyRepoEnv, loadRepoEnv } from '../build/lib/env.ts';
import { getDistDir } from '../build/lib/repo-paths.ts';

// 统一从 build/lib/env.ts 加载根 .env（外部注入优先），并向上锁定仓库根
const repoEnv = loadRepoEnv(__dirname, 'production');
applyRepoEnv(repoEnv);
const ROOT_DIR = repoEnv.rootDir;

const DEFAULT_ELECTRON_BUILDER_CONFIG = join(ROOT_DIR, 'build', 'electron-builder.ts');

import { build, type CliOptions } from 'electron-builder';
import { verifyPostbuild } from './verify-postbuild.ts';
import { verifyPrebuild } from './verify-prebuild.ts';

/**
 * CLI Argument Parsing
 */
const { values } = parseArgs({
  options: {
    dir: { type: 'boolean', default: false },
    win: { type: 'boolean', default: false },
    mac: { type: 'boolean', default: false },
    linux: { type: 'boolean', default: false },
    x64: { type: 'boolean' },
    arm64: { type: 'boolean' },
    publish: { type: 'string', short: 'p', default: 'never' },
    config: { type: 'string', short: 'c', default: DEFAULT_ELECTRON_BUILDER_CONFIG },
    'skip-build': { type: 'boolean', default: false },
    'skip-verify': { type: 'boolean', default: false },
  },
  strict: false,
  allowPositionals: true,
});

async function runBuild() {
  // 1. Build workspace packages first unless --skip-build is specified
  if (!values['skip-build']) {
    console.log('📦 Building workspace packages...');
    execSync('pnpm -r run build', { stdio: 'inherit' });
  } else {
    // --skip-build 语义：只打包现有产物。缺失即失败，绝不在配置层隐式补构建。
    const requiredArtifacts = [
      'packages/main/dist/index.cjs',
      'packages/preload/dist/index.cjs',
      'packages/renderer/dist/src/entries/home/index.html',
      'packages/renderer/dist/src/entries/updater/index.html',
    ];
    const missing = requiredArtifacts.filter(
      (artifact) => !fs.existsSync(join(ROOT_DIR, artifact)),
    );
    if (missing.length > 0) {
      console.error(`❌ --skip-build 但缺少构建产物:\n  ${missing.join('\n  ')}`);
      console.error('   请先运行 pnpm build，或去掉 --skip-build');
      process.exit(1);
    }
  }

  // 2. Assemble electron-builder packaging options
  const buildOptions: CliOptions = {
    config: typeof values.config === 'string' ? values.config : DEFAULT_ELECTRON_BUILDER_CONFIG,
    dir: Boolean(values.dir),
    publish: (values.publish as CliOptions['publish']) || 'never',
  };

  if (values.win) buildOptions.win = [];
  if (values.mac) buildOptions.mac = [];
  if (values.linux) buildOptions.linux = [];
  if (values.x64) buildOptions.x64 = true;
  if (values.arm64) buildOptions.arm64 = true;

  // 3. Trigger packaging
  const { valid } = await verifyPrebuild();
  if (!valid) {
    process.exit(1);
  }

  console.log('🚀 Packaging Electron application with electron-builder...');
  try {
    await build(buildOptions);
    console.log('✅ Packaging completed successfully!');
  } catch (error) {
    console.error('❌ Packaging failed:', error);
    process.exit(1);
  }

  // 4. Verify packaged artifact integrity & run smoke check unless --skip-verify is specified
  if (!values['skip-verify']) {
    try {
      await verifyPostbuild({ distDir: getDistDir(ROOT_DIR) });
    } catch (verifyError) {
      console.error('❌ Post-packaging verification failed:', verifyError);
      process.exit(1);
    }
  }
}

runBuild();
