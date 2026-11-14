import { spawnSync } from 'node:child_process';

export function fail(message: string): never {
  console.error(`\x1b[31m✗ ${message}\x1b[0m`);
  process.exit(1);
}

export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

export function runOrThrow(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    throw new Error(`无法执行 ${cmd}: ${result.error.message} (是否已安装并在 PATH 中?)`);
  }
  if (result.status !== 0) {
    throw new Error(`命令执行失败: ${cmd} ${args.join(' ')} (退出码 ${result.status ?? 1})`);
  }
}

export interface ProbeRawResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export function probeRaw(cmd: string, args: string[]): ProbeRawResult {
  const result = spawnSync(cmd, args, { encoding: 'utf-8' });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    error: result.error,
  };
}

export function probe(cmd: string, args: string[]): string | null {
  const result = probeRaw(cmd, args);
  if (result.error || result.status !== 0) return null;
  return result.stdout;
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
