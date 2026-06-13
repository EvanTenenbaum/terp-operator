// @vitest-environment jsdom
/**
 * UX-A12 / UX-A13 — palette entity deep-links target canonical homes
 *
 * Connector requests: Settings → Requests is the canonical home while the
 * standalone /connectors lane is flagged off (TER-1664 / UX-A12).
 * Command-journal rows: /recovery is the canonical Action Log home — the
 * Settings "Action log" tab is now a redirect (UX-A13), so the palette must
 * select rows and open the drawer under the 'recovery' ViewKey (not
 * 'settings') and navigate the router there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));
vi.mock('../api/trpc', () => {
  const empty = () => ({ data: undefined, isLoading: false, isFetching: false });
  const groups = {
    commands: [{ id: 'cmd-1', type: 'command', label: 'reverseCommandById run', detail: 'failed' }],
    connectors: [{ id: 'conn-1', type: 'connector', label: 'Inbound request', detail: 'open' }]
  };
  return {
    trpc: {
      auth: { me: { useQuery: () => ({ data: { id: 'u-1', role: 'owner', email: 'op@example.test', name: 'Op', workLoop: null } }) } },
      queries: {
        reference: { useQuery: () => ({ data: { commands: [] }, isLoading: false }) },
        globalSearch: { useQuery: () => ({ data: { groups }, isLoading: false, isFetching: false }) },
        anythingElse: { useQuery: empty }
      }
    }
  };
});

import { CommandPalette } from './CommandPalette';
import { useUiStore } from '../store/uiStore';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function Harness() {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <LocationProbe />
      <CommandPalette />
      <Routes>
        <Route path="dashboard" element={<div data-testid="dashboard-route" />} />
        <Route path="recovery" element={<div data-testid="recovery-route" />} />
        <Route path="settings" element={<div data-testid="settings-route" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useUiStore.setState({
    commandPaletteOpen: true,
    commandPaletteTab: 'commands',
    commandPaletteAdvancedOpen: false,
    activeView: 'dashboard',
    activeSettingsTab: 'pricing',
    selectedRows: {},
    activeDrawerEntityByView: {},
    drawerByView: {}
  });
});

describe('CommandPalette canonical deep-links — UX-A12 / UX-A13', () => {
  it('command rows deep-link to /recovery with selection + drawer keyed to the recovery view', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /reverseCommandById run/ }));

    const state = useUiStore.getState();
    expect(screen.getByTestId('location-probe').textContent).toBe('/recovery');
    expect(state.activeView).toBe('recovery');
    expect(state.selectedRows.recovery?.[0]?.id).toBe('cmd-1');
    // Drawer entity keyed under 'recovery' (not 'settings') — the UX-A13 fix.
    expect(state.activeDrawerEntityByView.recovery?.entityType).toBe('recovery');
    expect(state.activeDrawerEntityByView.recovery?.entityId).toBe('cmd-1');
    expect(state.activeDrawerEntityByView.settings).toBeUndefined();
    expect(state.commandPaletteOpen).toBe(false);
  });

  it('connector rows deep-link to /settings with the Requests tab targeted', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /Inbound request/ }));

    const state = useUiStore.getState();
    expect(screen.getByTestId('location-probe').textContent).toBe('/settings');
    expect(state.activeView).toBe('settings');
    expect(state.activeSettingsTab).toBe('requests');
    expect(state.selectedRows.connectors?.[0]?.id).toBe('conn-1');
    expect(state.commandPaletteOpen).toBe(false);
  });
});
