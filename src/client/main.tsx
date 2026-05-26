import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient } from './api/trpc';
import { App } from './App';
import { registerUiStoreStorageSync } from './store/uiStoreStorageSync';
import './styles.css';
import './styles-mobile.css';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import 'ag-grid-enterprise';
import { ClipboardModule, LicenseManager, ModuleRegistry } from 'ag-grid-enterprise';

// GH #355: explicitly register ClipboardModule so copy/paste works in all grids
ModuleRegistry.registerModules([ClipboardModule]);

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
    console.warn('[loadClientConfig] Timed out or failed, proceeding without AG Grid license');
    return {};
  } finally {
    clearTimeout(timeoutId);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10_000,
      retry: 1
    }
  }
});

// FE-L3 (#36): keep persisted uiStore slice in sync across tabs. Registered
// once at startup; idempotent so re-imports during HMR do not double-fire.
registerUiStoreStorageSync();

void loadClientConfig().then((config) => {
  const licenseKey = config.agGridLicenseKey ?? import.meta.env.VITE_AG_GRID_LICENSE_KEY ?? '';
  if (licenseKey) {
    LicenseManager.setLicenseKey(licenseKey);
  }

  // Polyfill: crypto.randomUUID for non-secure contexts (e.g. Tailscale HTTP)
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  (crypto as any).randomUUID = function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
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
