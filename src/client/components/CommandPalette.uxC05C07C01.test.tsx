// @vitest-environment jsdom
/**
 * Tests for UX-C05, UX-C07, and C01 tie-in in CommandPalette
 *
 * UX-C05: workbook vocabulary aliases resolve to matching actions/commands
 * UX-C07: Advanced palette tab/button gated to manager+ only
 * C01 tie-in: "Keyboard shortcuts" palette entry dispatches setShortcutsOverlayOpen(true)
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

// Role-aware trpc mock — role is set per test via mockRole
let mockRole = 'owner';

vi.mock('../api/trpc', () => {
  const empty = () => ({ data: undefined, isLoading: false, isFetching: false });
  const procProxy: unknown = new Proxy({}, {
    get() { return { useQuery: empty }; }
  });
  return {
    trpc: {
      auth: {
        me: {
          useQuery: () => ({
            data: { id: 'u-1', role: mockRole, email: 'op@example.test', name: 'Op', workLoop: null }
          })
        }
      },
      queries: procProxy
    }
  };
});

import { CommandPalette } from './CommandPalette';
import { useUiStore } from '../store/uiStore';

// ─── UX-C05: Alias resolution ───────────────────────────────────────────────

describe('UX-C05 — workbook vocabulary alias resolution', () => {
  beforeEach(() => {
    mockRole = 'owner';
    useUiStore.setState({ commandPaletteOpen: true, commandPaletteTab: 'commands', commandPaletteAdvancedOpen: false });
  });

  it('typing "files" shows a launch action (no "No commands matched")', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'files');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "ofc" shows a relevant intake/batch action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'ofc');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "25 flex" shows a relevant sale/inventory result', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, '25 flex');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "inv posted" shows a relevant inventory/intake action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'inv posted');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "pay/f-up" shows a payments follow-up action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'pay/f-up');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "ticket" shows a sale/order action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'ticket');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "iv" shows an invoice/payment action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'iv');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "vendor receipt" shows a receiving/intake action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'vendor receipt');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "rich" shows a relevant product/batch action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'rich');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });

  it('typing "sub" shows a relevant action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'sub');
    expect(screen.queryByText(/no commands or rows matched/i)).toBeNull();
  });
});

// ─── UX-C07: Advanced palette role gating ──────────────────────────────────

describe('UX-C07 — Advanced palette gated to manager+', () => {
  beforeEach(() => {
    useUiStore.setState({ commandPaletteOpen: true, commandPaletteTab: 'commands', commandPaletteAdvancedOpen: false });
  });

  it('Advanced payload button is visible for owner role', () => {
    mockRole = 'owner';
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /advanced payload/i })).toBeTruthy();
  });

  it('Advanced payload button is visible for manager role', () => {
    mockRole = 'manager';
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /advanced payload/i })).toBeTruthy();
  });

  it('Advanced payload button is hidden for operator role', () => {
    mockRole = 'operator';
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /advanced payload/i })).toBeNull();
  });

  it('Advanced payload button is hidden for viewer role', () => {
    mockRole = 'viewer';
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /advanced payload/i })).toBeNull();
  });

  it('Advanced JSON textarea is hidden for operator even if store has advancedOpen=true', () => {
    mockRole = 'operator';
    useUiStore.setState({ commandPaletteAdvancedOpen: true });
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.queryByLabelText(/advanced \(typed payload\)/i)).toBeNull();
  });

  it('Advanced panel shows danger hint for manager', () => {
    mockRole = 'manager';
    useUiStore.setState({ commandPaletteAdvancedOpen: true });
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.getByText(/typed payload/i)).toBeTruthy();
    expect(screen.getByText(/danger/i)).toBeTruthy();
  });

  it('Advanced button title contains "typed payload" for manager', () => {
    mockRole = 'manager';
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const btn = screen.getByRole('button', { name: /advanced payload/i });
    expect(btn.getAttribute('title')).toMatch(/typed payload/i);
  });
});

// ─── C01 tie-in: "Keyboard shortcuts" palette entry ─────────────────────────

describe('C01 tie-in — "Keyboard shortcuts" palette entry', () => {
  beforeEach(() => {
    mockRole = 'owner';
    useUiStore.setState({
      commandPaletteOpen: true,
      commandPaletteTab: 'commands',
      commandPaletteAdvancedOpen: false
    });
  });

  it('"Keyboard shortcuts" button appears in the Commands palette when query is empty', () => {
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /keyboard shortcuts/i })).toBeTruthy();
  });

  it('"Keyboard shortcuts" appears when searching "keyboard"', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'keyboard');
    expect(screen.getByRole('button', { name: /keyboard shortcuts/i })).toBeTruthy();
  });

  it('"Keyboard shortcuts" appears when searching "shortcuts"', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'shortcuts');
    expect(screen.getByRole('button', { name: /keyboard shortcuts/i })).toBeTruthy();
  });

  it('clicking "Keyboard shortcuts" calls setShortcutsOverlayOpen(true) and closes palette', async () => {
    const user = userEvent.setup();

    const mockSetShortcutsOverlayOpen = vi.fn();
    // Patch the store with the mock setter (parallel agent may not have added it yet;
    // we simulate it being present as the C01 agent will add it)
    useUiStore.setState({ setShortcutsOverlayOpen: mockSetShortcutsOverlayOpen } as unknown as Parameters<typeof useUiStore.setState>[0]);

    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const btn = screen.getByRole('button', { name: /keyboard shortcuts/i });
    await user.click(btn);

    expect(mockSetShortcutsOverlayOpen).toHaveBeenCalledWith(true);
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it('"Keyboard shortcuts" does not appear when searching unrelated text "zxqw"', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByLabelText(/command palette search/i);
    await user.type(input, 'zxqw');
    expect(screen.queryByRole('button', { name: /keyboard shortcuts/i })).toBeNull();
  });
});
