import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient } from './api/trpc';
import { App } from './App';
import './styles.css';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import 'ag-grid-enterprise';
import { LicenseManager } from 'ag-grid-enterprise';

type ClientConfig = {
  agGridLicenseKey?: string;
};

async function loadClientConfig(): Promise<ClientConfig> {
  const buildTimeKey = import.meta.env.VITE_AG_GRID_LICENSE_KEY;
  if (buildTimeKey) {
    return { agGridLicenseKey: buildTimeKey };
  }

  try {
    const response = await fetch('/api/client-config', { credentials: 'same-origin' });
    if (!response.ok) {
      return {};
    }
    return (await response.json()) as ClientConfig;
  } catch {
    return {};
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
