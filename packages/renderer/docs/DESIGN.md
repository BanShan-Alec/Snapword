# DESIGN.md — renderer 视觉规范

AI 在 renderer 写样式的执行层规范。**颜色值不在这里复制**：唯一来源是 `src/styles/design-tokens.ts` 的 `BRAND_PRIMARY`，浅/深两套由 antd 算法派生并经 cssVar 暴露为 `--ant-*`。

## 0. 基线

- 组件库：antd v6 官方默认算法；布局壳：Tailwind v4 语义类。
- 视觉基线 = antd 默认。偏离 antd 的地方必须在本文件登记，不允许“顺手改一下”。
- 2026-10-29 决策：**不承诺 WCAG 2.2 AA**，不为对比度改品牌主色；已知例外见 §6。

## 1. 五条纪律

1. **禁硬编码**：颜色只用 `var(--color-*)` / Tailwind 语义类；字号不进任意值；间距走 4px 阶。
2. **层级秩序**：`index.css` 首行 `@layer theme, base, antd, components, utilities`，`AppProviders` 用 `<StyleProvider layer>` 收 antd 样式。覆盖只看层：utilities 压 antd；自有组件类进 `components`；**不写层外裸样式**。唯一豁免：`tokens.css` 的 `:root` 平台原语令牌（color-scheme / 滚动条 / 语法高亮——无 antd 对应物）。
3. **改品牌 = 改一个种子**：`BRAND_PRIMARY` → `ConfigProvider.theme.cssVar = { key: 'css-var-app' }` → antd 注入 `--ant-*`；`index.css` 的 `:root` 再映射成项目语义 `--color-*`。
4. **antd 组件样式只经 `antd-theme.ts` / `ConfigProvider`**：不在组件里写 `:global`、不覆盖 `.ant-*` 内部类；需要固定形态时封装组件（见 §4）。
5. **深浅色**：`applyColorScheme()` 统一切换 `data-theme` 与 `css-var-app` 作用域类；antd 算法由 `ConfigProvider` 随 `resolvedTheme` 切换。组件内不读 `prefers-color-scheme`。

## 2. 十二个系统

| 系统             | 取值                                                    | 规则                                              |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------- |
| font-size        | 12 / 14 / 16 / 24 / 36（`text-xs/sm/base/2xl/4xl`）     | 禁止 `text-[Npx]`；UI 最小 12px                   |
| font-weight      | 400 / 500 / 600                                         | 700 只出现在 antd 组件内部；正文不加粗            |
| line-height      | 默认；标题 `leading-tight`；长文/代码 `leading-relaxed` | 不逐处手调                                        |
| color            | 文字三档 + 语义四色（§3）                               | 语义色不做正文前景                                |
| margin / padding | Tailwind 4px 阶（Tabs 底边对缝允许 `-mb-px`）           | 组间距 > 组内距                                   |
| width            | 看板 `max-w-7xl`；架构 `max-w-5xl`                      | 同页不混用两种内容列宽                            |
| height           | 控件 28（SM）/ 32；卡片随内容                           | 行内等高由 `AppCard` body flex 承担               |
| box-shadow       | `.app-card` 一组三级投影，hover 时加深                  | 不另写自定义阴影                                  |
| border-radius    | 4（logo）/ 6（图标块）/ 8（卡片、面板）/ full（圆点）   | 内层半径 = 外层 − padding                         |
| border-width     | 统一 1px                                                | 更弱的分隔用透明度（`/40`、`/60`），不用更细的 px |
| opacity          | 表面/描边只用 10/20/30/40/60/80                         | 文字不用 alpha 造灰，取三档文字色                 |
| z-index          | 30（sticky header）/ 50（overlay）                      | 新增层级先登记，禁止 9999                         |

### 文案与膨胀

界面文案按 [国际化文案规范（Copy）](../../docs/src/pages/ui/i18n-copy.md) 的四条原则与长度预算写；布局侧守四条：

1. 不给文本容器写死宽度（`w-[...]`、`w-16` 只用于图标/圆点/Logo），按钮靠 `px` 与内容撑开。
2. 截断必须有兜底：文本一律单行 `truncate`（或 `line-clamp-*`），**仅在实际被截断时**用 `Tooltip` / 原生 `title` 显示全文；不靠放开换行把内容顶成两行（会破坏卡片头高度节奏）。
3. `justify-between` 行允许换行（`flex-wrap` + `gap-y`），不靠挤压文本维持单行。
4. 长 token（路径、型号、URL）必须有 `break-words` 或 `break-all`；诊断输出优先 `statusBoxClass({ breakAll: true })`。

## 3. 颜色与文字

