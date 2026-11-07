// 文档站 Service Worker：只做「访问过什么缓存什么」的运行时缓存，不做全量 precache。
//
// 缓存名从 registration.scope 推导，清理时只删本前缀，避免误删同 origin 下
// 其他 GitHub Pages 项目（banshan-alec.github.io）的 Cache Storage。

const SCOPE = new URL(self.registration.scope);
const SCOPE_PATH = SCOPE.pathname; // /electron-react-monorepo-template/
const CACHE_PREFIX = `docs${SCOPE_PATH.replace(/\/+$/, '').replace(/[^a-z0-9]+/gi, '-')}`;
const VERSION = 'v1';
const HTML_CACHE = `${CACHE_PREFIX}-html-${VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}-asset-${VERSION}`;
const OFFLINE_URL = new URL('offline.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(HTML_CACHE);
      await cache.add(OFFLINE_URL);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(`${CACHE_PREFIX}-`) && key !== HTML_CACHE && key !== ASSET_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith(`${SCOPE_PATH}assets/`)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// 首次访问时 SW 尚未控制页面，首屏资源不会被 fetch 事件截到；
// 页面在 navigator.serviceWorker.ready 后把当前页 HTML 与已加载资源发过来补缓存。
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_URLS') return;

  const html = typeof data.html === 'string' ? data.html : null;
  const assets = Array.isArray(data.assets) ? data.assets : [];
  event.waitUntil(cacheCurrentPage(html, assets));
});

async function cacheCurrentPage(html, assets) {
  const htmlCache = await caches.open(HTML_CACHE);
  const assetCache = await caches.open(ASSET_CACHE);

  if (html) {
    await cacheUrl(htmlCache, html, { cache: 'no-cache' });
  }

  await Promise.all(
    assets.map((asset) => {
      if (typeof asset !== 'string') return undefined;
      return cacheUrl(assetCache, asset);
    }),
  );
}

async function cacheUrl(cache, rawUrl, options) {
  const url = new URL(rawUrl, self.registration.scope);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;

  try {
    const response = await fetch(url.href, options);
    if (response.ok) await cache.put(url.href, response);
  } catch (error) {
    // 单个资源失败不影响其他资源，但保留排查线索
    console.warn('[docs-sw] cache failed', url.href, error);
  }
}

async function networkFirst(request) {
  const cache = await caches.open(HTML_CACHE);

  try {
    // no-cache 绕过 GH Pages 的 max-age=600，在线时优先拿新 HTML
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL, { ignoreVary: true });
    return offline || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || Response.error());

  return cached || network;
}
