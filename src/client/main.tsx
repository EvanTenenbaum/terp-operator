import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { logger } from './services/logger';
import { trpc, trpcClient } from './api/trpc';
import { App } from './App';
import { registerUiStoreStorageSync } from './store/uiStoreStorageSync';
import './styles.css';
import './styles-mobile.css';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { LicenseManager } from 'ag-grid-enterprise';

type ClientConfig = {
  agGridLicenseKey?: string;
};

async function loadClientConfig(): Promise<ClientConfig> {
  const buildTimeKey = import.meta.env.VITE_AG_GRID_LICENSE_KEY;
  if (buildTimeKey) {
    return { agGridLicenseKey: buildTimeKey };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/client-config', { credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) {
      return {};
    }
    return (await response.json()) as ClientConfig;
  } catch {
    // Timeout or network error — proceed without license key
    logger.warn('Timed out or failed, proceeding without AG Grid license', { module: 'loadClientConfig' });
    return {};
  } finally {
    clearTimeout(timeoutId);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // EXT-REVIEW 2026-06 finding #3 ("pages must be constantly refreshed"):
      // three layers keep data live without manual refresh —
      //   1. command-scoped invalidation (useCommandRunner / SocketContext)
      //   2. refetch on tab focus + network reconnect (below)
      //   3. a 60s active-only polling safety net so data still converges even
      //      when the websocket is blocked by a proxy (observed on some PaaS
      //      ingress configs). Only mounted queries poll; background tabs do not.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      staleTime: 10_000,
      retry: 1
    }
  }
});

// Polyfill: crypto.randomUUID for non-secure contexts (e.g. Tailscale HTTP).
// Must run BEFORE any async operations because imported modules may call
// crypto.randomUUID() at module-evaluation time, before loadClientConfig resolves.
if (typeof crypto !== 'undefined' && !(crypto as { randomUUID?: () => string }).randomUUID) {
  (crypto as { randomUUID: () => string }).randomUUID = function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

// FE-L3 (#36): keep persisted uiStore slice in sync across tabs. Registered
// once at startup; idempotent so re-imports during HMR do not double-fire.
registerUiStoreStorageSync();

void loadClientConfig().then((config) => {
  const licenseKey = config.agGridLicenseKey ?? import.meta.env.VITE_AG_GRID_LICENSE_KEY ?? '';
  if (licenseKey) {
    LicenseManager.setLicenseKey(licenseKey);
  }

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <trpc.Provider client={trpcClient()} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </trpc.Provider>
    </React.StrictMode>
  );
});
