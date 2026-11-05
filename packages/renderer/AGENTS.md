# @app/renderer AGENTS.md — 渲染进程规则（AI 必读）

> 全局红线与全仓任务路由见 [根 AGENTS.md](../../AGENTS.md)。本文件为该包规则唯一真源。
> 视觉与 token 纪律另见 [docs/DESIGN.md](./docs/DESIGN.md)。

## 1. 架构分层与目录职责

`src/` 下代码严格按所有权与副作用分层，常规文件结构如下：

| 目录          | 核心职责                                                                                | 依赖与可见性约束                                                |
| :------------ | :-------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| `entries/`    | 多窗口独立挂载入口（MPA 架构：当前 `home/` 主窗口）                                     | 仅做顶层根节点挂载与全局 Provider 装配                          |
| `features/`   | 业务域实现（`translate` / `vocabulary` / `history` / `glossary` / `settings` / `help`） | 外部仅允许引用域入口 `index.tsx`，域间禁止互相 import           |
| `components/` | 跨 feature 复用的通用 UI（`layout/` 全局骨架，`startup/` 首屏壳组件）                   | 一组件一文件夹（`Xxx/index.tsx`），被 2 个以上域共用才上提      |
| `hooks/`      | 跨域基础 hooks（`useTheme`, `usePlatform`）                                             | 请求与应用级状态抽象，禁止在业务组件中直连原生 ahooks           |
| `lib/`        | 跨域底层能力（`ipc.ts` 契约解构与追踪、`classNames.ts`、`sentry.ts`）                   | 纯工具函数与全局运行时初始化                                    |
| `locales/`    | LinguiJS 国际化模块（`zh-CN`, `en` 字典与 `dynamicActivate`）                           | 中文源码作为 msgid（Source-as-Key），运行时按需加载语言包 Chunk |
| `startup/`    | 首屏启动壳协调器（构建期内联注入 `index.html`）                                         | 三门禁齐备后结算并挂载 `body.app-startup-ready`                 |
| `stores/`     | 全局 Zustand 状态（主题、语言等跨窗口/跨域状态）                                        | 仅存放全应用级公共状态                                          |

> 卡片窗口的独立 renderer 入口随 P5 主链路落地；新增入口一律放 `entries/<window>/`，不与主窗口共用入口。

## 2. 分层依据

**第一层：按所有权切**——只服务单一业务域的代码必须就近收敛在 `features/<domain>/`；仅当真实出现第二个独立消费者时，才允许上提到顶层 `components/`、`hooks/`、`lib/` 或 `stores/`。
`components/` 属于“跨域 UI”，`hooks/` 与 `lib/` 属于“跨域能力”，`stores/` 属于“跨域状态”。

**第二层：按有无副作用切**——`features/<domain>/hooks/` 统一持有状态与 IPC 副作用，输出 View Model（`{ state, handlers }`）；
`features/<domain>/components/` 保持纯展示，仅通过 props 接收数据、通过 callback 输出交互，不碰 IPC、不持有跨卡片状态。

**依赖方向单向流动**：严格遵循 `entries ➔ features ➔ 跨域层`。Feature 之间互相独立，禁止互相 import；跨域组合一律在 `entries/home/App.tsx` 的路由编排中完成。

## 3. Feature 规范

### 1. 入口驱动与胶水容器

每个 feature 的 `index.tsx` 是**唯一**允许被外部 import 的文件，只导出顶层入口组件。外部严禁出现深层路径引用（如 `@/features/<domain>/hooks/...`）。
入口只负责“调用本域 hook 并向视图传递 props”。一旦入口里出现条件分支、跨 feature 组合或数据计算，说明域边界划分有误，应当拆分而非往入口里堆砌逻辑。

### 2. 状态下沉与共享提取

hook 实例化必须落在 feature 内部。没有跨域共享需求就不上提——在 App.tsx 集中实例化所有 hook 会让壳层与各个域强耦合，随业务增长线性劣化。
不要预先抽取公共代码。只有当第二个消费者真实出现时，才把 UI 提到 `components/`、把纯函数提到 `lib/`、把 hook 提到 `hooks/`。

### 3. 多卡片与子域组织（`sections/`）

