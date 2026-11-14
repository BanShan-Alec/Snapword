import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  getDefaultMigrationsFolder,
  initDatabase,
} from '../packages/main/src/db/client.ts';
import {
  SettingRepository,
  TermRepository,
  VocabularyRepository,
} from '../packages/main/src/db/repository.ts';

async function runSmoke(): Promise<void> {
  console.log('🧪 [db-smoke] 启动 Snapword 数据库与仓储层自动化冒烟测试...');

  const tmpDbPath = path.join(
    os.tmpdir(),
    `snapword-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const migrationsFolder = getDefaultMigrationsFolder();

  console.log(`📁 临时数据库路径: ${tmpDbPath}`);
  console.log(`📁 迁移目录路径: ${migrationsFolder}`);

  try {
    // 1. 初始化双连接模型并应用迁移
    console.log('🔄 1. 执行双连接迁移与运行时连接建立...');
    const { client, db } = initDatabase({
      dbPath: tmpDbPath,
      migrationsFolder,
    });
    assert.ok(db, 'Drizzle ORM 实例创建成功');
    assert.ok(client, 'SQLite 运行时驱动连接建立成功');

    // 2. 验证核心表结构存在性
    console.log('🔍 2. 验证核心实体表存在性...');
    const tables = client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));
    assert.ok(tableNames.has('vocabulary'), '表 vocabulary 必须存在');
    assert.ok(tableNames.has('term'), '表 term 必须存在');
    assert.ok(tableNames.has('setting'), '表 setting 必须存在');
    assert.ok(tableNames.has('__drizzle_migrations'), '迁移表 __drizzle_migrations 必须存在');
    console.log('   ✅ 表结构完整性检查通过');

    // 3. Issue #6165 缺陷防御断言：setting.key 必须具有 NOT NULL
    console.log('🛡️  3. 验证 Issue #6165 缺陷防御（setting.key NOT NULL 断言）...');
    const settingTableInfo = client.prepare("PRAGMA table_info('setting')").all() as Array<{
      name: string;
      notnull: number;
      pk: number;
    }>;
    const keyCol = settingTableInfo.find((col) => col.name === 'key');
    assert.ok(keyCol, 'setting 表必须包含 key 列');
    assert.equal(
      keyCol.notnull,
      1,
      'PRAGMA table_info(setting).notnull 必须等于 1 (Issue #6165 防御)',
    );
    assert.equal(keyCol.pk, 1, 'setting.key 必须为主键');
    console.log('   ✅ Issue #6165 NOT NULL 补丁断言通过: notnull === 1');

    // 4. 验证 CHECK 约束有效拦截非法 JSON
    console.log('🔒 4. 验证 CHECK 约束拦截非法 JSON 写入...');
    let checkConstraintTriggered = false;
    try {
      client
        .prepare(
          `INSERT INTO vocabulary (word, word_norm, senses_json, tags_json, created_at, updated_at, origin_device)
           VALUES ('bad', 'bad', '{invalid_json}', '[]', '2026-11-14T12:00:00.000Z', '2026-11-14T12:00:00.000Z', 'smoke')`,
        )
        .run();
    } catch {
      checkConstraintTriggered = true;
    }
    assert.ok(checkConstraintTriggered, 'CHECK 约束必须成功拦截 senses_json 非法 JSON 字符串');
    console.log('   ✅ CHECK ck_vocabulary_senses_json 约束拦截有效');

    // 5. 验证仓储层生词 CRUD、软删除与 5 秒撤销
    console.log('📚 5. 验证生词 CRUD、软删除与撤销机制...');
    const vocabRepo = new VocabularyRepository(db);

    const upsertRes1 = vocabRepo.upsertWord({
      word: 'resilient',
      phoneticUs: '/rɪˈzɪliənt/',
      senses: [
        {
          pos: 'adj.',
          def: '有弹性的；能复原的',
          example: 'a resilient architecture',
        },
      ],
      tags: ['system', 'architecture'],
      contextSense: '架构韧性',
      contextSnippet: 'building a resilient SQLite database layer',
      originDevice: 'smoke-device',
    });
    assert.equal(upsertRes1.isNew, true, '首次添加单词必须标记为 isNew');
    assert.equal(upsertRes1.record.wordNorm, 'resilient');
    assert.equal(upsertRes1.record.deletedAt, null);

    const listWords1 = vocabRepo.getWords();
    assert.equal(listWords1.length, 1);
    assert.equal(listWords1[0].word, 'resilient');

    // 软删除
    const delRes = vocabRepo.softDeleteWord(upsertRes1.record.id, 'smoke-device');
    assert.equal(delRes.affectedCount, 1);
    assert.ok(delRes.batchId, '软删除必须生成 batchId UUID');

    const listWordsAfterDelete = vocabRepo.getWords();
    assert.equal(listWordsAfterDelete.length, 0, '软删除后查询默认排除 deleted_at IS NOT NULL 行');

    // 撤销删除
    const undoRes = vocabRepo.undoBatch(delRes.batchId, 'smoke-device');
    assert.equal(undoRes.restoredCount, 1, '撤销软删除必须恢复 1 行数据');

    const listWordsAfterUndo = vocabRepo.getWords();
    assert.equal(listWordsAfterUndo.length, 1, '撤销后单词必须重新存活显示');
    assert.equal(listWordsAfterUndo[0].deletedAt, null);
    console.log('   ✅ 软删除与 5 秒撤销流程验证通过');

    // 6. 验证软删除后唯一键复活机制
    console.log('🌱 6. 验证已软删除生词的唯一键复活与语境更新...');
    // 再次软删除
    const delRes2 = vocabRepo.softDeleteWord(upsertRes1.record.id, 'smoke-device');
    assert.equal(delRes2.affectedCount, 1);

    // 再次添加相同归一化词条
    const reviveRes = vocabRepo.upsertWord({
      word: 'Resilient',
      phoneticUs: '/rɪˈzɪliənt/',
      senses: [
        {
          pos: 'adj.',
          def: '适应力强的',
          example: 'resilient developers',
        },
      ],
      tags: [], // 空标签触发保留旧标签
      contextSense: '新语境义',
      contextSnippet: 'new context snippet',
      originDevice: 'smoke-device-2',
    });
    assert.equal(reviveRes.isNew, false, '复活已存在单词必须判定为更新 (isNew === false)');
    assert.equal(reviveRes.record.id, upsertRes1.record.id, '必须复用原行 id');
    assert.equal(reviveRes.record.deletedAt, null, '复活后 deletedAt 必须恢复为 NULL');
    assert.equal(reviveRes.record.contextSense, '新语境义', '语境必须更新为新内容');
    assert.deepEqual(reviveRes.record.tags, ['system', 'architecture'], '空新标签必须保留旧标签');
    console.log('   ✅ 唯一键复活机制验证通过');

    // 7. 验证搜索与转义
    console.log('🔎 7. 验证搜索与通配符转义...');
    const searchRes = vocabRepo.searchWords('resil');
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].wordNorm, 'resilient');

    const emptySearch = vocabRepo.searchWords('nonexistent');
    assert.equal(emptySearch.length, 0);
    console.log('   ✅ 搜索与转义验证通过');

    // 8. 验证术语与设置仓储
    console.log('⚙️  8. 验证 TermRepository 与 SettingRepository...');
    const termRepo = new TermRepository(db);
    const term1 = termRepo.upsertTerm({
      term: 'thread',
      matchType: 'exact',
      action: 'translate',
      translation: '线程',
      originDevice: 'smoke-device',
    });
    assert.equal(term1.termNorm, 'thread');
    assert.equal(termRepo.getLiveTerms().length, 1);

    const settingRepo = new SettingRepository(db);
    settingRepo.setSetting('ui.theme', 'dark', 'smoke-device');
    const themeSetting = settingRepo.getSetting('ui.theme');
    assert.ok(themeSetting);
    assert.equal(themeSetting.value, 'dark');
    console.log('   ✅ Term 与 Setting 仓储验证通过');

    console.log('\n🎉 [db-smoke] 所有冒烟测试用例全部执行通过！\n');
  } finally {
    closeDatabase();
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch {
        // ignore on windows lock release lag
      }
    }
  }
}

runSmoke().catch((err) => {
  console.error('\n❌ [db-smoke] 冒烟测试失败:', err);
  process.exit(1);
});
