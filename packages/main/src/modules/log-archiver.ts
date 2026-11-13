import fs from 'node:fs';
import path from 'node:path';
import {
  LOG_ARCHIVE_CROP_BYTES,
  LOG_ARCHIVE_MAX_ATTEMPTS,
  LOG_ARCHIVE_MAX_DAYS,
  LOG_ARCHIVE_MAX_FILES,
} from '../constants/logging';

export interface CleanArchivedLogsOptions {
  /** 保留最大天数，默认 7 天 */
  maxDays?: number;
  /** 每类日志保留的最大归档文件数，默认 5 个 */
  maxFilesPerCategory?: number;
  /** 仅清理指定类别，缺省时清理全目录 */
  targetBaseName?: string;
}

/**
 * 格式化时间戳为 YYYY-MM-DD_HH-mm-ss
 */
export function formatArchiveTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}_${h}-${mi}-${s}`;
}

/**
 * 生成不冲突的目标归档文件名
 */
export function getAvailableArchivePath(
  dir: string,
  base: string,
  ext: string,
  date = new Date(),
): string {
  const ts = formatArchiveTimestamp(date);
  let targetPath = path.join(dir, `${base}-${ts}${ext}`);
  let counter = 1;
  const maxAttempts = LOG_ARCHIVE_MAX_ATTEMPTS;

  while (fs.existsSync(targetPath) && counter <= maxAttempts) {
    targetPath = path.join(dir, `${base}-${ts}_${counter}${ext}`);
    counter++;
  }

  // 极端后备防死锁：若 100 次仍冲突，加入随机后缀确保立即生成唯一路径
  if (fs.existsSync(targetPath)) {
    const randomSuffix = Math.random().toString(36).slice(2, 6);
    targetPath = path.join(dir, `${base}-${ts}_${randomSuffix}${ext}`);
  }

  return targetPath;
}

/**
 * 清理指定目录下的过期与超额归档日志（支持时间戳滚动与遗留 .old 格式）
 */
export function cleanArchivedLogs(logsDir: string, options: CleanArchivedLogsOptions = {}): void {
  try {
    if (!fs.existsSync(logsDir)) return;

    const maxDays = options.maxDays ?? LOG_ARCHIVE_MAX_DAYS;
    const maxFiles = options.maxFilesPerCategory ?? LOG_ARCHIVE_MAX_FILES;
    const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const entries = fs.readdirSync(logsDir);

    // 匹配: base-YYYY-MM-DD_HH-mm-ss(_\d+)?.ext
    const archivePattern = /^(.+)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_\d+)?)\.(log|ndjson)$/;
    // 精确匹配遗留 .old 格式文件（如 main.old.log, traces.old.ndjson 或 xxx.old）
    const legacyOldPattern = /(?:^|\.)old(?:\.(?:log|ndjson))?$/i;

    // 按 base 分组归档文件
    const groups = new Map<string, Array<{ name: string; fullPath: string; mtime: number }>>();
    // 遗留 .old 文件列表
    const legacyOldFiles: Array<{ name: string; fullPath: string; mtime: number }> = [];

    for (const fileName of entries) {
      const fullPath = path.join(logsDir, fileName);

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }

      // 1. 处理遗留的 .old 格式历史文件
      if (legacyOldPattern.test(fileName)) {
        legacyOldFiles.push({ name: fileName, fullPath, mtime: stat.mtimeMs });
        continue;
      }

      // 2. 匹配时间戳归档文件
      const match = fileName.match(archivePattern);
      if (match) {
        const base = match[1];
        if (options.targetBaseName && base !== options.targetBaseName) {
          continue;
        }

        if (!groups.has(base)) {
          groups.set(base, []);
        }
        groups.get(base)!.push({ name: fileName, fullPath, mtime: stat.mtimeMs });
      }
    }

    // 清理遗留 .old 文件：超过 7 天直接删，保留最多 5 个
    if (legacyOldFiles.length > 0) {
      legacyOldFiles.sort((a, b) => b.mtime - a.mtime); // 降序
      legacyOldFiles.forEach((file, index) => {
        if (index >= maxFiles || now - file.mtime > maxAgeMs) {
          try {
            fs.unlinkSync(file.fullPath);
          } catch {
            // 忽略被占用错误
          }
        }
      });
    }

    // 分类处理各日志类型的时间戳归档
    for (const [, fileList] of groups) {
      // 按 mtime 降序排列，最新生成的排最前
      fileList.sort((a, b) => b.mtime - a.mtime);

      fileList.forEach((file, index) => {
        const isExpired = now - file.mtime > maxAgeMs;
        const isExceedingQuota = index >= maxFiles;

        if (isExpired || isExceedingQuota) {
          try {
            fs.unlinkSync(file.fullPath);
          } catch {
            // 忽略文件锁冲突
          }
        }
      });
    }
  } catch (err) {
    console.warn('[LogArchiver] Failed to clean archived logs:', err);
  }
}

export interface CustomArchiveLogOptions {
  maxDays?: number;
  maxFilesPerCategory?: number;
  asyncCleanup?: boolean;
}

/**
 * 自定义 electron-log archiveLogFn 实现
 */
export function createCustomArchiveLogFn(
  options?: CustomArchiveLogOptions,
): (file: { toString: () => string; crop?: (bytes: number) => void }) => void {
  const maxDays = options?.maxDays ?? LOG_ARCHIVE_MAX_DAYS;
  const maxFiles = options?.maxFilesPerCategory ?? LOG_ARCHIVE_MAX_FILES;
  const asyncCleanup = options?.asyncCleanup ?? true;

  return (file) => {
    const oldPath = file.toString();
    const parsed = path.parse(oldPath);
    const targetPath = getAvailableArchivePath(parsed.dir, parsed.name, parsed.ext);

    let renamed = false;
    try {
      fs.renameSync(oldPath, targetPath);
      renamed = true;
    } catch (renameErr) {
      // Windows 锁容错重试：尝试简短重试或降级
      try {
        fs.copyFileSync(oldPath, targetPath);
        fs.truncateSync(oldPath, 0);
        renamed = true;
      } catch (fallbackErr) {
        console.error('[LogArchiver] Failed to rotate log file:', renameErr, fallbackErr);
        if (typeof file.crop === 'function') {
          file.crop(LOG_ARCHIVE_CROP_BYTES);
        }
      }
    }

    if (renamed) {
      const runCleanup = () => {
        cleanArchivedLogs(parsed.dir, {
          targetBaseName: parsed.name,
          maxDays,
          maxFilesPerCategory: maxFiles,
        });
      };

      if (asyncCleanup) {
        setImmediate(runCleanup);
      } else {
        runCleanup();
      }
    }
  };
}
