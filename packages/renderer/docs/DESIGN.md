# DESIGN.md — 设计令牌与视觉规范（C-05）

> 状态：已落地（P4 骨架）。本文件替代视觉稿，作为颜色 / 字号 / 间距的单一事实源清单。
> 关联：docs/PRD-v2.md RC-16、RM-13；docs/interaction-spec-v2.md §3.6、§6.2；docs/progress-checklist.md §6 C-05。

## 1. 来源与铁律

- 主题包：`paseo-antd-themes@0.2.2`（MIT，BanShan-Alec），浅色槽 **Claude Light**，深色槽 **Paseo Dark**（README 默认配对）。
- 两条出口，同一条 token 管线：
  1. **antd 组件**：`ConfigProvider theme={getAntdThemeConfig(resolvedTheme)}`，在 `claudeLightTheme` / `paseoDarkTheme` 间切换（`packages/renderer/src/styles/antd-theme.ts`）；
  2. **自绘标记（Tailwind）**：`@import "paseo-antd-themes/tailwind.css"`（`packages/renderer/src/styles/index.css`），`@theme inline` 把 `--color-*` 工具类映射到 `var(--paseo-*)`；变量实体 `:root`（浅）+ `.dark` / `@media (prefers-color-scheme: dark)`（深）。
     显式模式（light/dark）由 `applyColorScheme` 把当前模式的 123 个 `--paseo-*` 变量内联写到 `<html>`，优先级高于包内 media 块——否则「系统深色 + 手动浅色」会继续命中 `@media` 的深色值；system 模式由 `useTheme` 监听 `prefers-color-scheme` 后重新解析。
- 同源性由单测锁定：`packages/renderer/tests/unit/design-tokens.test.ts` 断言包产物 CSS 变量与 `theme.getDesignToken(…)` 派生值一致；内联变量表与包产物 CSS 逐项相等。
- **禁止散落硬编码色**：任何 `#` 开头的字面量都是 bug（paseo DESIGN.md 规则 1）；组件配色一律走变量 / 工具类。改色走包的 `extendTheme`，不要在 `ConfigProvider` 上叠 seed token（包的 algorithm 会剥掉覆盖层）。

## 2. 语义色（取自包发布产物 `dist/tailwind.css` 实际值）

### 表面（三层 + 定点槽，浅 / 深成对）

| 语义   | 变量                                 | Tailwind 类          | 浅色（Claude Light）  | 深色（Paseo Dark）    | 用途                             |
| ------ | ------------------------------------ | -------------------- | --------------------- | --------------------- | -------------------------------- |
| 页面底 | `--paseo-bg-layout` / `surface-0`    | `bg-surface-0`       | `#F0EDE2`             | `#181B1A`             | 窗口画布、页面空白区             |
| 容器   | `--paseo-bg-container` / `surface-1` | `bg-surface-1`       | `#F5F4EC`             | `#1E2120`             | 卡片、输入框、面板、表格底       |
| 浮层   | `--paseo-bg-elevated` / `surface-2`  | `bg-surface-2`       | `#FFFFFF`             | `#272A29`             | 弹层、下拉、Modal、菜单浮层      |
| 侧栏   | `--paseo-surface-sidebar`            | `bg-surface-sidebar` | `#E2E0D6`             | `#141716`             | 主窗口左侧导航（RM-02）          |
| 面板头 | `--paseo-surface-head`               | `bg-surface-head`    | `#E0DDD0`             | `#1E2120`             | Card 头                          |
| hover  | `--paseo-surface-hover`              | `bg-surface-hover`   | `#DDD9CE`             | `#1E2120`             | 卡片 / 行 hover                  |
| 强填充 | `--paseo-surface-3` / `surface-4`    | `bg-surface-3/4`     | `#D7D2C7` / `#D1CCBF` | `#434645` / `#595B5B` | 菜单选中、进度轨道（不承载文字） |

### 文字四档

| 档位      | 变量                       | Tailwind 类             | 浅色      | 深色      | 用途                                   |
| --------- | -------------------------- | ----------------------- | --------- | --------- | -------------------------------------- |
| 一 · 正文 | `--paseo-text`             | `text-text`             | `#3C3C2C` | `#fafafa` | 正文、标题、菜单选中                   |
| 二 · 次要 | `--paseo-text-secondary`   | `text-text-secondary`   | `#55554B` | `#A1A5A4` | 说明、副标题、未选中菜单               |
| 三 · 三级 | `--paseo-text-tertiary`    | `text-text-tertiary`    | `#65635E` | `#8A8E8D` | 元信息、时间戳、帮助文本、图标         |
| 四 · 四级 | `--paseo-text-quaternary`  | `text-text-quaternary`  | `#98978F` | `#595B5B` | **仅禁用态与占位符**（不参与正文判读） |
| 反白      | `--paseo-text-light-solid` | `text-text-light-solid` | `#FFFFFF` | `#fff`    | 实心按钮 / 状态标签文字                |

