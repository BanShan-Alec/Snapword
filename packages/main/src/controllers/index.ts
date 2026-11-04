import { registerDiagnosticsControllers } from './diagnostics.controller';
import { registerSystemControllers } from './system.controller';

/**
 * 显式挂载注册所有 IPC Controllers
 *
 * P4 骨架仅保留系统探针（system:ping / system:get-info）与日志/诊断通道，
 * 证明 preload ContextBridge 白名单链路可用；业务控制器随主链路开发补齐。
 */
export function registerAllControllers(): void {
  registerSystemControllers();
  registerDiagnosticsControllers();
}
