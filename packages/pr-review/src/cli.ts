import { createPr, mergePr, statusPr, triggerReview } from './commands/pr.ts';
import { parsePrNumberArg, runPull } from './commands/pull.ts';
import { fail, toErrorMessage } from './utils/process.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'pull':
      runPull(parsePrNumberArg(args.slice(1)));
      break;
    case 'trigger':
    case 'review':
      await triggerReview();
      break;
    case 'create':
    case 'pr':
      await createPr();
      break;
    case 'merge':
      await mergePr();
      break;
    case 'status':
      await statusPr();
      break;
    default:
      console.log(`
🛡️ @app/pr-review - PR 生命周期与 AI 代码审查看板套件

用法:
  pnpm pr-review pull [--pr <PR号>]  拉取最新已完成的 AI Review 产物并生成多轮看板 (自动清理>10轮)
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

main().catch((err: unknown) => {
  fail(toErrorMessage(err));
});
