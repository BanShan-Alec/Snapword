---

title: 全局状态（Zustand）
description: 采用单一无 Provider 的 Zustand Store，主题与语言按需精准订阅。
---

# 全局状态（Zustand）

> **TL;DR**：抛弃繁复的 Redux 与容易引发全树重渲染的 React Context，采用单一无 Provider 的 Zustand 集中管理应用全局壳状态（主题模式、明暗解析、语言模式），组件按字段细粒度订阅。

## 1. 选型理由

桌面客户端对于状态管理的核心诉求是：
- **低侵入、零样板代码**：不需要在最外层包裹层层叠叠的 `<Context.Provider>`。
- **精确按需重渲染**：主题或语言改变时，只有关心该字段的组件重新渲染，其余纯业务卡片不受干扰。
- **壳层与业务解耦**：全局 Store 仅作为跨领域胶水，业务领域状态完全留在各自的 Feature Hook 内。

## 2. 核心机制

### 单一 Store 定义（useAppStore）

→ 源码：[packages/renderer/src/stores/useAppStore.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/src/stores/useAppStore.ts)

```ts
interface AppState {
  themeMode: ThemeMode; // 'system' | 'light' | 'dark'
  resolvedTheme: ResolvedTheme; // 实际物理渲染主题：'light' | 'dark'
  setThemeMode: (mode: ThemeMode) => void;
  language: LanguageMode; // 'system' | 'zh-CN' | 'en-US'
  setLanguage: (lang: LanguageMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  themeMode: DEFAULT_THEME_MODE,
  resolvedTheme: resolveTheme(DEFAULT_THEME_MODE),
  setThemeMode: (themeMode) => set({ themeMode, resolvedTheme: resolveTheme(themeMode) }),
  language: DEFAULT_LANGUAGE,
  setLanguage: (language) => set({ language }),
}));
```

### 系统原生偏好的动态分层解析

`themeMode` 与 `resolvedTheme` 刻意分层：跟随系统（`'system'`）不能直接投喂给底层渲染算法，必须在运行时解析为具体的明暗值：

```ts
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia(LIGHT_COLOR_SCHEME_QUERY).matches ? 'light' : 'dark';
  }
  return 'dark';
}
```

语言同理，通过 `@app/shared` 的 `resolveLocale(mode, systemLocale)` 将 `'system'` 映射为实际激活的 `'zh-CN' | 'en-US'`。

## 3. 桌面端避坑注意事项

- **组件严禁解构整个 Store**：
  - 错误写法：`const { themeMode } = useAppStore();`（这会导致任何非相关字段变更均触发组件重渲）。
  - 正确写法：`const themeMode = useAppStore((state) => state.themeMode);`，精确 selector 订阅。
- **主进程持久化配置驱动 Store 闭环**：
  - Zustand 仅存活在当前渲染进程内存中。设置项在落盘持久化至主进程 `userData/config.json` 后，通过全局广播 `window.api.config.onChanged` 实时反哺 Store，实现跨窗口与启动后的偏好闭环。
- **业务领域状态严禁塞入全局 Store**：
  - 计数器状态、计算器表单数据、USB 列表等状态只属于对应业务域，必须由 `features/<domain>/hooks/` 自行维护。全局 Store 仅允许存放主题、语言、全局弹窗等全屏级基础属性。