规则：降级强调用二级档，**不要用 `opacity`**（会在不同表面落进对比度盲区）；标题用 `text-text` + 字重 600，不另设色。

### 主色、链接与状态

| 语义                             | 浅色                                          | 深色                                          | 用途                                                        |
| -------------------------------- | --------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| 主色（填充 / 按钮 / 焦点环）     | `#BA5B37`（clay）                             | `#20744A`（paseo 绿）                         | `bg-primary`、`border-primary`；**深色下禁作前景**（见 §3） |
| 主色文字 / 链接（同值）          | `#A34E2D`                                     | `#7ccba0`                                     | `text-link`、`text-primary-text`：可点击文字、主色图标前景  |
| success / warning / error / info | `#467650` / `#806340` / `#a14b43` / `#436c96` | `#6cb17b` / `#c09664` / `#d8847b` / `#5caaf6` | 状态色（各族 10 槽随包导出）                                |
| 边框 / 分隔                      | `#DBD9D0` / `rgba(28,11,19,0.06)`             | `#252B2A` / `rgba(219,255,254,0.09)`          | `border-border`、`border-split`                             |

完整清单（diff、状态点、身份色、选区、`--paseo-*` 全量）见包内 `MAPPING.md` 与 `preview.html`（`packages/renderer/node_modules/paseo-antd-themes/`）。

## 3. 对比度实测（WCAG 2.1，node 脚本）

**命令：`node scripts/contrast-check.mjs`**（数据源为包发布产物 CSS，即 §2 的实际值；公式 = 相对亮度 L = 0.2126·R + 0.7152·G + 0.0722·B，sRGB 线性化，比值 = (L亮 + 0.05) / (L暗 + 0.05)）。门槛：正文/次要 ≥4.5:1（RC-16），图标 ≥3:1（RC-16），三级在侧栏等非正文表面 ≥4.0:1（包规则）。2026-11-05 实测输出：

| 主题  | 档位                        | 前景（--paseo-*）          | 背景                              | 实测        | 门槛   | 判定                            |
| ----- | --------------------------- | -------------------------- | --------------------------------- | ----------- | ------ | ------------------------------- |
| light | 正文                        | text `#3C3C2C`             | 页面底（bg-layout `#F0EDE2`）     | **9.56:1**  | ≥4.5:1 | 通过                            |
| light | 正文                        | text `#3C3C2C`             | 容器（bg-container `#F5F4EC`）    | **10.15:1** | ≥4.5:1 | 通过                            |
| light | 正文                        | text `#3C3C2C`             | 侧栏（surface-sidebar `#E2E0D6`） | **8.46:1**  | ≥4.5:1 | 通过                            |
| light | 次要                        | text-secondary `#55554B`   | 页面底（bg-layout `#F0EDE2`）     | **6.43:1**  | ≥4.5:1 | 通过                            |
| light | 次要                        | text-secondary `#55554B`   | 容器（bg-container `#F5F4EC`）    | **6.83:1**  | ≥4.5:1 | 通过                            |
| light | 次要                        | text-secondary `#55554B`   | 侧栏（surface-sidebar `#E2E0D6`） | **5.69:1**  | ≥4.5:1 | 通过                            |
| light | 三级（元信息）              | text-tertiary `#65635E`    | 页面底（bg-layout `#F0EDE2`）     | **5.12:1**  | ≥4.5:1 | 通过                            |
| light | 三级（元信息）              | text-tertiary `#65635E`    | 容器（bg-container `#F5F4EC`）    | **5.44:1**  | ≥4.5:1 | 通过                            |
| light | 三级（元信息）              | text-tertiary `#65635E`    | 侧栏（surface-sidebar `#E2E0D6`） | **4.53:1**  | ≥4:1   | 通过                            |
| light | 图标 · 主色文字（= link）   | primary-text `#A34E2D`     | 容器（bg-container `#F5F4EC`）    | **5.17:1**  | ≥3:1   | 通过                            |
| light | 图标 · primary 本体（禁用） | primary `#BA5B37`          | 容器（bg-container `#F5F4EC`）    | **4.10:1**  | ≥3:1   | 通过                            |
| light | 主按钮文字                  | text-light-solid `#FFFFFF` | 主色底（primary `#BA5B37`）       | **4.53:1**  | ≥4.5:1 | 通过                            |
| dark  | 正文                        | text `#fafafa`             | 页面底（bg-layout `#181B1A`）     | **16.62:1** | ≥4.5:1 | 通过                            |
| dark  | 正文                        | text `#fafafa`             | 容器（bg-container `#1E2120`）    | **15.55:1** | ≥4.5:1 | 通过                            |
| dark  | 正文                        | text `#fafafa`             | 侧栏（surface-sidebar `#141716`） | **17.29:1** | ≥4.5:1 | 通过                            |
| dark  | 次要                        | text-secondary `#A1A5A4`   | 页面底（bg-layout `#181B1A`）     | **6.97:1**  | ≥4.5:1 | 通过                            |
| dark  | 次要                        | text-secondary `#A1A5A4`   | 容器（bg-container `#1E2120`）    | **6.52:1**  | ≥4.5:1 | 通过                            |
| dark  | 次要                        | text-secondary `#A1A5A4`   | 侧栏（surface-sidebar `#141716`） | **7.25:1**  | ≥4.5:1 | 通过                            |
| dark  | 三级（元信息）              | text-tertiary `#8A8E8D`    | 页面底（bg-layout `#181B1A`）     | **5.23:1**  | ≥4.5:1 | 通过                            |
| dark  | 三级（元信息）              | text-tertiary `#8A8E8D`    | 容器（bg-container `#1E2120`）    | **4.90:1**  | ≥4.5:1 | 通过                            |
| dark  | 三级（元信息）              | text-tertiary `#8A8E8D`    | 侧栏（surface-sidebar `#141716`） | **5.44:1**  | ≥4:1   | 通过                            |
| dark  | 图标 · 主色文字（= link）   | primary-text `#7ccba0`     | 容器（bg-container `#1E2120`）    | **8.43:1**  | ≥3:1   | 通过                            |
| dark  | 图标 · primary 本体（禁用） | primary `#20744A`          | 容器（bg-container `#1E2120`）    | **2.83:1**  | ≥3:1   | 按规则禁用（改用 primary-text） |
| dark  | 主按钮文字                  | text-light-solid `#fff`    | 主色底（primary `#20744A`）       | **5.74:1**  | ≥4.5:1 | 通过                            |

