import { spawnSync } from 'node:child_process';

export function fail(message: string): never {
  console.error(`\x1b[31m✗ ${message}\x1b[0m`);
  process.exit(1);
}

export function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    fail(`无法执行 ${cmd}: ${result.error.message} (是否已安装并在 PATH 中?)`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function probe(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args, { encoding: 'utf-8' });
  if (result.error || result.status !== 0) return null;
  return (result.stdout ?? '').trim();
}

export function safeParseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function sleepSync(ms: number): void {
  spawnSync(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`], { stdio: 'ignore' });
}
