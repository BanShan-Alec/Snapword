import {
  BulbOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Button, Tooltip } from 'antd';
import { memo } from 'react';
import { AppCard } from '@/components/ui/AppCard';
import { CardTitle } from '@/components/ui/CardTitle';
import { CodeHighlight } from '@/components/ui/CodeHighlight';
import { StatusTag } from '@/components/ui/StatusTag';
import type { SupportedLocale } from '@/locales/i18n';

// 私有常量
const STEP_CARD_CLASS =
  'flex items-start gap-3 p-3.5 bg-background-sunken rounded-lg border border-border';
const CODE_BLOCK_CLASS =
  'text-xs font-mono text-foreground-secondary bg-background/80 p-3 rounded-lg overflow-x-auto stable-scrollbar leading-relaxed flex-1 select-text';

const LEGACY_CODE_ZH = `// 1. 渲染端强行引用主进程类型 (打破物理隔离)
import type { AppRouter } from '@app/main/router';

// 2. 纯数字状态码或裸抛异常 (易造成前端崩溃)
throw new TRPCError({ code: 'BAD_REQUEST' });

// 3. 缺乏标准 Result 包装
// 前端无法统一判定 res.success 与语义化 code`;

const LEGACY_CODE_EN = `// 1. Renderer directly imports main process types (breaks physical isolation)
import type { AppRouter } from '@app/main/router';

// 2. Raw numeric status code or bare thrown exception (prone to UI crashes)
throw new TRPCError({ code: 'BAD_REQUEST' });

// 3. Lack of standard Result envelope
// Frontend cannot uniformly evaluate res.success and semantic error code`;

const STANDARD_CODE_ZH = `// 1. Controller 执行 Zod 防御校验并封装 Result
const res = await systemService.getSystemInfo();
return { success: true, data: res };

// 2. 语义化字符串错误码 (如 DIVIDE_BY_ZERO)
// 3. 渲染端通过 window.api 纯净消费
const res = await window.api.system.getSystemInfo();
if (res.success) {
  console.log(res.data.cpuModel);
}`;

const STANDARD_CODE_EN = `// 1. Controller executes Zod defensive validation and encapsulates Result
const res = await systemService.getSystemInfo();
return { success: true, data: res };

// 2. Semantic string error codes (e.g. DIVIDE_BY_ZERO)
// 3. Pure consumption in Renderer via window.api
const res = await window.api.system.getSystemInfo();
if (res.success) {
  console.log(res.data.cpuModel);
}`;

// 代码示例是「教学内容」而非界面文案：按语种穷尽映射，新增语种必须同时补一份
const CODE_SAMPLES: Record<SupportedLocale, { legacy: string; standard: string }> = {
  'zh-CN': { legacy: LEGACY_CODE_ZH, standard: STANDARD_CODE_ZH },
  'en-US': { legacy: LEGACY_CODE_EN, standard: STANDARD_CODE_EN },
};

// 可抽离的逻辑处理函数/组件
function StepItem({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className={STEP_CARD_CLASS}>
      <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center font-semibold text-xs shrink-0">
        {step}
      </div>
      <div>
        <span className="font-semibold text-xs text-foreground block">{title}</span>
        <p className="text-xs text-foreground-secondary mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

const _ArchitectureView = (props: ArchitectureViewProps) => {
  const { i18n } = useLingui();
  const { onCopyCode } = props;
  const samples = CODE_SAMPLES[i18n.locale as SupportedLocale] ?? CODE_SAMPLES['zh-CN'];
  const legacyCode = samples.legacy;
  const standardCode = samples.standard;

  // 组件渲染
  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Flow Diagram Card */}
      <AppCard
        title={
          <CardTitle
            icon={<BulbOutlined />}
            title={t`Fullstack 经典分层通信架构全流程`}
            subtitle={t`遵循 specs-electron-fullstack 规范：Controller -> Service -> Result 契约`}
          />
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
          <StepItem
            step={1}
            title={t`@app/shared 共享契约单一事实源`}
            description={t`使用 Zod Schema 定义入参校验规则，派生跨端统一 TypeScript 类型与标准 Result<T> 响应契约。`}
          />
          <StepItem
            step={2}
            title={t`Main 进程 Controller -> Service 分层`}
            description={t`Controller 执行 Zod 防御性参数校验与顶层异常包装，Service 专注核心业务逻辑，杜绝 Procedure 称谓混淆。`}
          />
          <StepItem
            step={3}
            title={t`Preload 精准白名单桥接`}
            description={t`使用 contextBridge.exposeInMainWorld('api', apiBridge) 暴露受限安全 API 与 webUtils，杜绝渲染端渗透。`}
          />
          <StepItem
            step={4}
            title={t`Renderer 进程纯净消费`}
            description={t`统一通过 window.api 消费 Result 契约，享受完备 IDE 智能提示，与主进程实现 100% 物理代码隔离。`}
          />
        </div>
      </AppCard>

      {/* Code Comparison Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Legacy / Coupled */}
        <div className="app-card rounded-lg p-4 border border-danger/30 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-y-1 pb-2 mb-3 border-b border-danger/20">
            <span className="text-xs font-semibold text-foreground flex items-center">
              <CloseCircleOutlined className="text-danger mr-1.5" />
              {t`传统散装 / 进程穿透方式`}
            </span>
            <div className="flex items-center gap-2">
              <StatusTag tone="danger">{t`代码耦合 & 契约混乱`}</StatusTag>
              <Tooltip title={t`复制代码`}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  aria-label={t`复制代码`}
                  onClick={() => void onCopyCode(legacyCode)}
                />
              </Tooltip>
            </div>
          </div>
          <CodeHighlight code={legacyCode} className={CODE_BLOCK_CLASS} />
        </div>

        {/* Fullstack Standard */}
        <div className="app-card rounded-lg p-4 border border-success/30 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-y-1 pb-2 mb-3 border-b border-success/20">
            <span className="text-xs font-semibold text-foreground flex items-center">
              <CheckCircleOutlined className="text-success mr-1.5" />
              {t`Fullstack 规范分层方式`}
            </span>
            <div className="flex items-center gap-2">
              <StatusTag tone="success">{t`物理隔离 & Result 契约`}</StatusTag>
              <Tooltip title={t`复制代码`}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  aria-label={t`复制代码`}
                  onClick={() => void onCopyCode(standardCode)}
                />
              </Tooltip>
            </div>
          </div>
          <CodeHighlight code={standardCode} className={CODE_BLOCK_CLASS} />
        </div>
      </div>
    </div>
  );
};

// props 类型定义
interface ArchitectureViewProps {
  onCopyCode: (code: string) => Promise<void>;
}

export const ArchitectureView = memo(_ArchitectureView);
