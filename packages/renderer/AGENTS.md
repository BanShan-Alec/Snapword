# @app/renderer AGENTS.md — 渲染进程架构与规则

> 全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。本文件为该包规则唯一真源。
> 视觉与 token 纪律另见 [docs/DESIGN.md](./docs/DESIGN.md)。

## 1. 架构分层与目录职责

`src/` 下代码严格按所有权与副作用分层，常规文件结构如下：

| 目录          | 核心职责                                                              | 依赖与可见性约束                                                |
| :------------ | :-------------------------------------------------------------------- | :-------------------------------------------------------------- |
| `entries/`    | 多窗口独立挂载入口（MPA 架构：`home/`, `updater/`）                   | 仅做顶层根节点挂载与全局 Provider 装配                          |
| `features/`   | 业务域实现（各领域自包含模块）                                        | 外部仅允许引用域入口 `index.tsx`，域间禁止互相 import           |
| `components/` | 跨 feature 复用的通用 UI（`ui/` 展示原子，`layout/` 全局骨架）        | 一组件一文件夹（`Xxx/index.tsx`），被 2 个以上域共用才上提      |
| `hooks/`      | 跨域基础 hooks（`useManualRequest`, `useIpc`, `useTheme`）            | 请求与应用级状态抽象，禁止在业务组件中直连原生 ahooks           |
| `lib/`        | 跨域底层能力（`ipc.ts` 契约解构与追踪、`classNames.ts`、`sentry.ts`） | 纯工具函数与全局运行时初始化                                    |
| `locales/`    | LinguiJS 国际化模块（`zh-CN`, `en-US` 字典与 `dynamicActivate`）      | 中文源码作为 msgid（Source-as-Key），运行时按需加载语言包 Chunk |
| `stores/`     | 全局 Zustand 状态（主题、语言等跨窗口/跨域状态）                      | 仅存放全应用级公共状态                                          |

## 2. 分层依据

**第一层：按所有权切**——只服务单一业务域的代码必须就近收敛在 `features/<domain>/`；仅当真实出现第二个独立消费者时，才允许上提到顶层 `components/`、`hooks/`、`lib/` 或 `stores/`。
`components/` 属于“跨域 UI”，`hooks/` 与 `lib/` 属于“跨域能力”，`stores/` 属于“跨域状态”。

**第二层：按有无副作用切**——`features/<domain>/hooks/` 统一持有状态与 IPC 副作用，输出 View Model（`{ state, handlers }`）；
`features/<domain>/components/` 保持纯展示，仅通过 props 接收数据、通过 callback 输出交互，不碰 IPC、不持有跨卡片状态。

**依赖方向单向流动**：严格遵循 `entries ➔ features ➔ 跨域层`。Feature 之间互相独立，禁止互相 import；唯一合法例外是 `dashboard` 编排域，跨域组合一律在此完成。

## 3. Feature 规范

### 1. 入口驱动与胶水容器

每个 feature 的 `index.tsx` 是**唯一**允许被外部 import 的文件，只导出顶层入口组件。外部严禁出现深层路径引用（如 `@/features/<domain>/hooks/...`）。
入口只负责“调用本域 hook 并向卡片传递 props”。一旦入口里出现条件分支、跨 feature 组合或数据计算，说明域边界划分有误，应当拆分而非往入口里堆砌逻辑。

### 2. 状态下沉与共享提取

hook 实例化必须落在 feature 内部。没有跨域共享需求就不上提——在 App.tsx 集中实例化所有 hook 会让壳层与各个域强耦合，随业务增长线性劣化。
不要预先抽取公共代码。只有当第二个消费者真实出现时，才把 UI 提到 `components/`、把纯函数提到 `lib/`、把 hook 提到 `hooks/`。

### 3. 多卡片与子域组织（`sections/`）

一个域允许返回 Fragment 渲染多张卡片，拆分或合并域的标准在于两张卡片是否共享同一份状态与生命周期。
默认保持扁平。只有当父域需统一控制二级子域的显隐、权限或展示时，才允许二级目录 `sections/`，每个 section 自包含：
- 外部只允许 `import { XFeature } from "@/features/x"`，出现 `@/features/x/sections/...` 即为越界。
- section 之间禁止互相 import；深度上限 2 层（`domain/section`）。

## 4. 请求层与 manual-only 铁律

所有 IPC 通信必须走安全包装层，严禁在业务中手写 `window.api.*` + `if (!res.success)` 散装解构。

- **调用原语**：单接口请求一律使用 `useIpc('domain.method', options)`（由点分路径推导入参与解包类型，失败抛出 `IpcError`）；多通道业务编排使用 `useManualRequest` 并在内部按需调用 `callIpc('domain.method', args?)`（无参可省略 `args`）。非 Result 契约的辅助 API（如 `getPathForFile`）直接调用。
- **manual-only 铁律**：所有异步请求写死 `manual: true`，严禁隐式触发。禁止使用 `refreshDeps`、`pollingInterval`、`refreshOnWindowFocus` 与自动防抖。请求必须显式由事件回调或挂载 `useEffect` 触发；防抖统一用 `useDebounceFn`，轮询统一用 `useInterval`。
- **三层刚性拦截**：类型层（`Omit` 剔除 16 个自动触发键）、Lint 门禁（`noRestrictedImports` 禁止直连 `ahooks` 的 `useRequest`）与 CI 构建。
- **日志与安全纪律**：仅记录 channel、耗时与结果状态；严禁在日志中打印包含敏感路径与 URL 的入参 body。

