# Snapword 规格说明书：两阶段单词查词（本地词典 0ms 召回 + 大模型极简语境决策）

> **文档状态**：已定稿（已通过 `/brainstorming` 充分讨论并确认）  
> **适用范围**：三窗口划词翻译体系中的「单词模式」流水线与「翻译卡片」渲染  
> **上游依据**：`docs/specs/PRD.md`（FR-11/12/20/21）、`docs/specs/interaction-spec-v2.md`（RC-06/07）、`docs/contracts/prompt-contract.md`、`docs/contracts/architecture.md`  
> **领域词汇**：严格遵循 [GLOSSARY.md](../../GLOSSARY.md)（划词、取词、翻译卡片、单词模式、句子模式、语境、语境义、会话历史、展示会话等）

---

## Problem Statement / 问题陈述

在现有的纯大模型端到端单词查词（`word-v1`）架构中，存在三个难以调和的工程与体验痛点：

1. **首屏等待感强烈**：用户划词后必须等待大模型完整的网络握手、推理与数十行 JSON 的生成解析（P95 延迟约 1.5s），在此期间用户只能面对空白或骨架屏，严重打断技术阅读心流；
2. **音标存在事实性幻觉（RK-11 风险）**：大模型生成的 IPA 美式/英式音标存在事实性错误概率，无法达到传统权威词典的 100% 可信度；
3. **Token 与计算资源浪费**：对于绝大多数常见单词，大模型每次都需要重复生成基础词性、常见释义与英文例句（单次消耗数百 Tokens），请求耗时长且重复消耗用户的 API 额度；
4. **纯静态词典与纯大模型的两极缺陷**：若退回传统纯离线词典，无法获得针对当前句子语境的准确语境义（`context_sense`）；若纯靠大模型自由发散，又偶尔会遗漏最常见的基础义项。

---

## Solution / 解决方案

解耦单词查词链路，构建**「阶段 1 本地轻量词典毫秒级召回 + 阶段 2 大模型极简语境决策（LLM-as-a-Judge）」**的两阶段渐进式流水线：

1. **阶段 1：本地轻量词典（ECDICT 核心版 0ms 秒开）**：
   - 随应用打包内置裁剪版单文件 SQLite 数据库（`resources/dict/ecdict-core.db`，约 8~10MB，覆盖 5~8 万高频及计算机科技核心词汇）；
   - 主进程利用 Node.js 原生 `node:sqlite`（`readOnly: true`）直接查询，耗时 **< 0.5ms**，零额外原生编译依赖；
   - 划词命中单词后，卡片 **0ms 瞬间渲染首屏**（展示权威英/美 IPA 音标与标准释义列表），顶部预留语境义骨架占位，彻底消除等待空白。
2. **阶段 2：大模型轻量语境决策（极简 Prompt 契约 `word-judge-v1`）**：
   - 将选中的单词、上下文原句、本地候选释义编号列表与用户角色（Persona）传入大模型；
   - 大模型仅负责两项核心任务：① 针对本句生成一句定制中文语境义（`context_sense`）；② 指出哪一个候选释义编号最贴切（`matched_index`）；
   - 输出 Token 锐减 80%（仅需一两句话），模型响应时间缩短至 **500~800ms**，大幅减少等待时间并节省用户 API 费用；
   - 决策结果到达后，卡片顶部平滑展开语境义，并在对应本地义项上打上高亮标记（并支持前置）。
3. **双重优雅降级与离线保护**：
   - **未命中词典兜底**：若本地词典未收录该词（如生僻词或新兴专有技术词），系统自动、无缝切换为现有的纯大模型端到端模式（`word-v1` 契约），保证 100% 查词成功率；
   - **离线与断网保护**：若网络中断或未配置 API Key，卡片依然毫秒级展示本地词典的权威音标与释义，仅标注「离线词典 · 语境理解暂不可用」，核心查词功能永不瘫痪。

---

## User Stories / 用户故事

