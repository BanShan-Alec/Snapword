import { describe, expect, it, vi } from 'vitest';
import { parsePrNumberArg } from '../../src/commands/pull.ts';

vi.mock('../../src/utils/process.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/process.ts')>();
  return {
    ...actual,
    fail: vi.fn((msg: string) => {
      throw new Error(`FAIL: ${msg}`);
    }),
  };
});

describe('parsePrNumberArg', () => {
  it('returns undefined when --pr flag is omitted', () => {
    expect(parsePrNumberArg([])).toBeUndefined();
    expect(parsePrNumberArg(['--verbose'])).toBeUndefined();
  });

  it('parses valid --pr <number> and --pr=<number> formats', () => {
    expect(parsePrNumberArg(['--pr', '93'])).toBe(93);
    expect(parsePrNumberArg(['--pr=93'])).toBe(93);
  });

  it('fails cleanly when --pr value is missing or non-positive integer', () => {
    expect(() => parsePrNumberArg(['--pr'])).toThrow(/无效的 --pr 参数/);
    expect(() => parsePrNumberArg(['--pr', '0'])).toThrow(/无效的 --pr 参数/);
    expect(() => parsePrNumberArg(['--pr', 'abc'])).toThrow(/无效的 --pr 参数/);
    expect(() => parsePrNumberArg(['--pr=-1'])).toThrow(/无效的 --pr 参数/);
    expect(() => parsePrNumberArg(['--pr='])).toThrow(/无效的 --pr 参数/);
  });
});
