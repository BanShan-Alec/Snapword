import { createPr, mergePr, statusPr, triggerReview } from './commands/pr.ts';
import { runPull } from './commands/pull.ts';
import { fail } from './utils/process.ts';

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'pull':
      runPull();
      break;
    case 'trigger':
    case 'review':
      triggerReview();
      break;
    case 'create':
    case 'pr':
      createPr();
      break;
    case 'merge':
      mergePr();
      break;
    case 'status':
      statusPr();
      break;
    default:
      console.log(`
🛡️ @app/pr-review - PR 生命周期与 AI 代码审查看板套件

用法:
  pnpm pr-review pull      拉取最新已完成的 AI Review 产物并生成多轮看板 (自动清理>10轮)
  pnpm pr-review trigger   为当前 PR 评论 /review，触发 OpenCodeReview 增量审查
  pnpm pr-review create    创建 PR 并自动关联模板与分支提交
  pnpm pr-review status    查看当前仓库/分支的 PR 与 checks 状态
  pnpm pr-review merge     等待分支门禁全绿后执行 squash 合并并删除远端分支
`);
      if (command) {
        fail(`未知子命令: "${command}"`);
      }
      process.exit(0);
  }
}

main();
