---

title: 功能域组织（Features）
description: 渲染层采用自包含领域目录（Features），域间禁止跨层引用，删功能即删目录。
---

# 功能域组织（Features）

> **TL;DR**：渲染层按功能域垂直划分（`features/<domain>/`），每个域拥有自包含的 `index.tsx`、私有组件与业务 Hook；域间禁止相互 import，废弃功能只需物理删除对应目录。

## 1. 选型理由

传统 Web 前端习惯按文件技术类型建立全局大池子（如所有组件全扔进全局 `components/`，所有 Hook 全扔进全局 `hooks/`）：
- 随着应用膨胀，一个业务域的代码散落在四五个不同目录下，谁调用了谁难以辨析。
- 业务下线或重构时，极易遗留大量无法被 Tree-shaking 干净的孤儿文件。

项目确立领域驱动原则：**一个业务域一个自包含目录，目录即功能边界**。

## 2. 核心机制

### 标准功能域拓扑结构

每个功能域严格遵循标准三件套规范：

```text
features/counter/
├── index.tsx                    # 唯一对外公开入口（仅做胶水：调用 Hook + 渲染卡片）
├── components/CounterCard/      # 私有展示组件（Props 进、回调出，不直接调 IPC）
└── hooks/useCounter.ts          # 私有业务 Hook（封装状态、计算与跨进程 IPC 调用）
```

### 极简胶水入口（index.tsx）

域入口是该功能唯一对外暴露的界面面孔，壳层路由无需感知内部细节：

→ 源码：[packages/renderer/src/features/counter/index.tsx](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/src/features/counter/index.tsx)

```tsx
export function CounterFeature() {
  const { count, step, setStep, isUpdating, handleIncrement, handleDecrement, handleReset } =
    useCounter();

  return (
    <CounterCard
      count={count}
      step={step}
      onStepChange={setStep}
      isUpdating={isUpdating}
      onIncrement={handleIncrement}
      onDecrement={handleDecrement}
      onReset={handleReset}
    />
  );
}
```

### 壳层路由统一装配

→ 源码：[packages/renderer/src/entries/home/App.tsx](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/src/entries/home/App.tsx)

```tsx
<Switch>
  <Route path="/dashboard">
    <DashboardFeature />
  </Route>
  <Route path="/architecture">
    <ArchitectureFeature />
  </Route>
  <Route path="/*">
    <Redirect to="/dashboard" replace />
  </Route>
</Switch>;
```

## 3. 桌面端避坑注意事项

- **功能域之间禁止互相直接 import**：
  - 严禁在 `features/counter` 中导入 `features/calculator` 的内部组件或 Hook。如存在跨域编排诉求，一律收敛到上层胶水域（如 `features/dashboard`）。
- **不要过早抽取共享层**：
  - 某组件或工具仅被当前域消费时，坚决留在自身域内；只有当第二个独立业务域确实产生重复诉求时，才允许将其上提到全局 `src/components/`、`src/hooks/` 或 `src/lib/`。
- **展示组件与业务 Hook 严格分离**：
  - `components/` 内的卡片组件应当是纯展示型的受控组件，不直接引用 `@app/preload` 的 IPC 接口，所有行为均通过 Props 回调委托给 `hooks/` 处理，以便于进行独立组件快照测试。
