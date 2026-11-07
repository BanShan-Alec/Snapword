import { CalculatorFeature } from '@/features/calculator';
import { CounterFeature } from '@/features/counter';
import { DevToolsFeature } from '@/features/devtools';
import { LoggingFeature } from '@/features/logging';
import { NativeDialogsFeature } from '@/features/native-dialogs';
import { PingFeature } from '@/features/ping';
import { SettingsFeature } from '@/features/settings';
import { SystemInfoFeature } from '@/features/system-info';
import { UsbFeature } from '@/features/usb';

/**
 * 总览看板域入口：组合编排看板各核心功能卡片
 */
function DashboardFeature() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <PingFeature />
      <SystemInfoFeature />
      <UsbFeature />
      <CounterFeature />
      <CalculatorFeature />
      <SettingsFeature />
      <NativeDialogsFeature />
      <LoggingFeature />
      <DevToolsFeature />
    </div>
  );
}

export { DashboardFeature };
export default DashboardFeature;