1. 作为技术读者，我希望划词选中单词后卡片能瞬间（<100ms）展示出权威的音标和常见释义，以便我不必面对漫长的大模型网络等待。
2. 作为技术读者，我希望卡片显示的英美音标权威准确，以便我不会受到大模型音标幻觉的误导。
3. 作为技术读者，在大模型完成分析后，我希望卡片顶部平滑浮现针对我当前阅读句子的准确语境义，以便我快速理解该词在此处的具体含义。
4. 作为技术读者，在大模型完成分析后，我希望对应的词典释义条目被自动高亮标记，以便我直观对照该词在词典中的哪个义项被命中。
5. 作为技术读者，当我划词选中的单词在本地词典查不到时，我希望系统自动无缝切换到大模型端到端生成，以便生僻词和新兴技术专有名词依然能正常查词。
6. 作为技术读者，当我处于无网络或 API 接口故障时，我希望划词卡片依然能稳定展示本地词典的全部释义与音标，以便我的基本阅读查词功能绝不瘫痪。
7. 作为技术读者，当 UIA 未能获取到上下文句子时，我希望大模型能根据我设定的专业角色，直接指出本地词典中最符合该角色的释义条目。
8. 作为技术读者，如果大模型判断本地词典的全部释义均不符合当前句子（返回无匹配），我希望卡片仅展示大模型生成的语境义而不强行高亮错误义项，以便避免指鹿为马。
9. 作为技术读者，我希望单词查词请求生成的 Token 数量大幅减少，以便响应更快并极大地节省我的 API 费用。
10. 作为技术读者，当我划词选中的单词包含词形变化（如 `running`、`indices`）时，我希望本地词典能自动完成词形还原并展示其原形释义，以便我顺利获知词义。
11. 作为技术读者，在句子模式或多词短语划词时，我希望系统依然直接使用原有的大模型流式翻译管线，以便长句和段落的翻译不受任何影响。
12. 作为技术读者，当我将单词收藏到生词本时，我希望收藏的数据包含权威音标、大模型语境义以及命中的标准释义，以便沉淀高质量的生词资产。

---

## Implementation Decisions / 实施决策

### 1. 本地词库集成与服务设计（Architecture & Local Dict）

- 数据源与存储：采用 ECDICT 裁剪核心版（单文件 SQLite，打包至 `resources/dict/ecdict-core.db`，约 8~10MB）。
- 主进程服务 `packages/main/src/services/dict.service.ts`：
  - 使用 Node.js 22+ 原生 `import { DatabaseSync } from 'node:sqlite'` 以 `readOnly: true` 打开常驻只读连接；
  - 核心查询方法：`lookup(word: string): DictEntry | null`；
  - 具备词形还原逻辑（基于词典自带的 `exchange` 映射规则与常见屈折词缀回退查询）。

```ts
export interface DictSense {
  pos: string; // 词性，如 n. / v. / adj.
  def: string; // 中文简明释义
}

export interface DictEntry {
  word: string;
  phoneticUs: string;
  phoneticUk?: string;
  senses: DictSense[];
}
```

### 2. 翻译管线路由分流与时序控制（Translation Pipeline）

- 本链路**严格仅对「单词模式」生效**；句子模式（多词、长句、段落）完全沿用现有流式纯译文管线。
- 单词模式处理时序：
  1. 调用 `dictService.lookup(word)`：
     - 若命中：主进程立即通过 IPC 发送 `translate:local-ready` 事件，携带 `DictEntry` 数据，卡片瞬时呈现首屏；同时启动阶段 2 大模型决策请求；
     - 若未命中：直接走原有的 `word-v1` 纯大模型端到端流程（前端维持正常加载骨架）。
  2. 阶段 2 大模型请求：
     - 采用精简契约 `word-judge-v1`；
     - 成功返回后，通过 IPC 发送 `translate:decided` 事件，携带语境义与高亮索引；
     - 若大模型超时或报错，前端保留本地词典结果，将语境状态标记为离线只读。

