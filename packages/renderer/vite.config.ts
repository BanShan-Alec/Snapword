import path from 'node:path';
import { lingui } from '@lingui/vite-plugin';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { APP_IDENTITY } from '../../build/lib/app-identity.ts';
import { findRepoRoot } from '../../build/lib/repo-paths.ts';
import { getSentryBuildOptions } from '../../build/lib/sentry-options.ts';
import { appTitlePlugin } from './plugins/app-title.ts';
import { startupShellInlinePlugin } from './plugins/startup/shell-plugin.ts';

const currentDir = import.meta.dirname;
const rootDir = findRepoRoot(currentDir);
const sentryOptions = getSentryBuildOptions(currentDir);

// https://vite.dev/config/
export default defineConfig({
  // 环境变量单一事实源：Monorepo 全局统一定义在根目录 .env，子包不设独立 .env
  envDir: rootDir,
  base: './',
  // 运行时环境单一事实源：由 Preload 通过 additionalArguments 注入至 window.__APP_ENV__，前端不走编译期 define
  plugins: [
    tailwindcss(),
    // React Compiler 走 OXC 移植版（oxc-transform-react），不引 Babel——符合 CONTRIBUTING §一.5 构建工具链时代规则
    react({ compiler: true }),
    lingui({
      configPath: path.resolve(currentDir, 'lingui.config.ts'),
      cwd: currentDir,
      macroTransform: true,
    }),
    sentryVitePlugin({
      org: sentryOptions.sentryOrg,
      project: sentryOptions.sentryProject,
      authToken: sentryOptions.sentryAuthToken,
      telemetry: false,
      disable: !sentryOptions.sentryAuthToken,
      release: {
        name: sentryOptions.releaseName,
      },
      sourcemaps: {
        filesToDeleteAfterUpload: ['dist/**/*.map'],
      },
    }),
    // 开发态根路径自动重定向至 home 窗口入口，便于浏览器直接访问 dev server
    {
      name: 'html-entry-redirect',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            req.url = '/src/entries/home/index.html';
          }
          next();
        });
      },
    },
    // 窗口标题占位符注入（dev/build 同一形态）：两入口 <title> 统一取根 productName
    appTitlePlugin({ root: currentDir, appName: APP_IDENTITY.productName }),
    // 启动壳占位符内联（dev/build 同一形态），契约见 specs/first-screen-loading.md §4.7
    startupShellInlinePlugin({ root: currentDir }),
  ],
  // 路径别名单一事实源：根 tsconfig.json + Vite 官方原生 tsconfigPaths（零插件）
  tsconfig: '../../tsconfig.json',
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // port 从 scripts/dev.ts 的 config.rendererPort 注入
    strictPort: true,
    host: true,
    hmr: {
      overlay: false,
    },
  },
  build: {
    // 使用 'hidden' 模式：仅生成 .map 文件供 Sentry 插件上传，不在 JS 产物末尾写入 sourceMappingURL 注释；
    // 配合 electron-builder 的 '!**/*.map' 排除规则，确保 SourceMap 绝不会被打包进 asar，彻底避免源码泄露
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        home: path.resolve(currentDir, 'src/entries/home/index.html'),
        updater: path.resolve(currentDir, 'src/entries/updater/index.html'),
      },
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 1. 最稳定核心运行时：React 核心包（精准路径匹配，避免 @lingui/react 等外围库污染）
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react';
            }
            // 2. UI 框架：Ant Design 及其样式/图标/底层 RC 库
            if (/[\\/]node_modules[\\/](antd|@ant-design|rc-[a-z0-9-]+)[\\/]/.test(id)) {
              return 'vendor-antd';
            }
          }
        },
      },
    },
  },
});
