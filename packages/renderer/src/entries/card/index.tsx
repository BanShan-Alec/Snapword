import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { AppProviders } from '@/components/layout/AppProviders';
import { CardFeature } from '@/features/card';
import { initSentry } from '@/lib/sentry';
import { useAppStore } from '@/stores/useAppStore';
import { applyColorScheme } from '@/styles/design-tokens';

initSentry();
logger.info('Document started', { entry: 'card' });

applyColorScheme(useAppStore.getState().resolvedTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <CardFeature />
    </AppProviders>
  </StrictMode>,
);
