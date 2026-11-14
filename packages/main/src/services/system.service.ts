import os from 'node:os';
import process from 'node:process';
import type { PingResult, SystemInfo } from '@app/shared/types/system';
import { currentAppEnv, isPackaged } from '../env';

export class SystemService {
  getPing(): PingResult {
    return {
      message: 'pong',
      timestamp: Date.now(),
      serverTime: new Date().toLocaleTimeString(),
    };
  }

  getSystemInfo(): SystemInfo {
    const cpus = os.cpus();
    const memUsage = process.memoryUsage();

    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      v8Version: process.versions.v8,
      cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown',
      cpuCores: cpus.length,
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
      heapUsedMB: Math.round(memUsage.heapUsed / (1024 * 1024)),
      heapTotalMB: Math.round(memUsage.heapTotal / (1024 * 1024)),
      uptimeSeconds: Math.floor(process.uptime()),
      env: currentAppEnv,
      isPackaged,
    };
  }
}

export const systemService = new SystemService();
