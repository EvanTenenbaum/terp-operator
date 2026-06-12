import type { ViewKey } from '../../shared/types';

/**
 * UX-T07 — single source of truth for every keyboard shortcut in the app.
 *
 * Consumed by:
 *  - Hotkeys.tsx — derives its nav bindings from the Navigation entries and
 *    pins every other handled combo via requireShortcut() (throws at import
 *    time if a binding has no registry row).
 *  - ShortcutsOverlay.tsx (UX-C01) — the '?' help overlay renders this list
 *    grouped by scope.
 *  - Shell.tsx (UX-S02/B02) — SideNav hotkey badges + aria-keyshortcuts are
 *    looked up here instead of hardcoded per nav item.
 *
 * Adding a binding anywhere else without a row here fails the registry-sync
 * test (registry.sync.test.tsx) — keep this file and the handlers together.
 *
 * NOTE on combos: the intake batch hotkeys require ⌘ in the handler (they sit
 * behind Hotkeys' `if (!event.metaKey) return;` gate), so they are registered
 * as ⌘⌥⇧R / ⌘⌥I — the audit's "⌥⇧R / ⌥I" shorthand under-reported the real
 * bindings. The registry records what the code actually handles.
 */

export type ShortcutScope =
  | 'Navigation'
  | 'Palette & search'
  | 'Context drawer'
  | 'Workspace & actions'
  | 'Intake'
  | 'Sales'
  | 'System'
  | 'Help';

/** Display + a11y order for the overlay's scope groups. */
export const SHORTCUT_SCOPE_ORDER: readonly ShortcutScope[] = [
  'Navigation',
  'Palette & search',
  'Context drawer',
  'Workspace & actions',
  'Intake',
  'Sales',
  'System',
  'Help'
];

export interface ShortcutDef {
  /** Stable id — referenced by Hotkeys/Shell, never shown to operators. */
  id: string;
  /** Display combo using Mac glyphs, e.g. '⌘⇧F'. */
  combo: string;
  /**
   * ARIA `aria-keyshortcuts` token for the bound control,
   * e.g. 'Meta+Shift+F'. See the `target` hint for where it belongs.
   */
  ariaKeyshortcuts: string;
  scope: ShortcutScope;
  description: string;
  /** Hint: which control(s) should carry the aria-keyshortcuts attribute. */
  target?: string;
  /** Navigation entries only: the lane the combo activates. */
  view?: ViewKey;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  // ── Navigation (⌘1–⌘6 — assignments kept as-is; per-loop maps are tracked
  //    separately under UX-B02 and are out of scope for this wave) ──────────
  { id: 'nav.dashboard', combo: '⌘1', ariaKeyshortcuts: 'Meta+1', scope: 'Navigation', description: 'Go to Dashboard', target: 'SideNav item [data-testid="sidenav-item-dashboard"]', view: 'dashboard' },
  { id: 'nav.intake', combo: '⌘2', ariaKeyshortcuts: 'Meta+2', scope: 'Navigation', description: 'Go to Intake', target: 'SideNav item [data-testid="sidenav-item-intake"]', view: 'intake' },
  { id: 'nav.sales', combo: '⌘3', ariaKeyshortcuts: 'Meta+3', scope: 'Navigation', description: 'Go to Sales', target: 'SideNav item [data-testid="sidenav-item-sales"]', view: 'sales' },
  { id: 'nav.payments', combo: '⌘4', ariaKeyshortcuts: 'Meta+4', scope: 'Navigation', description: 'Go to Payments', target: 'SideNav item [data-testid="sidenav-item-payments"]', view: 'payments' },
  { id: 'nav.inventory', combo: '⌘5', ariaKeyshortcuts: 'Meta+5', scope: 'Navigation', description: 'Go to Inventory', target: 'SideNav item [data-testid="sidenav-item-inventory"]', view: 'inventory' },
  { id: 'nav.clients', combo: '⌘6', ariaKeyshortcuts: 'Meta+6', scope: 'Navigation', description: 'Go to Client Balances', target: 'SideNav item [data-testid="sidenav-item-clients"]', view: 'clients' },

  // ── Palette & search ─────────────────────────────────────────────────────
  { id: 'palette.commands', combo: '⌘K', ariaKeyshortcuts: 'Meta+K', scope: 'Palette & search', description: 'Open the command palette (Commands tab)', target: 'Keel search button' },
  { id: 'palette.entities', combo: '⌘⇧F', ariaKeyshortcuts: 'Meta+Shift+F', scope: 'Palette & search', description: 'Open entity search (Entities tab)', target: 'Keel search button' },
  { id: 'palette.advanced', combo: '⌘⌥K', ariaKeyshortcuts: 'Meta+Alt+K', scope: 'Palette & search', description: 'Open the advanced palette (typed payload runner)' },
  { id: 'grid.quickFilter', combo: '/', ariaKeyshortcuts: '/', scope: 'Palette & search', description: 'Focus the active grid quick filter', target: 'OperatorGrid input [data-grid-quick-filter]' },

