import type {
  CiCheckItem,
  HistoricalIssueState,
  OcrComment,
  OcrResult,
  RunInfo,
} from '../types.ts';
import { computeFingerprint } from './diff.ts';

const CHECK_PRIORITY: Record<string, number> = {
  lint: 1,
  typecheck: 2,
  test: 3,
  e2e: 4,
  'Analyze (javascript-typescript)': 5,
  CodeQL: 6,
  'AI Code Review': 7,
};

function formatCheckStatus(item: CiCheckItem): { badge: string; desc: string } {
  const conc = (item.conclusion || '').toUpperCase();
  const stat = (item.status || '').toUpperCase();

  let badge = '⏳ Pending';
  if (conc === 'SUCCESS') {
    badge = '✅ Pass';
  } else if (conc === 'FAILURE' || conc === 'ERROR') {
    badge = '❌ Fail';
  } else if (conc === 'CANCELLED') {
    badge = '⚪ Cancelled';
  } else if (conc === 'SKIPPED') {
    badge = '⏭️ Skipped';
  } else if (conc === 'TIMED_OUT') {
    badge = '⏰ Timed out';
  } else if (stat === 'IN_PROGRESS') {
    badge = '🟡 Running';
  } else if (stat === 'QUEUED') {
    badge = '⚪ Queued';
  }

  const nameDescMap: Record<string, string> = {
    lint: '代码规范与格式检查 (Biome)',
    typecheck: 'TypeScript 全局类型检查 (tsc)',
    test: 'Vitest 单元测试',
    e2e: 'Playwright 端到端集成测试',
    'Analyze (javascript-typescript)': 'CodeQL 静态代码安全漏洞分析',
    CodeQL: 'CodeQL 安全分析',
    'AI Code Review': 'OpenCodeReview AI 代码审查',
  };

  const desc = nameDescMap[item.name] || (item.workflowName ? `工作流: ${item.workflowName}` : '-');
  return { badge, desc };
}

