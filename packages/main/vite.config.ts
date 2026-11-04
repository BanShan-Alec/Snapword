import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const isDev = process.env.MODE === 'development';

const pkgPath = path.resolve(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const runtimeDependencies = Object.keys(pkg.dependencies ?? {});

export default defineConfig({
  build: {
    // 与 packages/preload/vite.config.ts 保持同一套构建默认值，改动时两边同步
    ssr: true,
    sourcemap: isDev ? 'inline' : 'hidden',
    minify: isDev ? false : 'oxc',
    outDir: 'dist',
    assetsDir: '.',
    target: 'node24',
    lib: {
      // 双入口：index.cjs = Electron 主进程；capture-service.cjs = 取词 utilityProcess
      // 独立 bundle（B-01 §5.1：utilityProcess.fork 加载，B-02 §1）。
      // 两个入口都不得 require 对方；shared 协议模块允许被提取为公共 chunk（同目录相对 require）。
      entry: {
        index: 'src/index.ts',
        'capture-service': 'src/capture-service/index.ts',
      },
      formats: ['cjs'],
    },
    rolldownOptions: {
      // 自动从 package.json 的 dependencies 提取运行时依赖设为 external（外加 electron）。
      // P4 骨架无运行时依赖：electron-log / zod 等纯 JS 依赖装在 devDependencies 并内联进 bundle
      external: ['electron', ...runtimeDependencies],
      output: {
        entryFileNames: '[name].cjs',
        chunkFileNames: '[name]-[hash].cjs',
        format: 'cjs',
      },
    },
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  ssr: {
    // 除 external 列表外全部内联
    noExternal: true,
  },
});
