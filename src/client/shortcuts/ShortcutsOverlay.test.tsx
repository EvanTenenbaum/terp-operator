// @vitest-environment jsdom
/**
 * UX-C01 — '?' shortcuts overlay: generated from the registry, grouped by
 * scope, dismissible (Esc / backdrop click / close button), focus-trapped,
 * and carrying the repo's dialog a11y contract (role="dialog",
 * aria-modal="true", aria-labelledby → <h2>, close button aria-label).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useUiStore } from '../store/uiStore';
import { SHORTCUTS, shortcutsByScope } from './registry';
import { ShortcutsOverlay } from './ShortcutsOverlay';

beforeEach(() => {
  useUiStore.setState({ shortcutsOverlayOpen: false, toasts: [] });
});

function openOverlay() {
  useUiStore.getState().setShortcutsOverlayOpen(true);
}

describe('UX-C01 — ShortcutsOverlay', () => {
  it('renders nothing while closed', () => {
    render(<ShortcutsOverlay />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('meets the repo dialog a11y contract when open', () => {
    openOverlay();
    render(<ShortcutsOverlay />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy as string);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toBe('Keyboard shortcuts');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('lists EVERY registry binding with its combo, grouped by scope', () => {
    openOverlay();
    render(<ShortcutsOverlay />);
    const dialog = screen.getByRole('dialog');
    for (const shortcut of SHORTCUTS) {
      expect(dialog.textContent).toContain(shortcut.description);
    }
    const kbdTexts = Array.from(dialog.querySelectorAll('kbd')).map((node) => node.textContent);
    for (const shortcut of SHORTCUTS) {
      expect(kbdTexts).toContain(shortcut.combo);
    }
    // One labelled section per non-empty scope group, in registry order.
    const sections = Array.from(dialog.querySelectorAll('section'));
    for (const group of shortcutsByScope()) {
      const section = sections.find((node) => node.getAttribute('aria-label') === group.scope);
      expect(section, group.scope).toBeDefined();
      expect(section!.querySelectorAll('li').length).toBe(group.shortcuts.length);
    }
  });

  it('closes on the close button and returns store state to closed', () => {
    openOverlay();
    render(<ShortcutsOverlay />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useUiStore.getState().shortcutsOverlayOpen).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on backdrop click but not on clicks inside the dialog', () => {
    openOverlay();
    render(<ShortcutsOverlay />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(useUiStore.getState().shortcutsOverlayOpen).toBe(true);
    fireEvent.click(screen.getByTestId('shortcuts-overlay-backdrop'));
    expect(useUiStore.getState().shortcutsOverlayOpen).toBe(false);
  });

  it('closes on Escape pressed inside the dialog (focus-trap path)', () => {
    openOverlay();
    render(<ShortcutsOverlay />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });
    expect(useUiStore.getState().shortcutsOverlayOpen).toBe(false);
  });

  it('traps focus: moves focus into the dialog on open and restores it on close', async () => {
    const { rerender } = render(
      <>
        <button type="button">outside control</button>
        <ShortcutsOverlay />
      </>
    );
    const outside = screen.getByRole('button', { name: 'outside control' });
    outside.focus();
    expect(document.activeElement).toBe(outside);

    openOverlay();
    rerender(
      <>
        <button type="button">outside control</button>
        <ShortcutsOverlay />
      </>
    );
    // useFocusTrap focuses the first focusable element on a timeout.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' })));

    // Tab from the last focusable element wraps back to the first.
    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    );
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);

    // Closing restores focus to the previously focused control.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    rerender(
      <>
        <button type="button">outside control</button>
        <ShortcutsOverlay />
      </>
    );
    await waitFor(() => expect(document.activeElement).toBe(outside));
  });
});
