---

title: 组件目录结构（Component-folder）
description: 组件统一采用一组件一文件夹（Xxx/index.tsx），私有资产同目录收敛，澄清组件本体非桶文件。
---

# 组件目录结构（Component-folder）

> **TL;DR**：所有 React 组件均采用独立目录形式（`Xxx/index.tsx`），组件私有的样式、Hook 与工具收敛在同级目录下；组件本体的 `index.tsx` 是实体实现而非重导出桶文件，受 Biome 规范豁免。

## 1. 选型理由

在组件组织上，扁平文件结构（如 `CounterCard.tsx`、`CounterCard.css` 混杂在一个大目录中）容易导致：
- 一个组件如果伴随私有样式、测试用例与子 Hook，会导致目录文件爆炸，无法直观辨析归属。
- 难以厘清私有资产与公共资产的边界。

工程统一实行「一组件一文件夹」：**目录即组件实体，目录名即组件名**。

## 2. 核心机制

### 标准组件目录形态

以复杂组件 `CodeHighlight` 为例，其私有 Hook 与 CSS 均闭合在文件夹内部：

```text
src/components/ui/CodeHighlight/
├── index.tsx                # 组件本体实现（包含 JSX 渲染与 Props 接口定义）
├── highlight.css            # 组件专属局部样式
└── hooks/
    └── useCodeHighlight.ts  # 组件专属私有 Hook
```

### 组件本体写法（单一本体验证）

→ 源码：[packages/renderer/src/features/counter/components/CounterCard/index.tsx](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/src/features/counter/components/CounterCard/index.tsx)

```tsx
const _CounterCard = (props: CounterCardProps) => {
  useLingui();
  const { count, step, onStepChange, isUpdating, onIncrement, onDecrement, onReset } = props;

  return <Card title={t`IPC 计数器 (Counter)`}>{/* 渲染逻辑 */}</Card>;
};

// 接口命名禁止 I 前缀，统一采用 <ComponentName>Props
interface CounterCardProps {
  count: number;
  step: number;
  onStepChange: (step: number) => void;
  isUpdating: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  onReset: () => void;
}

// 统一具名导出，禁止 export default 双导出反模式
export const CounterCard = memo(_CounterCard);
```

## 3. 桌面端避坑注意事项

- **组件本体与桶文件（Barrel File）的界限**：
  - Biome 的 `noBarrelFile` 旨在拦截只做 `export * from './xxx'` 的无意义中转文件。`CounterCard/index.tsx` 本身包含完整的 React 组件渲染逻辑，属于组件实体，严格受到规范支持，绝非桶文件。
- **杜绝双导出（Dual Export）反模式**：
  - 严禁在文件末尾同时书写 `export const Xxx = ...` 和 `export default Xxx`。混用导出方式会导致消费者导入途径分裂、IDE 自动引入路径漂移并阻碍打包编译器的 Tree-shaking 优化。
- **私有资产不向外暴露**：
  - `CounterCard` 内部依赖的私有辅助函数或子组件切勿导出给其他组件使用。若确需跨组件共享，应先将其重构上提至公共组件库目录。
