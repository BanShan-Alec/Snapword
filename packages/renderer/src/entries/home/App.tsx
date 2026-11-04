import { memo } from 'react';
import { Route, Switch } from 'wouter';
import { AppShell } from '@/components/layout/AppShell';
import { GlossaryPage } from '@/pages/glossary';
import { HelpPage } from '@/pages/help';
import { HistoryPage } from '@/pages/history';
import { SettingsPage } from '@/pages/settings';
import { TranslatePage } from '@/pages/translate';
import { VocabularyPage } from '@/pages/vocabulary';

/**
 * 主窗口（C-05 外壳）：RM-02 左侧导航 + 右侧内容区，六页挂 wouter 路由。
 * 默认页「翻译」；未知路径统一回「翻译」。
 */
const _App = () => (
  <AppShell>
    <Switch>
      <Route path="/">
        <TranslatePage />
      </Route>
      <Route path="/history">
        <HistoryPage />
      </Route>
      <Route path="/vocabulary">
        <VocabularyPage />
      </Route>
      <Route path="/glossary">
        <GlossaryPage />
      </Route>
      <Route path="/settings">
        <SettingsPage />
      </Route>
      <Route path="/help">
        <HelpPage />
      </Route>
      {/* 未知路径统一回根路径（翻译） */}
      <Route path="/:rest*">
        <TranslatePage />
      </Route>
    </Switch>
  </AppShell>
);

export const App = memo(_App);
