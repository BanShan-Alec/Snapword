---

title: 代码规范与风格（Biome）
description: Biome 统一接管代码格式化、Lint 与导入排序，架构红线升格为编译期硬性阻断。
---

# 代码规范与风格（Biome）

> **TL;DR**：用 Biome 彻底替换传统的 ESLint + Prettier 链条，一份配置统一格式、检查与 import 排序；将禁止桶文件、禁止全量重导出、禁止循环依赖配置为 `error` 级刚性门禁。

## 1. 选型理由

传统 Web 前端工程通常需要混合 Prettier（格式化）、ESLint（代码检查）、eslint-plugin-import（排序）等多套工具，在 Monorepo 场景下往往遇到规则冲突、配置臃肿及本地检查慢等问题。

项目采用 Biome 作为统一工具，核心考量：
- **极速反馈**：全仓数百个 TypeScript 文件的全量扫描与修复均在数百毫秒内完成。
- **架构级红线拦截**：将「禁止无意义的桶文件」与「禁止循环引用」升格为硬性门禁，从根源杜绝编译依赖图错乱。
- **全格式统一纳管**：升级至 Biome 2.6+，不仅覆盖 TS/JS/JSX 与 JSON/JSONC，更原生纳管全仓 Markdown（`.md`）与 YAML（`.yml`/`.yaml`）资产的格式化，彻底淘汰多套零散格式化工具。
- **单一事实源**：统一收敛在 `.config/biome.json`，消灭多配置互相打架的局面。

## 2. 核心机制

### 架构红线规则声明

→ 源码：[.config/biome.json](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.config/biome.json)

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "performance": {
        "noBarrelFile": "error",
        "noReExportAll": "error"
      },
      "suspicious": {
        "noImportCycles": "error"
      },
      "correctness": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "ahooks": {
                "message": "禁用直接引用 ahooks useRequest；请求一律使用 src/hooks/useManualRequest.ts",
                "importNames": ["useRequest"]
              }
            }
          }
        }
      }
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": { "organizeImports": "on" }
    }
  }
}
```

### 命令统一调用与 Git 暂存拦截

由于配置文件统一收敛在 `.config/`，命令需显式携带配置路径：

```json
"lint": "biome check --config-path=.config .",
"lint:fix": "biome check --write --config-path=.config .",
"format": "biome format --write --config-path=.config ."
```

本地由 `husky` + `lint-staged` 在提交时自动对暂存区所有受支持格式（代码、JSON、Markdown 与 YAML）执行格式化与检查：

```json
"lint-staged": {
  "*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc,md,yml,yaml}": [
    "biome check --write --config-path=.config --no-errors-on-unmatched"
  ]
}
```

CI 阶段执行全量 `pnpm lint` 刚性检测。

## 3. 桌面端避坑注意事项

- **组件 Props 统一采用 interface 导出**：
  - UI 组件的 Props 类型统一使用 `export interface XxxProps extends ...` 声明，禁止裸写未命名的行内类型字面量，以便于扩展和统一代码风格。
- **桶文件与组件实体的辨析**：
  - Biome 的 `noBarrelFile` 旨在拦截只包含 `export * from './xxx'` 的聚合重导出文件。组件文件夹下的本体实现（如 `CounterCard/index.tsx` 本身包含完整渲染逻辑）不是桶文件，受规范保护。
- **杜绝双导出（Dual-export）反模式**：
  - 组件与工具统一使用具名导出（`export const CounterCard = ...`），严禁在文件末尾同时追加 `export default CounterCard`，避免多途径导入导致类型命名漂移与 Tree-shaking 失败。
- **IDE 插件路径指定**：
  - 由于配置文件位于 `.config/biome.json`，若 VS Code 或 Cursor 未能自动识别，请在 `.vscode/settings.json` 中配置 `"biome.lsp.bin"` 或指定配置文件相对路径。
