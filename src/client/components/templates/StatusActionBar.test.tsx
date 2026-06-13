// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GridRow } from '../../../shared/types';
import { StatusActionBar, resolveStatusActions, type StatusActionTable } from './StatusActionBar';

function makeTable(overrides?: Partial<StatusActionTable>): StatusActionTable {
  return {
    rules: [
      {
        when: 'draft',
        primary: { key: 'confirm', label: 'Confirm', run: vi.fn() },
        tray: [
          { key: 'reprice', label: 'Reprice', run: vi.fn() },
          { key: 'cancel', label: 'Cancel order', run: vi.fn() }
        ]
      },
      {
        when: (row: GridRow) => row.status === 'posted' && row.packed !== true,
        primary: { key: 'mark-packed', label: 'Mark packed', run: vi.fn() },
        tray: []
      },
      { when: 'fulfilled', primary: null, tray: [{ key: 'pick', label: 'Pick list', run: vi.fn() }] }
    ],
    ...overrides
  };
}

describe('resolveStatusActions (templates)', () => {
  it('returns nothing for empty selection', () => {
    const resolved = resolveStatusActions([], makeTable());
    expect(resolved.primary).toBeNull();
    expect(resolved.tray).toHaveLength(0);
    expect(resolved.reason).toBeNull();
  });

  it('matches the first rule where every row satisfies the predicate', () => {
    const rows = [{ id: '1', status: 'draft' }, { id: '2', status: 'draft' }] as GridRow[];
    const resolved = resolveStatusActions(rows, makeTable());
    expect(resolved.primary?.label).toBe('Confirm');
    expect(resolved.tray.map((a) => a.key)).toEqual(['reprice', 'cancel']);
  });

  it('supports predicate rules over compound row state', () => {
    const rows = [{ id: '1', status: 'posted', packed: false }] as GridRow[];
    const resolved = resolveStatusActions(rows, makeTable());
    expect(resolved.primary?.label).toBe('Mark packed');
  });

  it('returns the mixed-selection reason when rows span rules (spec §10 mixed status)', () => {
    const rows = [{ id: '1', status: 'draft' }, { id: '2', status: 'fulfilled' }] as GridRow[];
    const resolved = resolveStatusActions(rows, makeTable());
    expect(resolved.primary).toBeNull();
    expect(resolved.reason).toBe('Select rows of same status');
  });

  it('a catch-all rule keeps all verbs reachable for unknown statuses', () => {
    const table = makeTable();
    table.rules.push({ when: () => true, primary: null, tray: [{ key: 'everything', label: 'Everything', run: vi.fn() }] });
    const rows = [{ id: '1', status: 'mystery' }] as unknown as GridRow[];
    const resolved = resolveStatusActions(rows, table);
    expect(resolved.reason).toBeNull();
    expect(resolved.tray[0].key).toBe('everything');
  });
});

describe('StatusActionBar (templates)', () => {
  it('renders the status-matched primary and runs it with the selection', () => {
    const table = makeTable();
    const rows = [{ id: '1', status: 'draft' }] as GridRow[];
    render(<StatusActionBar rows={rows} table={table} />);
    const primary = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(primary);
    expect(table.rules[0].primary!.run).toHaveBeenCalledWith(rows);
  });

  it('collapses secondary verbs into an accessible More menu', () => {
    const table = makeTable();
    const rows = [{ id: '1', status: 'draft' }] as GridRow[];
    render(<StatusActionBar rows={rows} table={table} />);
    const trigger = screen.getByRole('button', { name: /more/i });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(menu).toBeTruthy();
    const item = screen.getByRole('menuitem', { name: 'Reprice' });
    fireEvent.click(item);
    expect(table.rules[0].tray![0].run).toHaveBeenCalledWith(rows);
  });

  it('shows the disabled reason pill for mixed selections instead of actions', () => {
    const rows = [{ id: '1', status: 'draft' }, { id: '2', status: 'fulfilled' }] as GridRow[];
    render(<StatusActionBar rows={rows} table={makeTable()} />);
    expect(screen.getByText('Select rows of same status')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('disables actions while a command is running', () => {
    const rows = [{ id: '1', status: 'draft' }] as GridRow[];
    render(<StatusActionBar rows={rows} table={makeTable()} busy />);
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders only the tray when a status has no primary (terminal states)', () => {
    const rows = [{ id: '1', status: 'fulfilled' }] as GridRow[];
    render(<StatusActionBar rows={rows} table={makeTable()} />);
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.getByRole('button', { name: /more/i })).toBeTruthy();
  });
});
