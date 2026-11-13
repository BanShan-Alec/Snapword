import { defineConfig } from 'vite';

const isDev = process.env.MODE === 'development';

export default defineConfig({
  // 与 packages/main/vite.config.ts 保持同一套构建默认值，改动时两边同步
  build: {
    ssr: true,
    sourcemap: isDev ? 'inline' : 'hidden',
    minify: isDev ? false : 'oxc',
    outDir: 'dist',
    assetsDir: '.',
    target: 'chrome130',
    lib: {
      entry: 'src/index.ts',
      formats: ['cjs'],
    },
    rolldownOptions: {
      external: ['electron'],
      output: {
        entryFileNames: 'index.cjs',
        format: 'cjs',
      },
    },
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  ssr: {
    noExternal: true,
  },
});
