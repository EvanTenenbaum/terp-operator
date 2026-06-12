// @vitest-environment jsdom
/**
 * UX-T07 — shortcuts registry is the single source of truth.
 *
 * Proves the registry and the Hotkeys handler cannot drift:
 *  - Hotkeys exports HOTKEYS_HANDLED_SHORTCUT_IDS, built via requireShortcut()
 *    (throws at import if a binding lacks a registry row).
 *  - This test asserts the handled-id list and the registry are a bijection:
 *    a registry row nobody handles, or a handled combo nobody registered,
 *    both fail here.
 *  - Field hygiene: unique ids/combos, non-empty descriptions and
 *    aria-keyshortcuts tokens, nav entries carry their lane.
 */
import { describe, it, expect, vi } from 'vitest';
import { SHORTCUTS, navShortcuts, navShortcutForView, requireShortcut, shortcutsByScope, SHORTCUT_SCOPE_ORDER } from './registry';

// Hotkeys imports the tRPC client + command runner — stub them so importing
// the module is side-effect free in this unit test.
vi.mock('../api/trpc', () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: null }) } },
    useUtils: () => ({})
  }
}));
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false })
}));

import { HOTKEYS_HANDLED_SHORTCUT_IDS } from '../components/Hotkeys';

describe('UX-T07 — shortcuts registry ↔ Hotkeys sync', () => {
  it('every registry row is handled and every handled combo has a registry row (bijection)', () => {
    const registryIds = SHORTCUTS.map((shortcut) => shortcut.id).sort();
    const handledIds = [...HOTKEYS_HANDLED_SHORTCUT_IDS].sort();
    expect(handledIds).toEqual(registryIds);
  });

  it('ids and display combos are unique', () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
    const combos = SHORTCUTS.map((shortcut) => shortcut.combo);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('every entry carries combo, scope, description, and an aria-keyshortcuts token', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.combo.length, shortcut.id).toBeGreaterThan(0);
      expect(shortcut.description.length, shortcut.id).toBeGreaterThan(0);
      expect(shortcut.ariaKeyshortcuts.length, shortcut.id).toBeGreaterThan(0);
      expect(SHORTCUT_SCOPE_ORDER).toContain(shortcut.scope);
    }
  });

  it('the six ⌘1–⌘6 nav bindings are registered with their lanes (assignments kept as-is per UX-B02)', () => {
    const nav = navShortcuts();
    expect(nav.map((shortcut) => [shortcut.combo, shortcut.view])).toEqual([
      ['⌘1', 'dashboard'],
      ['⌘2', 'intake'],
      ['⌘3', 'sales'],
      ['⌘4', 'payments'],
      ['⌘5', 'inventory'],
      ['⌘6', 'clients']
    ]);
    // Each nav entry names the SideNav control that should carry aria-keyshortcuts.
    for (const shortcut of nav) {
      expect(shortcut.target).toContain(`sidenav-item-${shortcut.view}`);
    }
  });

  it('covers every binding family the audit enumerated (palette, drawer, drawer tabs, intake, system, ⌘↵, /, Escape, ?, ⌥M)', () => {
    const byId = Object.fromEntries(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.combo]));
    expect(byId['palette.commands']).toBe('⌘K');
    expect(byId['palette.entities']).toBe('⌘⇧F');
    expect(byId['palette.advanced']).toBe('⌘⌥K');
    expect(byId['drawer.toggle']).toBe(']');
    expect(byId['drawer.cycleWidth']).toBe('⇧]');
    expect(byId['drawer.tabs']).toBe('1–5'); // UX-C08
    expect(byId['intake.duplicate']).toBe('⌘D'); // UX-C09
    expect(byId['intake.markReady']).toBe('⌘⌥⇧R'); // UX-C09 (code requires ⌘ — registry records reality)
    expect(byId['intake.process']).toBe('⌘⌥I'); // UX-C09
    expect(byId['system.healthCheck']).toBe('⌘⌥H');
    expect(byId['system.validateAll']).toBe('⌘⌥V');
    expect(byId['action.commitPrimary']).toBe('⌘↵');
    expect(byId['grid.quickFilter']).toBe('/');
    expect(byId['workspace.focusMode']).toBe('F');
    expect(byId['workspace.escape']).toBe('Esc');
    expect(byId['help.shortcuts']).toBe('?'); // UX-C01
    expect(byId['sales.toggleMargin']).toBe('⌥M'); // UX-F10
  });

  it('requireShortcut throws on unknown ids so stale references fail at import', () => {
    expect(() => requireShortcut('nav.dashboard')).not.toThrow();
    expect(() => requireShortcut('does.not.exist')).toThrow(/not in the shortcuts registry/);
  });

  it('navShortcutForView resolves bound lanes and returns undefined for unbound ones', () => {
    expect(navShortcutForView('dashboard')?.ariaKeyshortcuts).toBe('Meta+1');
    expect(navShortcutForView('fulfillment')).toBeUndefined();
    expect(navShortcutForView('reports')).toBeUndefined();
  });

  it('shortcutsByScope groups every entry exactly once, in display order', () => {
    const groups = shortcutsByScope();
    const flattened = groups.flatMap((group) => group.shortcuts.map((shortcut) => shortcut.id));
    expect(flattened.sort()).toEqual(SHORTCUTS.map((shortcut) => shortcut.id).sort());
    const scopes = groups.map((group) => group.scope);
    expect(scopes).toEqual(SHORTCUT_SCOPE_ORDER.filter((scope) => scopes.includes(scope)));
  });
});