  // ── Context drawer ──────────────────────────────────────────────────────
  { id: 'drawer.toggle', combo: ']', ariaKeyshortcuts: ']', scope: 'Context drawer', description: 'Open or close the context drawer' },
  { id: 'drawer.cycleWidth', combo: '⇧]', ariaKeyshortcuts: 'Shift+]', scope: 'Context drawer', description: 'Cycle drawer width (standard → wide → focus)' },
  // UX-C08: drawer-tab number keys — bound only while the drawer is open.
  { id: 'drawer.tabs', combo: '1–5', ariaKeyshortcuts: '1', scope: 'Context drawer', description: 'Switch drawer tab 1–5 (while the drawer is open)', target: 'ContextDrawer tab buttons — tab N carries aria-keyshortcuts="N"' },

  // ── Workspace & actions ─────────────────────────────────────────────────
  { id: 'workspace.focusMode', combo: 'F', ariaKeyshortcuts: 'F', scope: 'Workspace & actions', description: 'Toggle focus mode for the active panel' },
  { id: 'action.commitPrimary', combo: '⌘↵', ariaKeyshortcuts: 'Meta+Enter', scope: 'Workspace & actions', description: 'Commit the visible primary action for the current selection', target: 'StatusActionBar primary button [data-status-action-primary]' },
  { id: 'workspace.escape', combo: 'Esc', ariaKeyshortcuts: 'Escape', scope: 'Workspace & actions', description: 'Close the shortcuts overlay, drawer, palette, or focus mode (in that order)' },

  // ── Intake (UX-C09 — apply only on the Intake lane with rows selected) ──
  { id: 'intake.duplicate', combo: '⌘D', ariaKeyshortcuts: 'Meta+D', scope: 'Intake', description: 'Duplicate the selected intake rows into their PO group' },
  { id: 'intake.markReady', combo: '⌘⌥⇧R', ariaKeyshortcuts: 'Meta+Alt+Shift+R', scope: 'Intake', description: 'Mark the selected intake rows Ready' },
  { id: 'intake.process', combo: '⌘⌥I', ariaKeyshortcuts: 'Meta+Alt+I', scope: 'Intake', description: 'Process intake — post a purchase receipt for the selected rows' },

  // ── Sales ───────────────────────────────────────────────────────────────
  // UX-F10: margin visibility toggle (uiStore.showMargin, persisted per #63).
  { id: 'sales.toggleMargin', combo: '⌥M', ariaKeyshortcuts: 'Alt+M', scope: 'Sales', description: 'Show or hide margin & cost columns in the Sales workspace', target: 'SalesView margin eye toggle' },

  // ── System ──────────────────────────────────────────────────────────────
  { id: 'system.healthCheck', combo: '⌘⌥H', ariaKeyshortcuts: 'Meta+Alt+H', scope: 'System', description: 'Run a live server health check' },
  { id: 'system.validateAll', combo: '⌘⌥V', ariaKeyshortcuts: 'Meta+Alt+V', scope: 'System', description: 'Validate All — refetch the active view’s grid from the server' },

  // ── Help ────────────────────────────────────────────────────────────────
  { id: 'help.shortcuts', combo: '?', ariaKeyshortcuts: 'Shift+/', scope: 'Help', description: 'Show or hide this keyboard shortcuts overlay' }
];

/**
 * Look up a registry entry by id; throws if missing so a binding referencing
 * a deleted/renamed row fails loudly at module import, not silently at runtime.
 */
export function requireShortcut(id: string): ShortcutDef {
  const def = SHORTCUTS.find((shortcut) => shortcut.id === id);
  if (!def) {
    throw new Error(`Shortcut "${id}" is not in the shortcuts registry (src/client/shortcuts/registry.ts).`);
  }
  return def;
}

/** All Navigation-scope entries (⌘1–⌘6), in registry order. */
export function navShortcuts(): ShortcutDef[] {
  return SHORTCUTS.filter((shortcut) => shortcut.scope === 'Navigation');
}

/** The nav shortcut bound to a lane, if any — used by SideNav badges (UX-B02). */
export function navShortcutForView(view: ViewKey): ShortcutDef | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.scope === 'Navigation' && shortcut.view === view);
}

/** Registry grouped by scope in display order — feeds the '?' overlay (UX-C01). */
export function shortcutsByScope(): Array<{ scope: ShortcutScope; shortcuts: ShortcutDef[] }> {
  return SHORTCUT_SCOPE_ORDER.map((scope) => ({
    scope,
    shortcuts: SHORTCUTS.filter((shortcut) => shortcut.scope === scope)
  })).filter((group) => group.shortcuts.length > 0);
}
