import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { GridRow } from '../../../shared/types';

/**
 * Template: status-aware primary action + secondary tray.
 *
 * Implements the design spec's Placement Law (§1.4 principle 1, §10 decision
 * tables): every surface shows ONE green primary for the selected rows'
 * status, with all remaining verbs collapsed into a "More ▾" tray. This
 * replaces the "6-sibling-button cockpit" (friction point #1) without losing
 * access to any command — every verb either is the primary or lives in the
 * tray for its status, and a catch-all rule can expose the full verb set for
 * unknown/mixed states.
 *
 * Usage: build a `StatusActionTable` inside the view (rules close over view
 * state such as runCommand and form inputs) and render `<StatusActionBar>`
 * through OperatorGrid's `selectionActions` slot so it appears in the
 * SelectionSummary context strip (spec §1.4 principle 5).
 */

export interface StatusAction {
  key: string;
  label: string;
  icon?: ReactNode;
  run: (rows: GridRow[]) => unknown | Promise<unknown>;
  disabled?: boolean;
  disabledReason?: string;
  /** 'warning' renders the primary in the amber attention style. */
  tone?: 'normal' | 'warning';
}

export interface StatusActionRule {
  /**
   * Rule matches when EVERY selected row satisfies `when`:
   *  - string / string[]: row[statusField] equals (one of) the value(s)
   *  - predicate: arbitrary row test (e.g. posted && !packed)
   */
  when: string | string[] | ((row: GridRow) => boolean);
  /** Omit or null for "no primary in this state" (terminal statuses). */
  primary?: StatusAction | null;
  tray?: StatusAction[];
}

export interface StatusActionTable {
  /** Row field compared against string rules. Default: 'status'. */
  statusField?: string;
  /** Evaluated top-down; first rule where all rows match wins. */
  rules: StatusActionRule[];
  /** Reason chip when selection spans rules. Default per spec §10. */
  mixedReason?: string;
}

export interface ResolvedStatusActions {
  primary: StatusAction | null;
  tray: StatusAction[];
  /** Populated instead of actions when the selection is mixed/unmatched. */
  reason: string | null;
}

function rowMatches(row: GridRow, when: StatusActionRule['when'], statusField: string): boolean {
  if (typeof when === 'function') return when(row);
  const status = String(row[statusField] ?? '');
  return Array.isArray(when) ? when.includes(status) : status === when;
}

export function resolveStatusActions(rows: GridRow[], table: StatusActionTable): ResolvedStatusActions {
  if (!rows.length) return { primary: null, tray: [], reason: null };
  const statusField = table.statusField ?? 'status';
  for (const rule of table.rules) {
    if (rows.every((row) => rowMatches(row, rule.when, statusField))) {
      return { primary: rule.primary ?? null, tray: rule.tray ?? [], reason: null };
    }
  }
  return { primary: null, tray: [], reason: table.mixedReason ?? 'Select rows of same status' };
}

export interface StatusActionBarProps {
  rows: GridRow[];
  table: StatusActionTable;
  /** Disables everything while a command is in flight. */
  busy?: boolean;
}

export function StatusActionBar({ rows, table, busy }: StatusActionBarProps) {
  const { primary, tray, reason } = resolveStatusActions(rows, table);
  const [trayOpen, setTrayOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside (capture-phase pointerdown, excluding the trigger button to
  // avoid the double-toggle race — pattern from GH #326 / ColumnsMenu).
  useEffect(() => {
    if (!trayOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setTrayOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [trayOpen]);

  // Close the tray whenever the resolved state changes shape.
  useEffect(() => {
    setTrayOpen(false);
  }, [rows, reason, primary?.key]);

  if (!rows.length) return null;

  if (reason) {
    return (
      <span className="selection-pill" data-status-action-reason>
        {reason}
      </span>
    );
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setTrayOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? []
    );
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'ArrowDown'
        ? items[(index + 1) % items.length]
        : items[(index - 1 + items.length) % items.length];
    next?.focus();
  }

  return (
    <>
      {primary ? (
        <button
          type="button"
          className={primary.tone === 'warning' ? 'secondary-button compact-action border-amber text-amber' : 'primary-button compact-action'}
          disabled={busy || primary.disabled}
          title={primary.disabled ? primary.disabledReason : undefined}
          onClick={() => primary.run(rows)}
        >
          {primary.icon}
          {primary.label}
        </button>
      ) : null}
      {tray.length ? (
        <div className="quick-action-menu">
          <button
            ref={triggerRef}
            type="button"
            className="secondary-button compact-action"
            aria-haspopup="menu"
            aria-expanded={trayOpen}
            aria-controls={menuId}
            onClick={() => setTrayOpen((open) => !open)}
          >
            More
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {trayOpen ? (
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="More actions"
              className="quick-action-popover right-0 left-auto"
              onKeyDown={onMenuKeyDown}
            >
              {tray.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  role="menuitem"
                  className="quick-action-item"
                  disabled={busy || action.disabled}
                  title={action.disabled ? action.disabledReason : undefined}
                  onClick={async () => {
                    setTrayOpen(false);
                    await action.run(rows);
                  }}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
