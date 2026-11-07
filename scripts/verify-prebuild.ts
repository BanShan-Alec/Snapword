import fs from 'node:fs';
import { join, relative } from 'node:path';
import { findRepoRoot } from '../build/lib/repo-paths.ts';

interface VerificationResult {
  valid: boolean;
  errors: string[];
}

// 设计系统门禁：字号不进任意值；hex 颜色只允许出现在品牌种子里
const RENDERER_SRC_DIR = 'packages/renderer/src';
const HEX_ALLOWLIST = new Set([`${RENDERER_SRC_DIR}/styles/design-tokens.ts`]);

function lineOf(content: string, index = 0): number {
  return content.slice(0, index).split('\n').length;
}

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function verifyDesignSystem(rootDir: string): string[] {
  const problems: string[] = [];
  const files = listSourceFiles(join(rootDir, RENDERER_SRC_DIR));

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = relative(rootDir, file).replace(/\\/g, '/');

    for (const match of content.matchAll(/text-\[\d+(?:\.\d+)?px\]/g)) {
      problems.push(
        `[字号离阶] ${relativePath}:${lineOf(content, match.index)} "${match[0]}"，改用 12/14/16/24/36 阶`,
      );
    }

    for (const match of content.matchAll(/var\(\s*--ant-[a-z0-9-]+(?:\s*,[^)]*)?\)/g)) {
      problems.push(
        `[antd 变量越界] ${relativePath}:${lineOf(content, match.index)} "${match[0]}"，请走项目语义别名（--color-*）或 Tailwind 类`,
      );
    }

    if (HEX_ALLOWLIST.has(relativePath)) {
      continue;
    }
    for (const match of content.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      problems.push(
        `[硬编码颜色] ${relativePath}:${lineOf(content, match.index)} "${match[0]}"，改用 var(--color-*) 或语义类`,
      );
    }
  }

  return problems;
}

/**
 * 打包构建前置门禁（Pre-build Verification）
 *
 * 核心职责：在打包开始前（0 毫秒）执行静态拦截，防止配置违规导致的构建失败、体积膨胀或生产崩溃。
 * 1. 根目录 package.json name 规范校验（全小写无空格，杜绝 OTA 404 隐患）
 * 2. 根目录 package.json dependencies 边界校验（仅限 @app/main，防止 node_modules 卷入 asar 体积膨胀）
 * 3. renderer 样式门禁：禁止 text-[Npx] 离阶字号、--ant-* 越界与种子之外的 hex 颜色
 *
 * 主进程 external 为 packages/main/vite.config.ts 中的显式清单（electron / usb / electron-updater），
 * 新增运行时依赖需人工确认是否外置；原「dependencies 与 external 双向对齐」门禁已删除。
 */
export async function verifyPrebuild(): Promise<VerificationResult> {
  const rootDir = findRepoRoot(__dirname);
  const errors: string[] = [];

  console.log('🔍 [verify-prebuild] 开始执行打包前置静态门禁校验...');

  const rootPkgPath = join(rootDir, 'package.json');
  if (!fs.existsSync(rootPkgPath)) {
    throw new Error(`找不到根目录 package.json: ${rootPkgPath}`);
  }

  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

  // 1. 根目录 package.json name 命名规范校验（彻底杜绝 OTA 404 与非法文件名）
  if (typeof rootPkg.name !== 'string' || !/^[a-z0-9-_]+$/.test(rootPkg.name)) {
    errors.push(
      `[根目录 name 违规] 根 package.json 的 "name" 字段 ("${rootPkg.name}") 不符合规范。\n` +
        `  -> 规范要求: 必须为纯小写字母、数字、中划线或下划线组合 (/^[a-z0-9-_]+$/)，绝对禁止空格、大写字母与特殊字符（如 @ 或 /），` +
        `以确保 electron-builder 生成的产物文件名与 latest.yml 索引在网络发布与 OTA 自动更新时 100% 寻址成功。`,
    );
  } else {
    console.log(`  ✅ 根目录 package.json name 规范校验通过: "${rootPkg.name}"`);
  }

  // 2. 根目录 package.json dependencies 边界校验（防退化门禁）
  const rootDeps = Object.keys(rootPkg.dependencies || {});
  const allowedRootDeps = ['@app/main'];

  const illegalRootDeps = rootDeps.filter((dep) => !allowedRootDeps.includes(dep));
  if (illegalRootDeps.length > 0) {
    errors.push(
      `[根目录依赖违规] 根 package.json 的 dependencies 中检测到非法依赖: ${JSON.stringify(illegalRootDeps)}。\n` +
        `  -> 规范要求: 根目录 dependencies 严格仅允许 ['@app/main']，` +
        `任何其他子包（如 @app/renderer, @app/preload）或第三方依赖必须置于 devDependencies，` +
        `以防止 electron-builder 扫描依赖树时将非主进程模块卷入 app.asar 导致体积膨胀。`,
    );
  } else {
    console.log('  ✅ 根目录 dependencies 边界校验通过 (严格仅限 @app/main)');
  }

  // 3. renderer 样式门禁（详见 DESIGN.md §2 §8）
  const designProblems = verifyDesignSystem(rootDir);
  if (designProblems.length > 0) {
    errors.push(...designProblems);
  } else {
    console.log('  ✅ renderer 样式规范校验通过 (字号阶 / 颜色令牌)');
  }

  // en-US 词条门禁不在此处：缺译/空译由 CI 的 `pnpm i18n:check`（lingui check missing）负责

  const valid = errors.length === 0;
  if (!valid) {
    console.error('\n❌ [verify-prebuild] 前置规范校验失败:');
    for (const error of errors) {
      console.error(`\n• ${error}`);
    }
  } else {
    console.log('🎉 [verify-prebuild] 打包前置门禁检查全部通过！准备进入打包阶段...\n');
  }

  return { valid, errors };
}

// CLI 直启入口
if (
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('verify-prebuild.ts')
) {
  verifyPrebuild()
    .then(({ valid }) => {
      if (!valid) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('❌ [verify-prebuild] 执行异常:', err);
      process.exit(1);
    });
}
