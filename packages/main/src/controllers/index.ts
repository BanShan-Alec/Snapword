import { registerCalculatorControllers } from './calculator.controller';
import { registerConfigControllers } from './config.controller';
import { registerCounterControllers } from './counter.controller';
import { registerDiagnosticsControllers } from './diagnostics.controller';
import { registerDialogControllers } from './dialog.controller';
import { registerSystemControllers } from './system.controller';
import { registerUpdaterControllers } from './updater.controller';
import { registerUsbControllers } from './usb.controller';
import { registerWindowControllers } from './window.controller';

/**
 * 显式挂载注册所有 IPC Controllers
 * 对齐 specs-electron-fullstack / main/controller-patterns.md 规范
 */
export function registerAllControllers(): void {
  registerSystemControllers();
  registerUsbControllers();
  registerCounterControllers();
  registerCalculatorControllers();
  registerConfigControllers();
  registerDiagnosticsControllers();
  registerDialogControllers();
  registerUpdaterControllers();
  registerWindowControllers();
}
