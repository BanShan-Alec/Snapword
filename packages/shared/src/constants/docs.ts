/**
 * 项目文档站（GitHub Pages）的跨端单一真源。
 *
 * - 完整 URL 供渲染进程 iframe 与外链使用；
 * - origin 供主进程子框架匹配与生产 CSP 的 frame-src 使用。
 *
 * fork 后的完整改坐标清单（含 README 徽章、basePath）见文档站「使用此模板」页
 * （/introduction/use-this-template）；文档站自身的构建 basePath 见 packages/docs/src/navigation.ts。
 */
export const PROJECT_DOCS_URL = 'https://banshan-alec.github.io/electron-react-monorepo-template/';

export const PROJECT_DOCS_ORIGIN = new URL(PROJECT_DOCS_URL).origin;
