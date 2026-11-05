import { memo } from 'react';
import { Route, Switch } from 'wouter';
import { AppShell } from '@/components/layout/AppShell';
import { GlossaryFeature } from '@/features/glossary';
import { HelpFeature } from '@/features/help';
import { HistoryFeature } from '@/features/history';
import { SettingsFeature } from '@/features/settings';
import { TranslateFeature } from '@/features/translate';
import { VocabularyFeature } from '@/features/vocabulary';

/**
 * 主窗口（C-05 外壳）：RM-02 左侧导航 + 右侧内容区，六个业务域挂 wouter 路由。
 * 默认域「翻译」；未知路径统一回「翻译」。
 */
const _App = () => (
  <AppShell>
    <Switch>
      <Route path="/">
        <TranslateFeature />
      </Route>
      <Route path="/history">
        <HistoryFeature />
      </Route>
      <Route path="/vocabulary">
        <VocabularyFeature />
      </Route>
      <Route path="/glossary">
        <GlossaryFeature />
      </Route>
      <Route path="/settings">
        <SettingsFeature />
      </Route>
      <Route path="/help">
        <HelpFeature />
      </Route>
      {/* 未知路径统一回根路径（翻译） */}
      <Route path="/:rest*">
        <TranslateFeature />
      </Route>
    </Switch>
  </AppShell>
);

export const App = memo(_App);
