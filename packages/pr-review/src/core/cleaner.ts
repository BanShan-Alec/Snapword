import fs from 'node:fs';
import path from 'node:path';

const MAX_REVIEWS_TO_KEEP = 10;

/**
 * 清理机制：整个 review 产物目录下只保留最近的 10 个 review markdown 文件
 */
export function cleanOldReviewFiles(reviewDir: string): void {
  if (!fs.existsSync(reviewDir)) return;

  const entries = fs
    .readdirSync(reviewDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => {
      const fullPath = path.join(reviewDir, e.name);
      const stat = fs.statSync(fullPath);
      return {
        name: e.name,
        path: fullPath,
        mtimeMs: stat.mtimeMs,
      };
    });

  // 按修改时间升序排列（最旧的在前面）
  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

  if (entries.length > MAX_REVIEWS_TO_KEEP) {
    const toDeleteCount = entries.length - MAX_REVIEWS_TO_KEEP;
    const toDelete = entries.slice(0, toDeleteCount);

    console.log(
      `\n🧹 触发清理机制: 当前共有 ${entries.length} 轮 Review 看板，保留最近 ${MAX_REVIEWS_TO_KEEP} 轮，清理旧文件:`,
    );
    for (const item of toDelete) {
      try {
        fs.unlinkSync(item.path);
        console.log(`   - 删除了旧看板: ${item.name}`);
      } catch (err: unknown) {
        console.warn(`   ! 删除 ${item.name} 失败: ${(err as Error).message}`);
      }
    }
  }
}
