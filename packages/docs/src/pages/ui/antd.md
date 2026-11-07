---

title: 组件库（Antd）
description: Ant Design 五层 Provider 装配与 StyleProvider layer 层序配对，样式权重与全局上下文的桌面端解法。
---

# 组件库（Antd）

> **TL;DR**：标准五层 Provider 链式装配；`StyleProvider layer` 把 antd 的 cssinjs 样式收进 `@layer antd`，与全局层序声明配对，让 Tailwind 工具类可以稳定覆盖；全局通知必须经 `<AntdApp>` 上下文。

## 1. 选型理由

桌面应用需要丰富、高质量的底层控件（表格、树形控件、表单、模态框），Ant Design 提供健全的企业级组件生态。本页的集成重点只有两件事：**装配出职责清晰的 Provider 栈**、**解决 CSS-in-JS 与实用类的样式权重争端**。颜色如何从品牌种子派生、如何被业务消费，见 [设计规范与令牌](/ui/design-tokens)。

## 2. 核心机制

### 标准五层 Provider 链式装配

→ 源码：[packages/renderer/src/components/layout/AppProviders/index.tsx](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/packages/renderer/src/components/layout/AppProviders/index.tsx)

```tsx
export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 节选：省略 resolvedTheme/language 取值与 effect（跨窗口主题收敛见主题链路页）
  return (
    <I18nProvider i18n={i18n}>
      {/*
        layer：把 cssinjs 注入的 antd 样式收进 @layer antd（层名由 cssinjs 默认提供），
        配合 index.css 首行的层序声明，使 Tailwind utilities 可直接覆盖 antd 组件样式。
      */}
      <StyleProvider layer>
        <ConfigProvider
          button={{ autoInsertSpace: false }}
          theme={getAntdThemeConfig(resolvedTheme)}
          locale={getAntdLocale(language)}
        >
          <AntdApp>
            <ErrorBoundary>{children}</ErrorBoundary>
          </AntdApp>
        </ConfigProvider>
      </StyleProvider>
    </I18nProvider>
  );
};
```

自外向内各司其职：I18nProvider 供 Lingui 实例（语言按需动态激活，见 [国际化](/ui/i18n)）；StyleProvider 收纳样式层；ConfigProvider 注入主题配置与 locale（主题配置见 [设计规范与令牌](/ui/design-tokens)）；`<AntdApp>` 提供消息/弹窗上下文；ErrorBoundary 兜底（见 [错误边界](/ui/error-boundary)）。

### 层序基石：@layer 声明与 StyleProvider layer 配对

index.css 首行声明五层层序：

`@layer theme, base, antd, components, utilities;`

antd 默认以高特异性内联 `<style>` 注入样式，单有层序声明收不住它——必须配对 `<StyleProvider layer>`，把 cssinjs 产物也放进 `@layer antd`。此后覆盖关系只看层、不看选择器特异性与注入顺序：`utilities > antd`，Tailwind 工具类永远能覆盖组件默认样式。

## 3. 桌面端避坑注意事项

- **`<StyleProvider layer>` 与层序声明必须成对出现**：只声明层序不开启 `layer`，antd 样式仍在层外，`p-4` 这类常规工具类因权重不足压不过它；只开 `layer` 不声明层序，`@layer antd` 无处安放，覆盖关系退回注入顺序。
- **全局通知与弹窗必须经 `<AntdApp>` 上下文**：严禁在 React 树外裸调 `message.success()`、`Modal.confirm()`——会丢失主题与语言 Context。统一通过 `const { message, modal } = AntdApp.useApp()` 取用。
