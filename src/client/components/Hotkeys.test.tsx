// @vitest-environment jsdom
/**
 * UX-A01 / UX-A02 / UX-A03 / UX-A07 — Hotkeys wired to real behavior.
 *
 * Covers:
 *  - ⌘⌥H runs a real server health check (uncached auth.me round-trip) and
 *    toasts pass (success) or fail (error) based on the actual result.
 *  - ⌘⌥V genuinely invalidates the active view's grid query (scoped via tRPC
 *    utils) and toasts only after the refetch settles, truthfully.
 *  - ⌘↵ commits the visible StatusActionBar primary for the FULL selection
 *    (same decision-table resolution the bar renders), toasts the disabled
 *    reason when the primary is unavailable, the mixed/unmatched reason when
 *    no rule matches, and guidance when nothing is selected.
 *  - '/' focuses the active OperatorGrid quick-filter input, skipped while
 *    typing in a text control or while the palette is open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import type { GridRow } from '../../shared/types';
import { useUiStore } from '../store/uiStore';
import { StatusActionBar, type StatusActionTable } from './templates/StatusActionBar';

const h = vi.hoisted(() => ({
  meQuery: vi.fn(),
  gridInvalidate: vi.fn(),
  intakeQueueInvalidate: vi.fn(),
  queriesInvalidate: vi.fn(),
  runCommand: vi.fn()
}));

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
      client: { auth: { me: { query: h.meQuery } } },
      queries: {
        invalidate: h.queriesInvalidate,
        grid: { invalidate: h.gridInvalidate },
        intakeQueue: { invalidate: h.intakeQueueInvalidate }
      }
    })
  }
}));

vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: h.runCommand, isRunning: false })
}));

import { Hotkeys } from './Hotkeys';

function toasts() {
  return useUiStore.getState().toasts;
}

function row(id: string, status: string): GridRow {
  return { id, status } as unknown as GridRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.meQuery.mockResolvedValue({ id: 'u-1', name: 'Op', email: 'op@example.test', role: 'owner' });
  h.gridInvalidate.mockResolvedValue(undefined);
  h.intakeQueueInvalidate.mockResolvedValue(undefined);
  h.queriesInvalidate.mockResolvedValue(undefined);
  useUiStore.setState({
    activeView: 'orders',
    selectedRows: {},
    commandPaletteOpen: false,
    toasts: [],
    focusedPanelId: null,
    focusMode: false
  });
});

describe('UX-A01 — ⌘⌥H real health check', () => {
  it('toasts success with the signed-in identity when the server responds', async () => {
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'h', metaKey: true, altKey: true });
    await waitFor(() => expect(h.meQuery).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const toast = toasts().find((t) => t.message.includes('Server reachable'));
      expect(toast?.message).toBe('Server reachable — signed in as Op (op@example.test).');
      expect(toast?.tone).toBe('success');
    });
  });

  it('toasts an error tone when the health check round-trip fails', async () => {
    h.meQuery.mockRejectedValueOnce(new Error('fetch failed'));
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'h', metaKey: true, altKey: true });
    await waitFor(() => {
      const toast = toasts().find((t) => t.message.startsWith('Health check failed'));
      expect(toast?.message).toBe('Health check failed: fetch failed.');
      expect(toast?.tone).toBe('error');
    });
  });

  it('toasts an error when the server responds but the session is gone', async () => {
    h.meQuery.mockResolvedValueOnce(null);
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'h', metaKey: true, altKey: true });
    await waitFor(() => {
      const toast = toasts().find((t) => t.message.includes('no active session'));
      expect(toast?.tone).toBe('error');
    });
  });
});

describe('UX-A02 — ⌘⌥V genuine grid revalidation', () => {
  it('invalidates the active view grid query and toasts only after it settles', async () => {
    let settle: (() => void) | undefined;
    h.gridInvalidate.mockImplementationOnce(
      () => new Promise<void>((resolve) => { settle = resolve; })
    );
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'v', metaKey: true, altKey: true });
    await waitFor(() => expect(h.gridInvalidate).toHaveBeenCalledWith({ view: 'orders' }));
    // Refetch not settled yet — no success toast may exist.
    expect(toasts().some((t) => t.message.startsWith('Validate All:'))).toBe(false);
    settle?.();
    await waitFor(() => {
      const toast = toasts().find((t) => t.message.startsWith('Validate All:'));
      expect(toast?.message).toBe('Validate All: refetched the orders grid from the server.');
      expect(toast?.tone).toBe('success');
    });
  });

  it('on intake also refetches the intake queue', async () => {
    useUiStore.setState({ activeView: 'intake' });
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'v', metaKey: true, altKey: true });
    await waitFor(() => {
      expect(h.gridInvalidate).toHaveBeenCalledWith({ view: 'intake' });
      expect(h.intakeQueueInvalidate).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back to the queries family for views without a grid projection', async () => {
    useUiStore.setState({ activeView: 'dashboard' });
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'v', metaKey: true, altKey: true });
    await waitFor(() => expect(h.queriesInvalidate).toHaveBeenCalledTimes(1));
    expect(h.gridInvalidate).not.toHaveBeenCalled();
  });

  it('toasts an error tone when the refetch fails', async () => {
    h.gridInvalidate.mockRejectedValueOnce(new Error('boom'));
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'v', metaKey: true, altKey: true });
    await waitFor(() => {
      const toast = toasts().find((t) => t.message.startsWith('Validate All failed'));
      expect(toast?.message).toBe('Validate All failed: boom.');
      expect(toast?.tone).toBe('error');
    });
  });
});

describe('UX-A03 — ⌘↵ commits the visible decision-table primary', () => {
  it('commits the primary for EVERY selected row, not just rows[0]', async () => {
    const committed: string[] = [];
    const rows = [row('r1', 'ready'), row('r2', 'ready')];
    const table: StatusActionTable = {
      rules: [
        {
          when: 'ready',
          primary: {
            key: 'post',
            label: 'Post',
            run: (selection) => { for (const r of selection) committed.push(String(r.id)); }
          }
        }
      ]
    };
    useUiStore.setState({ selectedRows: { orders: rows } });
    render(
      <>
        <Hotkeys />
        <StatusActionBar rows={rows} table={table} />
      </>
    );
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(committed).toEqual(['r1', 'r2']));
  });

  it('toasts the disabled reason instead of running a disabled primary', async () => {
    const run = vi.fn();
    const rows = [row('r1', 'ready')];
    const table: StatusActionTable = {
      rules: [
        {
          when: 'ready',
          primary: {
            key: 'post',
            label: 'Post',
            run,
            disabled: true,
            disabledReason: 'Price all lines before posting.'
          }
        }
      ]
    };
    useUiStore.setState({ selectedRows: { orders: rows } });
    render(
      <>
        <Hotkeys />
        <StatusActionBar rows={rows} table={table} />
      </>
    );
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(toasts().some((t) => t.message === 'Price all lines before posting.')).toBe(true)
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('toasts the decision-table reason when the selection matches no rule', async () => {
    const run = vi.fn();
    const rows = [row('r1', 'posted'), row('r2', 'draft')];
    const table: StatusActionTable = {
      mixedReason: 'Select rows of the same status to act on them.',
      rules: [{ when: 'ready', primary: { key: 'post', label: 'Post', run } }]
    };
    useUiStore.setState({ selectedRows: { orders: rows } });
    render(
      <>
        <Hotkeys />
        <StatusActionBar rows={rows} table={table} />
      </>
    );
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(toasts().some((t) => t.message === 'Select rows of the same status to act on them.')).toBe(true)
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('toasts selection guidance when nothing is selected', async () => {
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(
        toasts().some((t) => t.message === 'Select rows first — ⌘↵ commits the primary action for the selection.')
      ).toBe(true)
    );
    expect(h.runCommand).not.toHaveBeenCalled();
  });

  it('no longer fires hardcoded view commands on rows[0]', async () => {
    const rows = [row('r1', 'draft')];
    useUiStore.setState({ activeView: 'sales', selectedRows: { sales: rows } });
    render(<Hotkeys />);
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(toasts().some((t) => t.message === 'No primary action applies to the current selection in this view.')).toBe(true)
    );
    expect(h.runCommand).not.toHaveBeenCalled();
  });
});

describe("UX-A07 — '/' focuses the active grid quick filter", () => {
  it('focuses the quick-filter input on /', () => {
    const { container } = render(
      <>
        <Hotkeys />
        <input data-grid-quick-filter aria-label="Filter grid" defaultValue="" />
      </>
    );
    const input = container.querySelector<HTMLInputElement>('[data-grid-quick-filter]');
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(input);
  });

  it('does nothing while focus is already in a text input', () => {
    const { getByLabelText, container } = render(
      <>
        <Hotkeys />
        <input aria-label="Some other field" />
        <input data-grid-quick-filter aria-label="Filter grid" />
      </>
    );
    const other = getByLabelText('Some other field');
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(container.querySelector('[data-grid-quick-filter]'));
  });

  it('does nothing while the command palette is open', () => {
    useUiStore.setState({ commandPaletteOpen: true });
    const { container } = render(
      <>
        <Hotkeys />
        <input data-grid-quick-filter aria-label="Filter grid" />
      </>
    );
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).not.toBe(container.querySelector('[data-grid-quick-filter]'));
  });
});
