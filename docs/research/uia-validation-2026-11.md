# UIA 取词与 ExpandToEnclosingUnit 验证报告

> 验证日期：2026-11-02
> 对应需求：PRD D-1（部分完成）、Q-1（完成）、FR-12 语境界
> 验证代码：配套 `uia-probe`（UIA-demo）仓库，提交 `d65be43`
> 结论适用范围：Windows 11 + Chrome/Edge 156；不外推到 Chrome 138–155、iframe、canvas、PDF

## 1. 结论摘要

1. **Q-1 已完成**：Chrome/Edge 156 下，`ExpandToEnclosingUnit(Paragraph)` 返回的是选区起点所在段落。单段选区实测 53–608 字符，没有退化成 Page/Document。
2. **`Page` 单位在网页内容上等于整个 `Document`**。Martin Fowler 页面 Page 与 Document 都是 45,527 字符；因此 **禁止**用 Page 作为 Paragraph 的兜底。
3. **跨段选区只保留起点段**：A→B 选区 196 字符，Paragraph 返回 A 的 133 字符；B→C 选区 156 字符，Paragraph 返回 B 的 121 字符。PRD 5.1.1 / FR-12 对“折叠到 Start 端点”的判断被实测确认。
4. **`Format` 不是段落替身**：Martin Fowler 页 Format 返回 655 字符，比段落 608 还大；Wikipedia 首段 Format 只有 29 字符，远小于段落 191。Format 随格式连续性变化，可能跨段也可能只覆盖局部。
5. **文本边界**：Paragraph 常带尾部换行（608 vs DOM 607）；Word 在英文后接空格时带尾随空格（`"brown "` 6 字符），后接标点时不带（`"Microservices"` 13 字符）。产品侧切句/发送前必须 `trim()`。
6. **CJK 的 Word 粒度是单字**：GitHub README 首段为中文，Word 单位返回 `"划"` 1 字符，而不是空白分词得到的「划词即译的」。英文单词模式不受影响。
7. **嵌套 inline 不影响段落扩展**：选中 `<strong>` 内的 `boldword`，Paragraph 仍返回整个 `<p>`（131 字符）。
8. **`selection` 与 `collapsed-start` 两种模式对 Paragraph 结果一致**；单词选区场景用哪种都可以。

## 2. 验证环境与方法

| 项 | 值 |
|---|---|
| 操作系统 | Windows 11 26100 |
| 浏览器 | Chrome 156.0.8078.49；Edge 156.0.4314.50 |
| 显示缩放 | 175% DPI |
| 取词接口 | UIA `TextPattern.GetSelection()`，专用 COM MTA 工作线程，无剪贴板 |
| 扩展接口 | `IUIAutomationTextRange::ExpandToEnclosingUnit`，7 种 TextUnit |
| 探针 | `probeExpandUnits`：每个单位测「选区原样」与「折叠到起点」两种模式 |
| 页面 | 本地 testpage；Wikipedia《UI Automation》；GitHub Snapword README；Martin Fowler《Microservices》 |
| 选区设置 | CDP 在页面内设置确定性选区；不是鼠标划选 |

**重要前提**：Chromium 默认是精简无障碍树。自动化必须同时具备：

- 浏览器启动参数 `--force-renderer-accessibility`
- CDP `Emulation.setFocusEmulationEnabled`
- 页面内一次真实点击（`Input.dispatchMouseEvent`）

缺任一步，UIA 顶层树只能看到地址栏 Edit，看不到网页 Document。正常用户用鼠标划选时天然满足焦点条件，不需要手动加这些参数；它们只影响自动化探针和 CI。

## 3. 实测数据

### 3.1 各 TextUnit 的字符数

| TextUnit | testpage | Wikipedia 首段 | GitHub README 首段 | Martin Fowler 首段 | 观察 |
|---|---:|---:|---:|---:|---|
| Character | 1 | 1 | 1 | 1 | 单字符 |
| Word | `"brown "` 6 / `"vexingly "` 9 | `"Microsoft "` 10 | `"Windows "` 8；CJK `"划"` 1 | `"Microservices"` 13 | 英文可能带尾随空格；后接标点不带；CJK 单字 |
| Line | 76 / 75 | 117 | 52 | 74 | 当前渲染行 |
| Format | 401 / 268；嵌套 `<strong>` 内 8 | 29 | 52 | 655 | 随格式连续性变化，可能跨段；不能当段落兜底 |
| Paragraph | 133 / 121 / 131 | 191 | 53 | 608 | 精确命中所在段落（含尾部换行） |
| Page | 1015 | 15,435 | 3,142 | 45,527 | **等于整个 Document** |
| Document | 1015 | 15,435 | 3,142 | 45,527 | 整个文档 |

### 3.2 场景行为