- 三档文字：`text-foreground`（主）/ `text-foreground-secondary`（辅助）/ `text-foreground-muted`（仅 placeholder、disabled）。
- 主色实心块上的文字用 `text-on-primary`（antd `colorTextLightSolid`），不写 `text-white`。
- 颜色链路：`--ant-*`（antd cssVar，作用域 `.css-var-app` 必须挂在 `<html>`）→ `--color-*`（项目语义，`index.css` 的 `:root`）→ Tailwind 类。组件只消费最后一层。
- React 渲染前的窗口画布由原生 `BrowserWindow.backgroundColor` 独家承担（窗口创建链 `resolveNativeTheme` 解析，与 WCO overlay 同源同时点）；renderer 的 `html, body` 恒透明叠于其上，首帧 `data-theme` 由主进程经 URL query 显式传入。React 根必须不透明满幅，否则切换主题后原生底色会从缝隙透出。
- 语义色（success / warning / danger / primary）**只做图标、圆点、描边、表面**；承载信息的文字用中性色。
- 语义状态用 `StatusTag`（§4）。antd 的 `Tag color="warning|success|error"` 文字色是基色，浅色下 1.83–3.68:1，禁止承载信息。
- 代码文字用 `font-mono`；数字与版本号同理。

## 4. 组件 recipes

### 卡片：`AppCard`

- 一律 `AppCard`，不直接用 antd `Card`，不再引入 `glass-card`。
- 卡片只有一个内容块时，给它 `flex-1`（body 已是 flex column），避免行内等高留下空白。
- 卡片头右侧动作（`extra`）与标题之间由 `AppCard` 统一留 12px，不在各卡片里手写 `ml-*`。
- hover 由 `AppCard` 提供（保持描边颜色、加深投影），组件内不再写 `hover:border-*`。
- 卡内凹槽用 `bg-background-sunken`；页面上的浮起卡片用 `bg-background-elevated`。

### 状态标签：`StatusTag`

```tsx
<StatusTag tone="warning">延迟稍高</StatusTag>;
```

中性文字 + 6px 语义色圆点；颜色只是辅助，文字本身能读。

### 截断文本：`EllipsisText`

- 单行省略一律用它，不手写原生 `title`：只有真正溢出时才弹 antd Tooltip。
- 作为 flex 子项时组件自带 `min-w-0`（否则省略由外层容器裁出，自身检测不到溢出）。
- 多行截断仍用 `line-clamp-*`，不在本组件职责内。

### 表单行

- 标签 12px `text-foreground-secondary`；控件高度 28（small）；行内 `gap-1.5`。
- 开关/下拉与说明同排时，说明用 12px secondary，不抢标签权重。

### 诊断输出

- 统一 `statusBoxClass()`（`lib/classNames.ts`）：凹槽底 + 1px 描边 + 等宽字 + `select-text`。
- 系统信息、VID/PID、日志路径、错误原文必须可选中复制。

### 空态 / 加载 / 错误

- 内容依赖视图必须有空态；不能用禁用控件假装空态。
- 首次加载用 `Skeleton`；异步动作的进行中用按钮 `loading`，不整卡 Spin。
- 错误用 `Alert` 给语义结论，原始报文降级为 secondary 文案。

## 5. 动作层级

- 每张卡最多一个 `type="primary"`；刷新、导出、打开目录类工具动作一律 default。
- 破坏性动作不因“危险”就变主色；危险靠文案与二次确认表达。
- 一屏 primary 目标 ≤3；新增 primary 前先问“它是不是这张卡唯一该做的事”。

## 6. 可访问性基线（不承诺 AA）

- UI 文字 ≥12px；项目自有正文/数据文字 ≥4.5:1（当前均满足）。
- 已知例外（记录在案，不作为缺陷上报）：
  - 主按钮白字 / 浅色主色链接 4.10:1；
  - 暗色主色链接 3.55:1；
  - `colorTextTertiary` 3.36:1（仅限 placeholder / disabled / 非文本次要图标）；
- 自定义可点元素必须有 `focus-visible` 焦点环（2px + offset）；禁止 `focus:outline-none` 无替代。
- 纯图标按钮必须有 `aria-label`，文案走 `t` 宏，不硬编码英文。

## 7. 动效

- 交互过渡 150–200ms；只过渡具体属性（`transition-colors` / `box-shadow`），禁止 `transition-all`。
- 动效只确认状态变化，不做入场表演。豁免：启动壳 logo 入场（实现位于入口内联 HTML，品牌时刻）。

## 8. 提交前清单

1. `pnpm typecheck`、`pnpm lint`、`pnpm test` 全绿。
2. 无 `text-[Npx]`、无 tsx 内 hex 颜色、无未定义语义类（`verify:prebuild` 会拦前两项）。
3. 浅/深各看一眼：文字可读、卡片无空洞、hover 不削弱描边。
4. 新组件先查 `components/ui`（`AppCard` / `StatusTag` / `CardTitle` / `CodeHighlight` / `EllipsisText`）再动手。
5. 颜色链路改动后确认 `<html>` 有 `css-var-app` 类且 `--color-primary` 非空（e2e `settings.spec` 已断言）。
6. 改文案后跑 `pnpm i18n:extract` + `pnpm i18n:check`；英文按长度预算自查，并在中英两种语言下各看一眼标题是否被截断。

## 指针

- 品牌色唯一真源：`src/styles/design-tokens.ts` 的 `BRAND_PRIMARY`。
- cssVar 作用域类：同文件的 `CSS_VAR_KEY`；`applyColorScheme()` 负责挂到 `<html>`。
- 详细设计链路与合规说明：[设计规范与令牌（Design Tokens）](../../docs/src/pages/ui/design-tokens.md)。
- 品牌定制（换 logo / 主色 / 应用名）：[配置项归属（Configuration-map）](../../docs/src/pages/dx/configuration-map.md)。
