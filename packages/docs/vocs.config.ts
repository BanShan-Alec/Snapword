import { defineConfig } from 'vocs/config';
import { BASE_PATH, SIDEBAR } from './src/navigation';

// Vocs 不设置 NODE_ENV（build 时 config 先于 Vite 赋值被加载），
// 文档站脚本固定是 `cli.js dev|build`，因此用 argv 判断 dev。
const isDev = process.argv[2] === 'dev';

// 文档站离线：注册 sw.js，并在 SW 就绪后把当前页 HTML 与已加载资源补进缓存。
// 首次访问时 SW 尚未控制页面，首屏资源不会被 fetch 事件截到，需要这一步。
const SW_REGISTER_SCRIPT = `
(function () {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register(${JSON.stringify(`${BASE_PATH}sw.js`)}, {
      scope: ${JSON.stringify(BASE_PATH)},
      updateViaCache: 'none',
    })
    .then(function () {
      return navigator.serviceWorker.ready;
    })
    .then(function (registration) {
      const assets = performance
        .getEntriesByType('resource')
        .map(function (entry) { return entry.name; })
        .filter(function (url) { return url.indexOf(location.origin) === 0; });
      if (registration.active) {
        registration.active.postMessage({
          type: 'CACHE_URLS',
          html: location.href,
          assets: assets,
        });
      }
    })
    .catch(function () {});
})();
`;

export default defineConfig({
  // 注意：必须从 vocs/config 子路径导入。主入口会拉起 React 组件链，
  // 其中的 ~icons 虚拟包在配置加载阶段无法解析（见 packages/docs 迁移记录）。
  basePath: BASE_PATH,
  // 站点品牌 = 根 package.json 的 productName；改动时两处须同步
  title: 'Electron React Template',
  description: '常见 Electron 坑位的解法目录：每个解法都有本仓库经过发版验证的真实实现可抄',
  // favicon 共用应用图标。注意：iconUrl 是原样引用、不会自动补 basePath，子路径部署必须带前缀。
  // public/icon.png 是 build/resources/icon.png 的手工副本（docs 独立部署，必须自带 public 资源）；
  // 换品牌图标时两处一起复制，主源与导出步骤见 build/electron-builder.ts。
  // 不配 logoUrl：Logo 组件配了它就只渲染图不渲染文字，导航栏会剩一颗孤立小图标、
  // 与侧栏 _slots.tsx SidebarHeader 的「图+品牌名」行重叠；品牌展示统一交给 SidebarHeader。
  iconUrl: '/electron-react-monorepo-template/icon.png',
  // 默认 dynamic 是 Node 服务形态；GitHub Pages 纯静态托管必须显式 full-static
  renderStrategy: 'full-static',
  // dev 不注入注册脚本，避免 SW 缓存 Vocs HMR 资源
  ...(isDev ? {} : { head: { script: [{ innerHTML: SW_REGISTER_SCRIPT }] } }),
  socials: [
    {
      icon: 'github',
      link: 'https://github.com/BanShan-Alec/electron-react-monorepo-template',
    },
  ],
  // 注意：不配 redirects——它是 waku 运行时中间件，full-static 部署（GitHub Pages）执行不到。
  // redirects: [
  //   { source: '/introduction/', destination: '/introduction/what-is-this' },
  // ],
  // 所以站点不做旧 URL 跳转：README、侧栏、首页目录的入口一律直指具体页面。
  sidebar: SIDEBAR,
});