export function formatDashboard(
  branch: string,
  prNumber: number | null,
  ownerRepo: string,
  headSha: string,
  runInfo: RunInfo,
  data: OcrResult,
  commentMap: Map<string, string>,
  historicalMap: Map<string, HistoricalIssueState>,
  ciChecks?: CiCheckItem[],
): string {
  const allComments = data.comments ?? [];

  // 计算本轮已解决问题
  const currentFingerprints = new Set(
    allComments.map((c) => computeFingerprint(c.path, c.content)),
  );
  const resolvedList: HistoricalIssueState[] = [];
  for (const [fp, hist] of historicalMap.entries()) {
    if (!currentFingerprints.has(fp)) {
      resolvedList.push(hist);
    }
  }

  const highItems = allComments.filter((c) => c.severity === 'critical' || c.severity === 'high');
  const mediumItems = allComments.filter((c) => c.severity === 'medium');
  const lowItems = allComments.filter((c) => c.severity === 'low');

  const lines: string[] = [];

  const prTitle = prNumber ? `PR #${prNumber}` : `分支 ${branch}`;
  lines.push(`# 🛡️ AI 代码质量评审看板 (${prTitle} - 第 ${runInfo.round} 轮)`);
  lines.push('');
  lines.push(
    `> **分支**: \`${branch}\`${prNumber ? ` | **PR 页面**: [#${prNumber}](https://github.com/${ownerRepo}/pull/${prNumber})` : ''}`,
  );
  lines.push(
    `> **审查轮次**: **第 ${runInfo.round} 轮复查** (Run ID: \`${runInfo.id}\`) | **刷新时间**: ${new Date().toLocaleString()}`,
  );
  lines.push(
    `> **审查统计**: 审查文件 ${data.summary?.files_reviewed ?? 0} 个 | 发现问题 ${allComments.length} 项 (🔴 高危 ${highItems.length} · 🟡 中危 ${mediumItems.length} · 🟢 低优 ${lowItems.length})${
      resolvedList.length > 0 ? ` | ✨ **成功解决历史问题**: ${resolvedList.length} 项` : ''
    }`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // 0. 最前面展示【🚦 CI Checks 整体状态】
  if (ciChecks && ciChecks.length > 0) {
    const sortedChecks = [...ciChecks].sort((a, b) => {
      const pA = CHECK_PRIORITY[a.name] ?? 99;
      const pB = CHECK_PRIORITY[b.name] ?? 99;
      return pA - pB;
    });

    lines.push('### 🚦 CI Checks 整体状态');
    lines.push('');
    lines.push('| Check 名称 | 状态 | 说明 / 关联工作流 | 详情链接 |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const check of sortedChecks) {
      const { badge, desc } = formatCheckStatus(check);
      const link = check.detailsUrl ? `[查看详情](${check.detailsUrl})` : '-';
      lines.push(`| **${check.name}** | ${badge} | ${desc} | ${link} |`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // 1. 顶部保留【✨ 上一轮已成功解决】清单（精简删除线格式）
  if (resolvedList.length > 0) {
    lines.push(`### ✨ 上一轮已成功解决 (${resolvedList.length} 项)`);
    lines.push('> 恭喜！以下问题在上一轮提出后已被修复或在新提交中已彻底消除：');
    lines.push('');
    for (const res of resolvedList) {
      const cleanSummary = res.summary.replace(/[\r\n]+/g, ' ').trim();
      lines.push(`- ~~[\`${res.path}\`#L${res.line}] ${cleanSummary}~~`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // 处置规则摘要说明
  lines.push('### 📋 处置规则说明');
  lines.push(
    '- **🔴 高危 & 🟡 中度问题**：**默认全部采纳修复 (`[x]`)**。若某项属预期设计或需忽略，请取消勾选并在批注中注明。',
  );
  lines.push('- **🟢 低优常规建议**：**默认全部忽略 (`[ ]`)**。如需修复请手动勾选为 `[x]`。');
  lines.push('');

  let globalIndex = 1;

  // 渲染通用 Issue 卡片
  const renderItemCard = (item: OcrComment, idx: number, isDefaultFixed: boolean) => {
    const lineNum = item.start_line || item.line || 1;
    const commentKey = `${item.path}:${lineNum}`;
    const ghCommentUrl = commentMap.get(commentKey);
    const ghBlobUrl = `https://github.com/${ownerRepo}/blob/${headSha}/${item.path}#L${lineNum}`;

    const fp = computeFingerprint(item.path, item.content);
    const hist = historicalMap.get(fp);
    const isNew = !hist;
    const statusBadge = isNew ? '`[🆕 本轮新增]`' : '`[⏳ 历史未决]`';

    // 状态继承：如果历史记录存在且被标记为忽略，则继承忽略
    const inheritedNote = hist?.userNote || '';

    lines.push(
      `##### Issue #${idx}: ${statusBadge} \`${item.path}\` (${lineNum} 行) - [${item.category?.toUpperCase() || 'DEFECT'}]`,
    );

    if (isDefaultFixed) {
      // 高危 / 中度缺陷：默认修复，除非历史标记为忽略
      const shouldFix = hist ? !hist.isIgnored : true;
      if (shouldFix) {
        lines.push('- [x] **采纳修复 (默认修复)** <!-- action: fix -->');
        lines.push('- [ ] **忽略本项** <!-- action: ignore -->');
      } else {
        lines.push('- [ ] **采纳修复** <!-- action: fix -->');
        lines.push('- [x] **忽略本项 (继承上一轮)** <!-- action: ignore -->');
      }
    } else {
      // 低优建议：默认必须是 [ ] 忽略；仅当历史看板中被人类显式手动勾选为修复时才保持 [x]
      const wasManuallyChecked = hist ? !hist.isIgnored : false;
      if (wasManuallyChecked) {
        lines.push('- [x] **手动采纳修复 (继承手动勾选)** <!-- action: manual-fix -->');
      } else {
        lines.push('- [ ] **手动采纳修复 (默认忽略)** <!-- action: manual-fix -->');
      }
    }

    // 超链接体系
    const links: string[] = [];
    if (ghCommentUrl) {
      links.push(`💬 [查看 GitHub PR 讨论](${ghCommentUrl})`);
    }
    links.push(`🌐 [在 GitHub 查看代码](${ghBlobUrl})`);

    lines.push(`- **导航**: ${links.join(' · ')}`);
    lines.push(`- **问题说明**: ${item.content}`);

    if (item.suggestion_code) {
      lines.push('');
      lines.push('<details><summary>💡 展开查看推荐修复方案</summary>');
      lines.push('');
      if (item.existing_code) {
        lines.push('**原代码:**');
        lines.push('```ts');
        lines.push(item.existing_code);
        lines.push('```');
      }
      lines.push('**建议修改:**');
      lines.push('```ts');
      lines.push(item.suggestion_code);
      lines.push('```');
      lines.push('</details>');
    }

    lines.push('');
    if (inheritedNote) {
      lines.push(`> **人工批注 / 修改要求**: ${inheritedNote} *(继承自上一轮批注)*`);
    } else {
      lines.push(
        `> **人工批注 / 修改要求**: _(${isDefaultFixed ? '默认修复；如需忽略或有定制要求请在此说明' : '默认忽略；如需采纳或有说明请在此填写'})_`,
      );
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  };

  // 2. 渲染高危问题
  if (highItems.length > 0) {
    lines.push(`### 🔴 高危缺陷 (Critical / High) - 默认修复 (${highItems.length} 项)`);
    lines.push('');
    for (const item of highItems) {
      renderItemCard(item, globalIndex++, true);
    }
  }

  // 3. 渲染中危问题
  if (mediumItems.length > 0) {
    lines.push(`### 🟡 中度缺陷 (Medium) - 默认修复 (${mediumItems.length} 项)`);
    lines.push('');
    for (const item of mediumItems) {
      renderItemCard(item, globalIndex++, true);
    }
  }

  // 4. 渲染低危优化建议
  if (lowItems.length > 0) {
    lines.push(`### 🟢 改进建议 (Low) - 默认忽略 (${lowItems.length} 项)`);
    lines.push('');
    for (const item of lowItems) {
      renderItemCard(item, globalIndex++, false);
    }
  }

  // 5. 底部行动指南
  lines.push('### 🚀 AI Agent 修复指引');
  lines.push('```bash');
  lines.push('# 审阅完成后，可让 AI Agent 依据本看板执行全自动精准修复:');
  lines.push('# "请按照此看板中标记采纳修复的项目进行逐一修复，并严格遵守各项人工批注要求"');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