**结论：无低于 4.5:1 的正文/次要组合。** 数值与主题包 `DESIGN.md` 公布的实测矩阵一致（9.56/10.15、16.62/15.55、6.43/6.83、6.97/6.52、5.12/5.44、5.23/4.90、白字 on clay 4.53），交叉验证了计算公式。低于门槛的组合有一条，按使用规则处理：

- **深色下 `primary` 本体不得用作前景/图形**（2.83:1 < 3:1）：主色在深色里是填充色（按钮底、选中底、焦点环），主色系前景一律用 `primary-text` / `link`（`#7ccba0`，8.43:1）。脚本把该组合标为「按规则禁用」而非硬失败。
- 四级档（占位符/禁用）对容器 2.66:1（浅）/ 2.37:1（深），属 antd `colorTextPlaceholder` 派生的库行为，**知情接受**，不承载需要阅读的内容。

## 4. 字号与行高（对齐 antd 组件行高，同一屏不混用两套刻度）

包发布两条出口同名规则：`text-body` 等增量命名不覆盖 Tailwind 自带 `text-sm` 刻度；**同一屏不要混用**（字号可能相同但行高不同）。

| Token        | 字号 / 行高     | Tailwind 类       | 用途（RC-16 映射）                    |
| ------------ | --------------- | ----------------- | ------------------------------------- |
| `caption`    | 12px / 20px     | `text-caption`    | 角标、辅助说明                        |
| `body`       | **14px / 22px** | `text-body`       | **正文基准 14px**（RC-16）；义项 14px |
| `subtitle`   | 16px / 24px     | `text-subtitle`   | 音标 16px                             |
| `heading-sm` | 20px / 28px     | `text-heading-sm` | 页面标题（主窗口）                    |
| `heading`    | 24px / 32px     | `text-heading`    | **单词 24px**（RC-16）                |
| `heading-lg` | 30px / 38px     | `text-heading-lg` | 大标题                                |
| `display`    | 38px / 46px     | `text-display`    | 展示型数字/超大标题                   |

- RC-16 的「语境义 15px」「例句 13px」**没有对应档位**（刻度只有 12/14/16/20/24/30/38），卡片接入时以任意值（`text-[15px]`）或扩展刻度落定，见 §7。
- 字体栈：`--paseo-font`（system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif）、`--paseo-font-mono`（SFMono-Regular, Menlo, Monaco, Consolas, …）；`base.css` 的 body 与 antd 组件同一栈。

## 5. 间距刻度