### 3. 大模型极简决策契约（`word-judge-v1`）

- **System Prompt**：
  > `You are Snapword's vocabulary context-judge engine. You will be given a selected word, the sentence context, and a numbered list of candidate dictionary senses. Output exactly one JSON object with: 1) "context_sense": the concise Simplified Chinese meaning of the word in this specific context; 2) "matched_index": the 0-based integer index of the candidate sense that best matches the context, or null if none match. Temperature must be 0.`
- **User Template**：

  ```text
  Word: <<<TEXT>>>{{word}}<<<END>>>
  Context: <<<CONTEXT>>>{{context}}<<<END>>>
  Candidate senses:
  0: n. 线；细丝
  1: n. （计算机）线程
  2: v. 穿线
  Persona: {{persona}}
  ```
- **Response Format (JSON Schema)**：

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": ["context_sense", "matched_index"],
    "properties": {
      "context_sense": { "type": "string" },
      "matched_index": { "type": ["integer", "null"] }
    }
  }
  ```

### 4. 翻译卡片两段式渐进渲染（Card UI State Machine）

- 引入两阶段状态机（`phase: "idle" | "local_ready" | "decided" | "fallback"`）：
  - `local_ready`：0ms 瞬间挂载音标、发音按钮及完整释义列表，顶部语境义区域呈现 Shimmer 骨架条；
  - `decided`：顶部骨架平滑过渡为 `context_sense` 文本；下方列表中下标为 `matched_index` 的义项打上高亮标签（或带平滑动画前置）；
  - `fallback`：若进入传统纯大模型流程，保持常规 Loading 并等待完整数据一次性流式注入。

---

## Testing Decisions / 测试决策

遵循最高测试接缝（Highest Possible Seam）原则，专注于外部可见行为校验：

### 1. 渲染层渐进式状态机接缝（UI Seam）

- **`TranslateCard` 状态时序测试**：
  - 验证当接收到 `translate:local-ready` 时，DOM 在 0ms 瞬间渲染出音标与释义列表；
  - 验证当随后接收到 `translate:decided` 时，顶部 Shimmer 占位平滑被替换为语境义文本，且指定索引的义项获得高亮 class；
  - 验证网络故障/大模型报错场景下，卡片维持本地释义展示，不白屏、不崩溃；
  - 验证未命中词典场景下，卡片正确降级为全量大模型加载态。

### 2. 主进程服务与契约接缝（Service & Contract Seam）

- **`dict.service.test.ts`**：
  - 查询延迟基准测试（断言本地 SQLite 单次查询耗时 P95 < 5ms）；
  - 词形还原测试：验证 `running`、`took`、`indices` 能正确命中原形词；
  - 大小写不敏感测试：验证 `Thread`、`THREAD` 与 `thread` 结果一致；
  - 生僻词测试：验证未收录词条正确返回 `null`。
- **`translate.service.test.ts`**：
  - 分流逻辑测试：验证单词模式命中时派发两阶段时序，未命中时派发 `word-v1`；
  - Prompt 组装测试：验证候选列表编号序列化正确，JSON Schema 符合 `word-judge-v1` 契约约束。

---

## Out of Scope / 范围外事项

1. **自定义离线词典导入**：MVP 仅内置官方核心词库，不支持用户导入第三方的 `.mdx`、`.stardict` 或自定义字典文件。
2. **离线发音语音包**：本地词典仅包含音标文本，发音仍沿用系统 Web Speech API 或在线 TTS。
3. **句子模式的词典参与**：词典检索与决策流水线严格限定在单词模式，禁止向句子翻译或长文分段中引入词典逻辑。

---

## Further Notes / 补充说明

- 本设计完全保持了 Snapword 纯净轻量（常驻内存 ≤250MB）的红线，且未新增第三方复杂运行时。
- 契约先行：实现前须在 `@app/shared` 中登记 `translate:local-ready` 与 `translate:decided` 通道，以及扩展对应的数据 Schema。
