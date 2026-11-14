import fs from 'node:fs';
import path from 'node:path';
import type { HistoricalIssueState } from '../types.ts';

/**
 * 计算 Issue 的核心语义指纹：
 * 标准化路径 + 提取问题说明的核心语义词，忽略行号微小平移
 */
export function computeFingerprint(itemPath: string, content: string): string {
  const normPath = itemPath.replace(/\\/g, '/').toLowerCase();
  // 提取说明中的核心短语（英文标识符、关键中文短语），去除数字行号等动态噪点
  const cleanContent = content
    .replace(/L\d+/gi, '')
    .replace(/\b\d+\s*行/g, '')
    .replace(/[^\w\u4e00-\u9fa5]/g, '')
    .slice(0, 160);
  return `${normPath}::${cleanContent}`;
}

/**
 * 从本地已存在的看板 Markdown 中解析出上一轮的 Issue 状态与人工批注
 */
export function parseExistingDashboard(filePath: string): Map<string, HistoricalIssueState> {
  const map = new Map<string, HistoricalIssueState>();
  if (!fs.existsSync(filePath)) return map;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sections = content.split(/^##### Issue #\d+:/m);

    for (let i = 1; i < sections.length; i++) {
      const block = sections[i];
      // 提取路径与行号：`packages/foo.ts` (123 行)
      const headerMatch = block.match(/^\s*`([^`]+)`\s*\((\d+)\s*行\)/);
      if (!headerMatch) continue;

      const itemPath = headerMatch[1].trim();
      const line = Number.parseInt(headerMatch[2], 10) || 1;

      // 提取问题说明
      const summaryMatch = block.match(/- \*\*问题说明\*\*:\s*([^\n\r]+)/);
      const summary = summaryMatch ? summaryMatch[1].trim() : '';

      // 提取是否被标记为忽略：勾选了 [x] 忽略本项，或者未勾选 [ ] 采纳修复
      const isIgnored =
        block.includes('- [x] **忽略本项**') ||
        (block.includes('- [ ] **采纳修复') && !block.includes('- [x] **采纳修复'));

      // 提取人工批注
      let userNote = '';
      const noteMatch = block.match(/> \*\*人工批注 \/ 修改要求\*\*:\s*([^\n\r]+)/);
      if (noteMatch) {
        let rawNote = noteMatch[1].trim();
        // 剥离上一轮自动附加的后缀
        rawNote = rawNote.replace(/\s*\*\(继承自上一轮批注\)\*\s*$/g, '').trim();
        // 排除默认模板占位提示
        if (!rawNote.startsWith('_(') && !rawNote.startsWith('(')) {
          userNote = rawNote;
        }
      }

      const fp = computeFingerprint(itemPath, summary);
      map.set(fp, {
        path: itemPath,
        line,
        summary,
        isIgnored,
        userNote,
        fingerprint: fp,
      });
    }
  } catch {
    // 容错：解析失败返回空映射
  }

  return map;
}

/**
 * 查找上一轮最近生成的 review 看板文件（用于继承历史批注与 diff）
 * @param excludeFilePath 可选。若传入，则在搜索结果中排除该路径（通常用于排除当前待生成的文件本身，以便准确定位上一轮次）
 */
export function findLatestReviewFile(
  reviewDir: string,
  prNumber: number | null,
  branch: string,
  excludeFilePath?: string,
): string | null {
  if (!fs.existsSync(reviewDir)) return null;

  const prefix = prNumber
    ? `pr-${prNumber}-round-`
    : `branch-${branch.replace(/[^a-zA-Z0-9_-]/g, '_')}-round-`;
  const resolvedExclude = excludeFilePath ? path.resolve(excludeFilePath) : null;
  const files = fs.readdirSync(reviewDir).filter((name) => {
    if (!name.startsWith(prefix) || !name.endsWith('.md')) return false;
    if (resolvedExclude && path.resolve(reviewDir, name) === resolvedExclude) return false;
    return true;
  });

  if (files.length === 0) return null;

  // 按 round 编号降序排序
  files.sort((a, b) => {
    const roundA = Number.parseInt(a.replace(prefix, '').replace('.md', ''), 10) || 0;
    const roundB = Number.parseInt(b.replace(prefix, '').replace('.md', ''), 10) || 0;
    return roundB - roundA;
  });

  return path.join(reviewDir, files[0]);
}
