import { registerCardControllers } from './card.controller';
import { registerConfigControllers } from './config.controller';
import { registerDiagnosticsControllers } from './diagnostics.controller';
import { registerShellControllers } from './shell.controller';
import { registerSystemControllers } from './system.controller';
import { registerTranslationControllers } from './translation.controller';
import { registerUpdaterControllers } from './updater.controller';
import { registerWindowControllers } from './window.controller';

/**
 * 显式挂载注册所有 IPC Controllers
 * 对齐 specs-electron-fullstack / main/controller-patterns.md 规范
 */
export function registerAllControllers(): void {
  registerSystemControllers();
  registerConfigControllers();
  registerDiagnosticsControllers();
  registerShellControllers();
  registerUpdaterControllers();
  registerWindowControllers();
  registerTranslationControllers();
  registerCardControllers();
}
