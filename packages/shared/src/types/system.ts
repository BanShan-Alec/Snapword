import type { AppEnv } from '../constants/env';

export interface PingResult {
  message: string;
  timestamp: number; // Unix 毫秒统一规范
  serverTime: string;
  mainDurationMs?: number; // 主进程内部处理耗时（毫秒）
  eventLoopLagMs?: number; // 主进程 Event Loop 真实排队滞后耗时（毫秒）
}

export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  electronVersion: string;
  chromeVersion: string;
  v8Version: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryMB: number;
  freeMemoryMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  uptimeSeconds: number;
  env?: AppEnv;
  isPackaged?: boolean;
}
