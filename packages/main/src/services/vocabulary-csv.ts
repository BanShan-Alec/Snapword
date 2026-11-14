import type { VocabularyRecord } from '../db/repository';

export function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const CSV_HEADERS = [
  '单词',
  '音标',
  '语境释义',
  '完整释义',
  '例句',
  '语境片段',
  '标签',
  '收藏时间',
] as const;

/**
 * 格式化生词本记录为符合 Excel 与 RFC 4180 规范的 CSV 文本
 * 包含 \uFEFF (UTF-8 BOM)，杜绝 Windows 下 Excel 打开中文乱码
 * 安全红线：严格限定导出字段，严禁泄露任何系统配置与密钥凭据
 */
export function formatVocabularyCsv(records: VocabularyRecord[]): string {
  const headerLine = CSV_HEADERS.map(escapeCsvCell).join(',');

  const dataLines = records.map((record) => {
    const phonetic = record.phoneticUs || record.phoneticUk || '';
    const fullSenses = (record.senses || [])
      .map((s) => (s.pos ? `${s.pos} ${s.def}` : s.def))
      .filter(Boolean)
      .join('; ');
    const examples = (record.senses || [])
      .map((s) => s.example)
      .filter(Boolean)
      .join('; ');
    const tags = (record.tags || []).join(', ');

    const row = [
      escapeCsvCell(record.word),
      escapeCsvCell(phonetic),
      escapeCsvCell(record.contextSense),
      escapeCsvCell(fullSenses),
      escapeCsvCell(examples),
      escapeCsvCell(record.contextSnippet),
      escapeCsvCell(tags),
      escapeCsvCell(record.createdAt),
    ];

    return row.join(',');
  });

  return `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;
}