| 场景 | Paragraph 结果 |
|---|---|
| 单词 / 半句 / 整段选区，起点在段落 A | A 全文（testpage 133 字符），不退化到 Page/Document |
| 跨段选区 A 中部 → B 中部（196 字符） | 只返回 A（133 字符），B 部分被丢弃 |
| 跨段选区 B 中部 → C 中部（156 字符） | 只返回 B（121 字符），C 部分被丢弃 |
| 选中嵌套 `<strong>` 内的词 | 扩到整个 `<p>`（131 字符），跨内联格式正常 |
| `selection` vs `collapsed-start` | 对 Paragraph 结果一致 |

### 3.3 Martin Fowler《Microservices》实际案例

- 文章：<https://martinfowler.com/articles/microservices.html>
- 首段选中单词 `Microservices`（13 字符）
- Paragraph 返回首段全文 **608 字符**
- 同页 Document **45,527 字符**（约 75 倍），Page 与 Document 完全相等
- 页面动态内容会让 Document 文本在两次探测间从 45,790 变成 45,527；Paragraph 稳定在 608
- 如果把 Page 当兜底，送给模型的上下文会从约 600 字符膨胀到约 4.5 万字符（约一万 token）

## 4. 对 FR-12 的直接结论

现有两步法在实测页面上成立：

```
GetSelection() → ExpandToEnclosingUnit(Paragraph) → GetText(2000) → 本地切句 → 该句 ±1 句（≤300 字符）
```

需要补充两条实现约束：

1. **先 trim 再切句**：Paragraph 末尾可能带 `\n`，Word 可能带尾随空格；不清洗会导致句子边界和字符数统计偏差。
2. **跨段选区不能依赖 Paragraph 保留全文**：FR-12 目前只对单词使用，符合当前设计；如果未来扩展到句子模式，必须使用原选区本身或按段处理，不能假设 Paragraph 会保留整段选区。

同时确认：

- **不要用 Page/Format 兜底**。Page 等于整页；Format 可能比段落大也可能比段落小。Paragraph 失败时应回退到原选区、本地切句或输入框。
- **`GetText(2000)` 上限仍然必要**。本次 Chrome/Edge 156 没有触发 Paragraph → Page/Document 降级，但 UIA 语义仍允许 provider 不支持 Paragraph 时向更大单位降级；2000 字符上限是防御性约束，不是冗余。
- **Paragraph 的 53–608 字符结果适合作为 LLM 语境**；本批样本的最大值 608 低于 PRD 的“中位数 ≤ 800 字符”验收线，但样本量不足以计算中位数，需要 D-1 扩大样本后再判定。

## 5. 自动化与兼容性注意事项

- **Edge 新配置**可能被同步/登录弹窗遮挡，网页 Document 不在 UIA 树里；自动化使用 guest 模式或已完成首启的配置。
- **`GetForegroundWindow()` 在 CI/锁屏桌面可能返回 NULL**。探针需要支持按窗口标题定位（`EnumWindows` + `ElementFromHandle`），不能只依赖前台窗口。
- **Chrome/Edge 156 已验证通过**；Chrome 138–155、企业 `UiAutomationProviderEnabled` 策略回退尚未实测。
- **iframe、canvas、PDF、管理员权限窗口、多显示器第二屏未测**。iframe 是 D-1 的独立项，需要在 iframe 自己的 Document 上重复本探针。

## 6. D-1 仍未通过

本报告只证明「单点行为正确」，**不等于 D-1 通过**。D-1 的验收标准仍然是：

- 3 类页面各选 10 次（单词 5 次、句子 5 次），共 30 次
- 取词成功率 ≥ 90%
- 单次取词耗时 ≤ 50ms
- 不产生任何剪贴板写入
- 附带验证 `RangeFromPoint`（Q-6）和 iframe 场景

当前完成度：

| 项 | 状态 |
|---|---|
| Q-1 Paragraph 颗粒度 | ✅ 完成 |
| Chrome/Edge 156 单点取词与段落扩展 | ✅ 完成（少量确定性选区，非 30 次统计） |
| D-1 成功率 / 耗时统计 | ⬜ 未完成 |
| Q-6 `RangeFromPoint` | ⬜ 未完成 |
| iframe 内选区 | ⬜ 未完成 |
| Chrome <138 / 企业策略 | ⬜ 未完成 |

## 7. 复现方式

验证代码在配套 `uia-probe`（UIA-demo）仓库：

```bash
pnpm build:native
pnpm test:expand
pnpm test:expand --browser edge
pnpm test:expand --url "https://martinfowler.com/articles/microservices.html" --selector ".paperBody > p"
```

关键实现：

- `native/src/lib.rs` 的 `probeExpandUnits`
- `scripts/expand-probe-e2e.mjs`
- `testpage/index.html` 的 A/B/C/D 段落与跨段选区场景
