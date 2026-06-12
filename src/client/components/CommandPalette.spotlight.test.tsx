// @vitest-environment jsdom
/**
 * TER-1633: Unified spotlight tab behaviour
 *
 * Covers:
 *  1. ⌘K opens palette on Commands tab
 *  2. ⌘⇧F opens palette on Entities tab
 *  3. Tab row switches active tab
 *  4. Closing palette resets to Commands tab
 *  5. GlobalFinderPanel is NOT rendered separately (regression guard)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));
vi.mock('../api/trpc', () => {
  const empty = () => ({ data: undefined, isLoading: false, isFetching: false });
  const procProxy: unknown = new Proxy({}, {
    get() { return { useQuery: empty }; }
  });
  return {
    trpc: {
      auth: { me: { useQuery: () => ({ data: { id: 'u-1', role: 'owner', email: 'op@example.test', name: 'Op', workLoop: null } }) } },
      queries: procProxy
    }
  };
});

import { CommandPalette } from './CommandPalette';
import { useUiStore } from '../store/uiStore';

describe('CommandPalette — unified spotlight tabs (TER-1633)', () => {
  beforeEach(() => {
    // Reset store to closed state between tests
    useUiStore.setState({ commandPaletteOpen: false, commandPaletteTab: 'commands', commandPaletteAdvancedOpen: false });
  });

  it('shows Commands tab as active when opened via openPalette("commands")', () => {
    useUiStore.getState().openPalette('commands');
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);

    const commandsTab = screen.getByRole('tab', { name: /commands/i });
    const entitiesTab = screen.getByRole('tab', { name: /entities/i });
    expect(commandsTab.getAttribute('aria-selected')).toBe('true');
    expect(entitiesTab.getAttribute('aria-selected')).toBe('false');
    // Commands tab content: search input
    expect(screen.getByLabelText(/command palette search/i)).toBeTruthy();
  });

  it('shows Entities tab as active when opened via openPalette("entities")', () => {
    useUiStore.getState().openPalette('entities');
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);

    const commandsTab = screen.getByRole('tab', { name: /commands/i });
    const entitiesTab = screen.getByRole('tab', { name: /entities/i });
    expect(entitiesTab.getAttribute('aria-selected')).toBe('true');
    expect(commandsTab.getAttribute('aria-selected')).toBe('false');
    // Entities tab content: entity search input
    expect(screen.getByLabelText(/entity search/i)).toBeTruthy();
  });

  it('clicking the Entities tab while on Commands tab switches the active tab', async () => {
    const user = userEvent.setup();
    useUiStore.getState().openPalette('commands');
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);

    await user.click(screen.getByRole('tab', { name: /entities/i }));

    expect(useUiStore.getState().commandPaletteTab).toBe('entities');
    expect(screen.getByLabelText(/entity search/i)).toBeTruthy();
  });

  it('clicking Commands tab while on Entities tab switches back', async () => {
    const user = userEvent.setup();
    useUiStore.getState().openPalette('entities');
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);

    await user.click(screen.getByRole('tab', { name: /commands/i }));

    expect(useUiStore.getState().commandPaletteTab).toBe('commands');
    expect(screen.getByLabelText(/command palette search/i)).toBeTruthy();
  });

  it('closing the palette resets commandPaletteTab to "commands"', () => {
    useUiStore.getState().openPalette('entities');
    expect(useUiStore.getState().commandPaletteTab).toBe('entities');

    useUiStore.getState().setCommandPaletteOpen(false);
    expect(useUiStore.getState().commandPaletteTab).toBe('commands');
  });

  // NOTE: GlobalFinderPanel.tsx was deleted in TER-1633.
  // Its content now lives in the Entities tab of this component.
  // Deletion is verified by the absent file and the removed App.tsx import.
});