## 5. 组件书写约定与七段式语义模板

### 1. 结构与导出纪律

- **一组件一文件夹**：组件一律为 `Xxx/index.tsx`（PascalCase 目录，本体实现而非桶文件，不触发 Biome `noBarrelFile`）。
- **Props 接口规范**：Props 类型必须使用 `export interface XxxProps` 声明（空 props 统一采用 `export type XxxProps = Record<string, never>`），禁止行内字面量。
- **导出与 Memo 规范**：展示卡片统一使用具名导出并包裹 `memo`（`export const X = memo(_X)`，杜绝 `export default`）；入口容器组件使用 `export { XFeature }`，不套 memo。
- **React Compiler 纪律**：全仓由 React Compiler 全自动接管依赖记忆化，禁止手写样板式 `useMemo` 与 `useCallback`；遵守组件纯函数渲染，严禁在 render 期间读写 `ref.current`（Biome `useReactCompiler` 为 error 刚性阻断）。展示组件按约定包裹外层 `memo(_Xxx)` 导出以阻断跨组件重渲染。
- **附属物就近原则**：组件私有 hook、样式与辅助函数维护在组件目录内；跨组件共享的上提顶层。别名 `@/` 指向 `src/*`，跨端契约仅消费 `@app/shared`。

### 2. 组件代码七段式语义模板

组件源码必须严格按以下语义块自上而下单向布局，禁止状态、异步与副作用穿插混杂：

```tsx
// 1. 私有常量（模块级静态配置，组件外声明避免 re-render 重复分配内存）
const DEFAULT_PAGE_SIZE = 20;

// 2. 可抽离的纯逻辑/子渲染函数（无外部 hook 依赖，便于单独单测）
function formatItem(item: Item) { return ...; }

// 3. 组件本体（私有命名 _Xxx）
const _UserCard = (props: UserCardProps) => {
  useLingui(); // 多语言响应订阅

  // ① 变量声明、解构（Props 属性、全局 Store / Context）
  const { title, userId, onRefresh } = props;
  const { message } = App.useApp();

  // ② 组件状态（useState, useRef, useReducer 等本地可变状态）
  const [filterText, setFilterText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // ③ 网络IO / 异步操作（useIpc, useManualRequest 等通信 Hooks）
  const { data, loading, runAsync } = useIpc('user.get');

  // ④ 数据转换 / 派生（React Compiler 自动记忆化推导，无需手动 useMemo）
  const filteredList = data?.filter((item) => item.name.includes(filterText)) ?? [];

  // ⑤ 逻辑处理函数（事件响应回调、交互处理 handler）
  const handleItemClick = (id: string) => { ... };

  // ⑥ 组件 Effect（useEffect 外部系统同步、事件监听与清理）
  useEffect(() => { ... }, [userId]);

  // ⑦ 组件渲染（返回单一或片段 JSX 结构）
  return <AppCard title={title}>...</AppCard>;
};

// 4. Props 类型定义（必须具名 export interface）
export interface UserCardProps {
  title: string;
  userId: string;
  onRefresh?: () => void;
}

// 5. 导出与 Memo（展示组件统一 memo 包装具名导出）
export const UserCard = memo(_UserCard);
```

> **语义分块纪律**：
> 1. **静态在外、动态在内**：常量与纯函数必须提取到组件函数体外部，不占用重渲染开销。
> 2. **单向线性流**：函数体内严格遵循 `解构 ➔ State ➔ IO ➔ 派生 ➔ Handlers ➔ Effect ➔ JSX`。
> 3. **无内容占位**：纯展示卡片若无“网络IO”或“Effect”，可保留单行注释占位或自然跳过，但绝不可颠倒相对顺序。

## 6. 国际化 (i18n)

- **源码直书中文**：文案以 LinguiJS 的 `t` 宏包裹（`t`文案``），中文原文即 msgid（Source-as-Key），杜绝层级 JSON 键名。
- **提取与完整性校验**：改动文案后必须在根目录执行 `pnpm i18n:extract` 抽词条并补充 `en-US/messages.po` 翻译，随后运行 `pnpm i18n:check`（缺译即失败）。
- **动态按需加载**：`locales/i18n.ts` 经 `dynamicActivate` 动态加载语言包 Chunk，组件通过 `useLingui()` 响应式监听语言切换。

## 7. 提交前门禁

- 根目录执行：`pnpm typecheck` · `pnpm lint` · `pnpm test`。
- 文案改动追加执行：`pnpm i18n:check`。
