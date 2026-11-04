import type { UserConfig } from '@commitlint/types';
import { RuleConfigSeverity } from '@commitlint/types';

const Configuration: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-chinese': (parsed) => {
          const { subject } = parsed;
          if (!subject) {
            return [false, '提交说明（subject）不能为空'];
          }
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

export default Configuration;
