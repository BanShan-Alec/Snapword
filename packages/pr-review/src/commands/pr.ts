import fs from 'node:fs';
import { CliVcsAdapter } from '../adapters/cli-vcs.ts';
import { PrWorkflowEngine } from '../core/workflow-engine.ts';
import { fail, toErrorMessage } from '../utils/process.ts';

function createEngine(): PrWorkflowEngine {
  const vcs = new CliVcsAdapter();
  return new PrWorkflowEngine({
    vcs,
    confirmMerge: ({ branch, targetBranch }) => {
      if (process.argv.includes('--yes')) {
        return true;
      }
      process.stdout.write(`确认将 ${branch} 合并入 ${targetBranch}? (y/N): `);
      let answer = '';
      try {
        const buffer = Buffer.alloc(1024);
        const bytesRead = fs.readSync(0, buffer, 0, 1024, null);
        answer = buffer.toString('utf-8', 0, bytesRead).trim();
      } catch {
        answer = '';
      }
      return /^y(es)?$/i.test(answer);
    },
  });
}

async function handleCommand(
  action: (engine: PrWorkflowEngine) => Promise<unknown>,
): Promise<void> {
  try {
    const engine = createEngine();
    await action(engine);
  } catch (err: unknown) {
    fail(toErrorMessage(err));
  }
}

export async function createPr(): Promise<void> {
  await handleCommand((engine) => engine.createPr());
}

export async function mergePr(): Promise<void> {
  await handleCommand((engine) => engine.mergePr({ yes: process.argv.includes('--yes') }));
}

export async function statusPr(): Promise<void> {
  await handleCommand((engine) => engine.statusPr());
}

export async function triggerReview(): Promise<void> {
  await handleCommand(async (engine) => {
    const pr = await engine.triggerReview();
    if (pr.url) {
      console.log(`  PR 链接: ${pr.url}`);
    }
    console.log(
      '  提示: GitHub Actions 已在后台启动审查工作流，约 2~3 分钟后可执行 pnpm pr-review pull 拉取看板。',
    );
  });
}