- 4px 基准栅格，直接使用 Tailwind 默认间距刻度（`p-4` = 16px）：1=4，2=8，3=12，4=16，6=24，8=32，12=48 px。
- 包形态规范（DESIGN.md）：工作间距落在 **8 / 12 / 16**；页面内容区 `px-6 py-6`（24px）。
- 布局刻度（interaction-spec-v2 §6.2）：侧栏定宽 **200px**；内容区自适应、最大宽度 **1100px** 宽屏居中；页面切换 120ms 交叉淡入（`.app-page`，无位移）。

## 6. 形态：圆角 / 阴影 / 控件高度

| 维度     | 值                                                                                  | 说明                                                                           |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 圆角     | `radius-xs/sm/md/lg` = 4 / 8 / 12 / 12 px                                           | antd `borderRadius` = 12；覆盖 Tailwind `--radius-*` 刻度                      |
| 阴影     | `shadow-raised`（hoverable 卡片/按钮悬停）、`shadow-overlay`（Dropdown/Modal 浮层） | 仅两级；静止区块不加阴影，靠表面色与边框分层                                   |
| 控件高度 | 40 / 32 / 48 px（SM）                                                               | antd `controlHeight/SM/LG`；Select 行高 44                                     |
| 窗口画布 | `--window-bg` / `--window-fg`（tokens.css）                                         | React 渲染前兜底，必须等于两套主题的 `colorBgLayout` / `colorText`（单测校验） |

## 7. Deviations（与 RC-16 / 既定决策的偏差记录）

1. **RC-16 字号档缺口**：「语境义 15px」「例句 13px」不在 12/14/16/20/24/30/38 刻度内；420px 卡片接入时用任意值或补刻度，本步不预设。
2. **RC-16 卡片圆角 16px**：包圆角形态止步 12px；卡片 16px 圆角在卡片步骤用局部值落定，不改全局刻度。
3. **深色主色作前景 2.83:1 < 3:1**（RC-16 图标线）：已定为使用规则——深色下主色系前景用 `primary-text`/`link`；主题色板本身不调整。
4. **控件密度变化**：P4 骨架原设 `controlHeightSM=28`（密度决策），接入 paseo 形态后统一为 40/32/48、圆角 12/8——旧决策作废。
5. **`src/assets/logo.svg` 仍为旧品牌蓝 `#1677ff`**：属应用图标/启动壳素材（主源），非组件配色；品牌素材更新不在本步范围。
6. **组件级行为未接入**：`PaseoThemeProvider` 的 loadingIcon / Segmented / Select 间隙行为随 provider 才生效；本步按契约用裸 `ConfigProvider` + 自管 zustand（RC-16 的 system 解析由渲染层 store 完成），上述行为留待需要时启用。
7. **四级文字（占位符/禁用）低于 4.5:1**：`text-quaternary` 对容器实测 2.66:1（浅）/ 2.37:1（深），属 antd `colorTextPlaceholder` 派生行为；仅用于占位符与禁用态，不承载需要阅读的内容，知情接受。正文/次要档无低于 4.5:1 的组合。

## 8. 项目别名（存量词汇 → 包变量）

存量组件继续可用旧语义名（`packages/renderer/src/styles/index.css` `@theme inline` 别名块）；**新代码优先用包的规范类名**（`bg-surface-1`、`text-text-secondary`、`border-split`）：

| 项目别名                       | 指向                       | 包规范名                        |
| ------------------------------ | -------------------------- | ------------------------------- |
| `--color-background`           | `--paseo-bg-layout`        | `bg-surface-0` / `bg-layout`    |
| `--color-background-container` | `--paseo-bg-container`     | `bg-surface-1` / `bg-container` |
| `--color-background-elevated`  | `--paseo-bg-elevated`      | `bg-surface-2` / `bg-elevated`  |
| `--color-foreground`           | `--paseo-text`             | `text-text`                     |
| `--color-foreground-secondary` | `--paseo-text-secondary`   | `text-text-secondary`           |
| `--color-foreground-muted`     | `--paseo-text-tertiary`    | `text-text-tertiary`            |
| `--color-on-primary`           | `--paseo-text-light-solid` | `text-text-light-solid`         |
| `--color-danger`               | `--paseo-error`            | `bg-error` / `text-error`       |

主题模式（RC-16）：`system / light / dark`，默认跟随系统；选择存 zustand 占位 store（`packages/renderer/src/stores/useAppStore.ts`），P5 配置层落地后迁 setting 表。`light/dark` 手动切换由 `applyColorScheme` 同步 `.dark` 类并把当前模式的 `--paseo-*` 变量内联到 `<html>`（压过包内 `@media (prefers-color-scheme: dark)`，保证「系统深色 + 手动浅色」正确），`system` 监听 `prefers-color-scheme` 变化即时生效。
