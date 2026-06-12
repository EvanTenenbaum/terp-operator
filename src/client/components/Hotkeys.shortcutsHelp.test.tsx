// @vitest-environment jsdom
/**
 * UX-C01 / UX-F10 — global key bindings added with the shortcuts registry:
 *  - '?' (Shift+/ outside text fields) toggles the shortcuts overlay, which
 *    Hotkeys itself mounts; Escape closes the overlay BEFORE the palette or
 *    drawer underneath it.
 *  - ⌥M toggles uiStore.showMargin with a truthful toast, skipped while
 *    typing, and also matches code:KeyM (Mac ⌥M emits key 'µ').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useUiStore } from '../store/uiStore';

const h = vi.hoisted(() => ({ runCommand: vi.fn() }));

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({
          data: { id: 'u-1', name: 'Op', email: 'op@example.test', role: 'owner', workLoop: null }
        })
      }
    },
    useUtils: () => ({
      client: { auth: { me: { query: vi.fn() } } },
      queries: { invalidate: vi.fn(), grid: { invalidate: vi.fn() }, intakeQueue: { invalidate: vi.fn() } }
    })
  }
}));

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: h.runCommand, isRunning: false })
}));

import { Hotkeys } from './Hotkeys';

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.setState({
    activeView: 'sales',
    selectedRows: {},
    commandPaletteOpen: false,
    shortcutsOverlayOpen: false,
    showMargin: true,
    toasts: [],
    focusedPanelId: null,
    focusMode: false,
    activeDrawerEntityByView: {},
    drawerByView: {}
  });
});

describe("UX-C01 — '?' opens the shortcuts overlay", () => {
  it('opens the overlay (Hotkeys mounts it) and a second ? closes it', () => {
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    expect(useUiStore.getState().shortcutsOverlayOpen).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    expect(useUiStore.getState().shortcutsOverlayOpen).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not open while typing in a text field', () => {
    render(
      <>
        <Hotkeys />
        <input aria-label="Notes" />
      </>
    );
    const input = screen.getByLabelText('Notes');
    input.focus();
    fireEvent.keyDown(input, { key: '?', shiftKey: true });
    expect(useUiStore.getState().shortcutsOverlayOpen).toBe(false);
  });

  it('Escape closes the overlay FIRST, leaving the palette underneath open', () => {
    useUiStore.setState({ commandPaletteOpen: true, shortcutsOverlayOpen: true });
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useUiStore.getState().shortcutsOverlayOpen).toBe(false);
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });
});

describe('UX-F10 — ⌥M toggles margin visibility with a truthful toast', () => {
  it('hides margin and toasts the truthful consequence', () => {
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'm', altKey: true });
    expect(useUiStore.getState().showMargin).toBe(false);
    expect(
      useUiStore.getState().toasts.some(
        (toast) => toast.message === 'Margin hidden — cost & margin columns are hidden in the Sales workspace.'
      )
    ).toBe(true);
  });

  it('toggles back on with the matching shown toast', () => {
    useUiStore.setState({ showMargin: false });
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'm', altKey: true });
    expect(useUiStore.getState().showMargin).toBe(true);
    expect(
      useUiStore.getState().toasts.some(
        (toast) => toast.message === 'Margin shown — cost & margin columns are visible in the Sales workspace.'
      )
    ).toBe(true);
  });

  it('matches code KeyM so Mac hardware (⌥M → key "µ") still toggles', () => {
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'µ', code: 'KeyM', altKey: true });
    expect(useUiStore.getState().showMargin).toBe(false);
  });

  it('does nothing while typing, with ⌘ held, or without ⌥', () => {
    render(
      <>
        <Hotkeys />
        <input aria-label="Notes" />
      </>
    );
    const input = screen.getByLabelText('Notes');
    input.focus();
    fireEvent.keyDown(input, { key: 'm', altKey: true });
    expect(useUiStore.getState().showMargin).toBe(true);

    fireEvent.keyDown(document.body, { key: 'm', altKey: true, metaKey: true });
    expect(useUiStore.getState().showMargin).toBe(true);

    fireEvent.keyDown(document.body, { key: 'm' });
    expect(useUiStore.getState().showMargin).toBe(true);
  });
});
