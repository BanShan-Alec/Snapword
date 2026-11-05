#!/usr/bin/env node
/**
 * i18n 英文文案长度门禁（PRD-v2 RX-11 ⑧）
 *
 * 规则：en catalog 中每个 i18n key 的英文文案不超过 40 字符。
 * 用法：node scripts/check-i18n-length.mjs
 * 退出码：0 全部通过；1 存在超长/空译文/文件缺失。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CHARS = 40;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.resolve(
  scriptDir,
  '..',
  'packages',
  'renderer',
  'src',
  'locales',
  'en',
  'messages.po',
);

if (!fs.existsSync(catalogPath)) {
  console.error(`[i18n-length] catalog not found: ${catalogPath}`);
  process.exit(1);
}

/** 解析 PO 单行/续行的带引号字符串（只覆盖 lingui 输出用到的转义） */
function unquote(value) {
  return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}

/**
 * 按空行切分条目，逐条收集 msgid / msgstr / msgstr[n]。
 * 返回 [{ id, translations: string[] }]
 */
function parsePo(source) {
  const entries = [];
  let current = null;

  const push = () => {
    if (current) {
      entries.push(current);
      current = null;
    }
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === '') {
      push();
      continue;
    }
    if (line.startsWith('#')) {
      continue;
    }

    const match = /^(msgid|msgstr(?:\[\d+\])?)\s+(".*")$/.exec(line);
    if (match) {
      if (match[1] === 'msgid') {
        // 新条目开始（header 的 msgid "" 也按条目处理，稍后跳过）
        if (current?.id !== undefined) push();
        current = { id: unquote(match[2]), translations: [] };
      } else if (current) {
        current.translations.push(unquote(match[2]));
      }
      continue;
    }

    // 续行
    if (line.startsWith('"') && line.endsWith('"') && current) {
      const chunk = unquote(line);
      if (current.translations.length === 0 && current.id === undefined) {
        current.id = '';
      }
      if (current.translations.length > 0) {
        current.translations[current.translations.length - 1] += chunk;
      } else {
        current.id += chunk;
      }
    }
  }
  push();

  return entries;
}

const failures = [];
const entries = parsePo(fs.readFileSync(catalogPath, 'utf8'));

for (const { id, translations } of entries) {
  if (!id) continue; // PO header
  if (translations.length === 0) {
    failures.push({ id, reason: 'missing translation' });
    continue;
  }
  for (const value of translations) {
    const length = Array.from(value).length;
    if (length > MAX_CHARS) {
      failures.push({ id, value, length });
    }
  }
}

if (failures.length > 0) {
  console.error(`[i18n-length] ${failures.length} entry(s) violate the ${MAX_CHARS}-char limit:`);
  for (const failure of failures) {
    if ('length' in failure) {
      console.error(
        `  ${failure.length} chars: ${JSON.stringify(failure.value)} (msgid: ${failure.id})`,
      );
    } else {
      console.error(`  ${failure.reason}: ${JSON.stringify(failure.id)}`);
    }
  }
  process.exit(1);
}

console.log(
  `[i18n-length] OK: ${entries.filter((entry) => entry.id).length} English messages <= ${MAX_CHARS} chars`,
);