一个域允许返回 Fragment 渲染多张卡片，拆分或合并域的标准在于两张卡片是否共享同一份状态与生命周期。
默认保持扁平。只有当父域需统一控制二级子域的显隐、权限或展示时，才允许二级目录 `sections/`，每个 section 自包含：
- 外部只允许 `import { XFeature } from "@/features/x"`，出现 `@/features/x/sections/...` 即为越界。
- section 之间禁止互相 import；深度上限 2 层（`domain/section`）。

## 4. 请求层与 manual-only 铁律

所有 IPC 通信必须走 `lib/ipc.ts`，禁止在 feature 里直接手写 `window.api.*` + `if (!res.success)`：
统一拿到解构后的 `data`、统一抛出带 `code` 的 `IpcError`、统一链路计时与日志。当前唯一入口是 `callIpc`；`useIpc` / `useManualRequest` 请求 hooks 随 P5 主链路引入，落地后按下述规则执行。

```ts
// 单通道调用：类型推导自 API 契约，data 为 Result 的解包 T
const { data, runAsync } = useIpc('config.update', window.api.config.update, {
  onError: (err) => message.error(`更新失败: ${err.message}`),
});

// 多通道编排：状态归 useManualRequest，内部通过 callIpc 组合
const { runAsync: runOp } = useManualRequest(async (action: VocabularyAction) => {
  return callIpc('vocabulary.' + action, window.api.vocabulary[action], [{ term }]);
});
```

| 场景                                        | 推荐用法                                             |
| :------------------------------------------ | :--------------------------------------------------- |
| 一次请求对一个 channel                      | `useIpc(channel, window.api.x.y)`                    |
| 一个动作路由到多个 channel                  | `useManualRequest(service)`，内部调用 `callIpc(...)` |
| 失败属于正常业务流程（如用户取消）          | 业务 hook 内自行处理为状态，不抛出为 IpcError        |
| 非 Result 形态的 API（如 `getPathForFile`） | 直接调用，不走 IPC 包装层                            |

### manual-only 铁律

- 异步请求一律使用 `useManualRequest`（`manual: true` 硬编码），请求发起必须显式调用 `run()/runAsync()`。
- **一切自动触发能力一律禁止**：禁止使用 `refreshDeps`、轮询 `pollingInterval`、聚焦刷新 `refreshOnWindowFocus` 或自动防抖节流。触发必须写在明处（事件处理函数或显式 `useEffect`）。
- **三层刚性拦截**：类型层（`Omit` 剔除自动触发配置项）、Lint 层（`noRestrictedImports` 禁止直连 `ahooks` `useRequest`）与 CI 门禁。防抖请用 `useDebounceFn`，轮询请用 `useInterval`。
- **日志纪律**：开发态打印 channel + 耗时 + 结果；生产态仅输出单行 `console.info`。严禁在日志中打印包含敏感路径与 URL 的入参 body。

## 5. 组件书写约定与七段式语义模板

### 1. 结构与导出纪律

- **一组件一文件夹**：组件一律为 `Xxx/index.tsx`（PascalCase 目录，本体实现而非桶文件，不触发 Biome `noBarrelFile`）。
- **Props 接口规范**：Props 类型必须使用 `export interface XxxProps` 声明（空 props 统一采用 `export type XxxProps = Record<string, never>`），禁止行内字面量。
- **导出与 Memo 规范**：展示卡片统一使用具名导出并包裹 `memo`（`export const X = memo(_X)`，杜绝 `export default`）；入口容器组件使用 `export const XFeature = ...`，不套 memo。
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
  const { data, loading, runAsync } = useIpc('user.get', window.api.user.get);

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
- **提取与完整性校验**：改动文案后必须在根目录执行 `pnpm i18n:extract` 抽词条并补充 `en/messages.po` 翻译，随后运行 `pnpm i18n:check`（缺译即失败）。
- **动态按需加载**：`locales/i18n.ts` 经 `dynamicActivate` 动态加载语言包 Chunk，组件通过 `useLingui()` 响应式监听语言切换。

## 7. 提交前门禁

- 根目录执行：`pnpm typecheck` · `pnpm lint` · `pnpm test`。
- 文案改动追加执行：`pnpm i18n:check`。
