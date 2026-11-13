import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MAX_REVIEWS_TO_KEEP = 10;

export interface ReviewFileEntry {
  name: string;
  path: string;
  mtimeMs: number;
}

export class ReviewStorage {
  private readonly reviewsDir: string;
  private readonly maxReviewsToKeep: number;

  constructor(reviewsDir: string, maxReviewsToKeep = DEFAULT_MAX_REVIEWS_TO_KEEP) {
    this.reviewsDir = reviewsDir;
    this.maxReviewsToKeep = maxReviewsToKeep;
  }

  listReviewFiles(): ReviewFileEntry[] {
    if (!fs.existsSync(this.reviewsDir)) return [];

    return fs
      .readdirSync(this.reviewsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => {
        const fullPath = path.join(this.reviewsDir, e.name);
        const stat = fs.statSync(fullPath);
        return {
          name: e.name,
          path: fullPath,
          mtimeMs: stat.mtimeMs,
        };
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
  }

  rotateOldReviews(): string[] {
    const entries = this.listReviewFiles();
    if (entries.length <= this.maxReviewsToKeep) {
      return [];
    }

    const toDeleteCount = entries.length - this.maxReviewsToKeep;
    const toDelete = entries.slice(0, toDeleteCount);
    const deletedNames: string[] = [];

    for (const item of toDelete) {
      try {
        fs.unlinkSync(item.path);
        deletedNames.push(item.name);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`   ! 删除 ${item.name} 失败: ${msg}`);
      }
    }

    return deletedNames;
  }
}

/**
 * 兼容性函数：直接执行清理
 */
export function cleanOldReviewFiles(
  reviewDir: string,
  maxKeep = DEFAULT_MAX_REVIEWS_TO_KEEP,
): string[] {
  const storage = new ReviewStorage(reviewDir, maxKeep);
  return storage.rotateOldReviews();
}
