// @vitest-environment jsdom
/**
 * UX-A13 — nav routes are canonical for Recovery and Closeout
 *
 * The former Settings "Action log" and "Archive" tabs embedded RecoveryView /
 * CloseoutView under the 'settings' ViewKey, so drawer/selection state
 * diverged from the standalone /recovery and /closeout routes. SettingsView
 * now:
 *   - renders "Action log" / "Archive" as links to /recovery and /closeout,
 *   - redirects stale 'actions'/'archive' tab state (persisted localStorage
 *     or legacy deep links) to the canonical routes, resetting the stored
 *     tab so /settings does not redirect forever,
 *   - keeps Requests as the connector-request home (UX-A12 redirects there),
 *   - titles the page "Settings — <tab>" (UX-Q08 partial).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../api/trpc', () => {
  const empty = () => ({ data: undefined, isLoading: false, refetch: vi.fn() });
  const procProxy: unknown = new Proxy({}, {
    get() { return { useQuery: empty }; }
  });
  return {
    trpc: {
      auth: { me: { useQuery: () => ({ data: { id: 'u-1', role: 'manager', email: 'mgr@example.test', name: 'Mgr', workLoop: null } }) } },
      queries: procProxy,
      credit: procProxy
    }
  };
});
vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: () => <div data-testid="operator-grid" />
}));
vi.mock('../components/DefaultPricingPanel', () => ({
  DefaultPricingPanel: () => <div data-testid="default-pricing-panel" />
}));
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));
vi.mock('./ConnectorsView', () => ({
  ConnectorsView: () => <div data-testid="connectors-view-embedded">Requests home</div>
}));

import { SettingsView } from './SettingsView';
import { useUiStore } from '../store/uiStore';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function TestRoutes() {
  return (
    <MemoryRouter initialEntries={['/settings']}>
      <LocationProbe />
      <Routes>
        <Route path="settings" element={<SettingsView />} />
        <Route path="recovery" element={<div data-testid="recovery-route">Recovery</div>} />
        <Route path="closeout" element={<div data-testid="closeout-route">Closeout</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useUiStore.setState({ activeSettingsTab: 'requests' });
});

describe('SettingsView — UX-A13 canonical homes', () => {
  it('redirects stale "actions" tab state to /recovery and resets the stored tab', () => {
    useUiStore.setState({ activeSettingsTab: 'actions' });
    render(<TestRoutes />);
    expect(screen.getByTestId('recovery-route')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe').textContent).toBe('/recovery');
    expect(useUiStore.getState().activeSettingsTab).toBe('requests');
  });

  it('redirects stale "archive" tab state to /closeout and resets the stored tab', () => {
    useUiStore.setState({ activeSettingsTab: 'archive' });
    render(<TestRoutes />);
    expect(screen.getByTestId('closeout-route')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe').textContent).toBe('/closeout');
    expect(useUiStore.getState().activeSettingsTab).toBe('requests');
  });

  it('no longer offers Action log / Archive as embedded tabs', () => {
    render(<TestRoutes />);
    const tabNames = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabNames).not.toContain('Action log');
    expect(tabNames).not.toContain('Archive');
    // Requests stays the connector-request home (UX-A12 redirect target).
    expect(tabNames).toContain('Requests');
    expect(screen.getByTestId('connectors-view-embedded')).toBeInTheDocument();
  });

  it('"Action log →" link navigates to the canonical /recovery route', async () => {
    const user = userEvent.setup();
    render(<TestRoutes />);
    await user.click(screen.getByRole('button', { name: /Action log/ }));
    expect(screen.getByTestId('recovery-route')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe').textContent).toBe('/recovery');
  });

  it('"Archive →" link navigates to the canonical /closeout route', async () => {
    const user = userEvent.setup();
    render(<TestRoutes />);
    await user.click(screen.getByRole('button', { name: /Archive/ }));
    expect(screen.getByTestId('closeout-route')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe').textContent).toBe('/closeout');
  });

  it('titles the page "Settings — <tab>" (UX-Q08 partial)', () => {
    render(<TestRoutes />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Settings — Requests');
  });
});
