---

title: 提交信息规范（Commitlint）
description: Commitlint 强制 Conventional Commits，并结合自定义规则要求描述必须包含中文。
---

# 提交信息规范（Commitlint）

> **TL;DR**：提交信息必须符合 Conventional Commits 格式，且 subject 必须包含简体中文描述；校验由 Husky `commit-msg` 钩子强制驱动，为后续 changelogen 自动化发版提供可靠语义源。

## 1. 选型理由

随意的提交信息（如 `update`、`fix bug`）会导致两大难题：
1. **历史排查困难**：Git 历史信息杂乱无章，版本回退或定位问题如同盲人摸象。
2. **自动化流水线断链**：桌面应用需要向用户输出语义化的版本更新日志（Changelog）。缺乏机器可读的前缀（`feat:`、`fix:`）将使自动化版本发布与增量说明完全失效。

项目在标准规范之上，增加了**中文描述强制规则**，兼顾自动化脚本解析与开发团队直观可读性。

## 2. 核心机制

### Commitlint 规则与自定义中文插件

→ 源码：[.config/commitlint.config.ts](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.config/commitlint.config.ts)

```ts
const Configuration: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-chinese': (parsed) => {
          const { subject } = parsed;
          if (!subject) return [false, '提交说明（subject）不能为空'];
          const hasChinese = /[\u4e00-\u9fa5]/.test(subject);
          return [
            hasChinese,
            '提交说明（subject）必须包含简体中文描述，例如: feat: 增加系统托盘功能',
          ];
        },
      },
    },
  ],
  rules: {
    'type-enum': [
      RuleConfigSeverity.Error,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'subject-chinese': [RuleConfigSeverity.Error, 'always'],
    'subject-case': [RuleConfigSeverity.Disabled],
  },
};
```

### Git 钩子触发链路

→ 源码：[.husky/commit-msg](https://github.com/BanShan-Alec/electron-react-monorepo-template/blob/main/.husky/commit-msg)

```sh
pnpm exec commitlint --config .config/commitlint.config.ts --edit "$1"
```

## 3. 桌面端避坑注意事项

- **标准提交格式模板**：
  - 正确示例：`feat(tray): 增加系统托盘快捷退出逻辑`
  - 正确示例：`fix(csp): 收紧生产环境脚本执行白名单`
  - 错误示例：`feat: add system tray`（缺少中文描述，门禁报错拦截）
  - 错误示例：`修复闪退问题`（缺少标准 Conventional 前缀，门禁报错拦截）
- **与版本日志生成器（changelogen）的映射**：
  - `feat` 对应更新日志中的 **Features** 小节；
  - `fix` 对应更新日志中的 **Bug Fixes** 小节；
  - `perf` 对应更新日志中的 **Performance** 小节；
  - 其余 `chore` / `style` 等辅助变更会自动折叠，避免污染面向用户的发布说明。
- **引导 AI 协作者生成提交**：
  - 在让 AI 提交代码时，明确要求其生成符合本规范的中文 Conventional Commits，否则 Git Commit 阶段会被 Husky 钩子直接打回。
