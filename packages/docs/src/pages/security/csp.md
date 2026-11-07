---

title: 内容安全策略（CSP）
description: 生产态收紧 CSP 响应头，外链与页面导航双白名单拦截，判定权纯归主进程。
---

# 内容安全策略（CSP）

> **TL;DR**：生产环境彻底剔除 `'unsafe-eval'` 与通配 `https:`，仅放行自身同源、内联样式与静态媒体；开发态按需放行 Vite HMR 的 `ws:` 协议；窗口外链拦截并仅转交系统浏览器，页面跳转拦截非放行 Origin。

## 1. 选型理由

Electron 默认未开启严格安全策略时，渲染进程面临严重安全隐患：
1. **XSS 穿透与 RCE 风险**：一旦渲染层存在 XSS 漏洞，注入脚本可任意加载外部远程恶意脚本，并结合 `eval()` 执行恶意代码。
2. **窗口任意导航（Phishing）**：恶意脚本可通过 `window.open` 或修改 `window.location` 将当前窗口重定向到钓鱼网站，伪造登录界面窃取凭证。

工程采取「分环境严格 CSP 头 + 外链/导航主进程双白名单」构建安全护城河。

## 2. 核心机制

### 生产与开发双分流 CSP 响应头注入

主进程在全局网络请求（`onHeadersReceived`）统一拦截并追加 CSP 响应头：

→ 源码：[packages/main/src/modules/security/csp.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/security/csp.ts)

```ts
const isDev = !import.meta.env.PROD;

// 动态提取配置的 API 网关 Origin（若配置则追加放行）
const apiBaseUrl = getEnv('API_BASE_URL');
const apiOrigin = getValidOrigin(apiBaseUrl);
const connectSrc = apiOrigin ? `'self' ${apiOrigin}` : "'self'";

// 开发态：放行 ws: 与 http: 以保障 Vite HMR 热更；
// 生产态：收紧策略，剔除 unsafe-eval，放行首屏协调器内联脚本与静态媒体，并动态放行 apiBaseUrl
const cspPolicy = isDev
  ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http: ws:;"
  : `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ${connectSrc};`;

defaultSession.webRequest.onHeadersReceived((details, callback) => {
  const responseHeaders = { ...details.responseHeaders };
  const existingKey = Object.keys(responseHeaders).find(
    (key) => key.toLowerCase() === 'content-security-policy',
  );

  // 追加策略，不破坏上游自带安全头
  if (existingKey) {
    const existingVal = responseHeaders[existingKey];
    const existingArray = Array.isArray(existingVal) ? existingVal : [existingVal];
    responseHeaders[existingKey] = [...existingArray, cspPolicy];
  } else {
    responseHeaders['Content-Security-Policy'] = [cspPolicy];
  }
  callback({ responseHeaders });
});
```

### 窗口外链拦截（setWindowOpenHandler 恒拒绝）

无论点击何种链接，`setWindowOpenHandler` 一律返回 `{ action: 'deny' }`，仅匹配白名单时委托系统默认浏览器打开：

→ 源码：[packages/main/src/modules/security/external-urls.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/main/src/modules/security/external-urls.ts)

```ts
contents.setWindowOpenHandler(({ url }) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (ALLOWED_EXTERNAL_URLS.includes(parsed.origin)) {
        shell.openExternal(url);
      }
    }
  } catch {}
  return { action: 'deny' }; // 应用内恒不开启不受控的新窗口
});
```

页面内导航通过 `contents.on('will-navigate')` 拦截，非放行 Origin 直接 `event.preventDefault()`。

## 3. 桌面端避坑注意事项

- **首屏协调器内联脚本与 `script-src` 阻断**：
  - 首屏启动协调器（Coordinator）作为轻量原生 IIFE 脚本直接内联在 `index.html` 中以实现零白屏揭幕。若生产态 CSP 误收紧为 `script-src 'self'`（遗漏 `'unsafe-inline'`），Chromium 会静默拦截该内联脚本执行，导致首屏揭幕永远无法完成（`body.app-startup-ready` 缺失），最终引发 Playwright E2E 或 postbuild 验真全量超时挂死。因此生产态必须保留 `'unsafe-inline'` 或采用 hash 校验。
- **动态提取并放行 `API_BASE_URL` Origin**：
  - 生产态下若渲染进程需直接发起 API 网络请求，严禁粗暴声明通配符 `connect-src https:`。主进程应通过 `getValidOrigin(getEnv('API_BASE_URL'))` 动态解析合法 Origin 并注入到 CSP 的 `connect-src 'self' ${apiOrigin}` 中，兼顾安全性与跨环境灵活性。
- **CSP 是“追加叠加”而非覆盖**：
  - 响应头中若已存在第三方或上游自带的 CSP，追加注入意味着规则将按照两者交集**更加收紧**，后注入的策略绝不可能放开前者的限制。
- **第三方外部资源放行规范**：
  - 若生产业务需要请求特定的第三方 API 或加载外部头像 CDN，切勿简单恢复 `https:` 全量通配，必须在 `connect-src` 或 `img-src` 中逐个按确切域名加入白名单。
- **安全判定权纯归主进程**：
  - 渲染进程不具备任何自行修改 CSP 或打开外链的权限。白名单虽定义在 `@app/shared`，但消费与裁决永远由主进程原生事件闭环执行。
