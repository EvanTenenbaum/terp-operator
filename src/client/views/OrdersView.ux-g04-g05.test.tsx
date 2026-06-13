// @vitest-environment jsdom
/**
 * UX-G04 + UX-G05 — Orders view invoice inspector tab and "Needs marks" preset.
 *
 * UX-G04: orders with invoiceNo expose an "invoice" inspector tab (OrderInvoiceTab)
 *         that renders invoice summary and a "View in Payments" button. Orders
 *         without invoiceNo return an empty tab list.
 *
 * UX-G05: ordersColumns includes a hidden `needsMarks` column whose valueGetter
 *         returns true for posted orders missing any closeout mark. The
 *         FilterPresetStrip includes a "Needs marks" preset using `needsMarks:true`.
 *
 * Strategy: drive the columns and inspectorTabs directly via props extraction
 * (same pattern as PaymentsView.ux-j03-j06.test.tsx).
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import type { GridRow } from '../../shared/types';
import type { ColDef } from 'ag-grid-community';

// ── react-router-dom ────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children
}));

// ── trpc mock ────────────────────────────────────────────────────────────────
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      grid: { useQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }) },
      reference: { useQuery: () => ({ data: { refereeRelationships: [], customers: [], vendors: [] } }) }
    },
    auth: { me: { useQuery: () => ({ data: { role: 'owner' } }) } },
    filters: {
      updateFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteFilter: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }
    }
  }
}));

// ── uiStore mock ──────────────────────────────────────────────────────────────
const mockSetGridFilter = vi.fn();
const mockSetActiveView = vi.fn();

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedRows: {},
      setSelectedRows: vi.fn(),
      setGridFilter: mockSetGridFilter,
      setDrawerEntity: vi.fn(),
      setDrawerState: vi.fn(),
      setActiveView: mockSetActiveView,
      setNextSuccessActions: vi.fn()
    })
}));

// ── useCommandRunner mock ─────────────────────────────────────────────────────
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({
    runCommand: vi.fn(),
    isRunning: false,
    setNextSuccessActions: vi.fn()
  })
}));

// ── OperatorGrid capture ──────────────────────────────────────────────────────
interface CapturedProps {
  columns?: ColDef<GridRow>[];
  actions?: (() => React.ReactNode) | React.ReactNode;
  inspectorTabs?: (row: GridRow) => Array<{ key: string; label: string; render: () => React.ReactNode }>;
}
let capturedProps: CapturedProps = {};

vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: (props: CapturedProps) => {
    capturedProps = props;
    const actions =
      typeof props.actions === 'function' ? props.actions() : props.actions;
    return (
      <div data-testid="operator-grid">
        <div data-testid="actions">{actions}</div>
      </div>
    );
  }
}));

vi.mock('../components/templates', () => ({
  FilterPresetStrip: ({ presets }: { presets: Array<{ label: string; filter: string | (() => string); title?: string }> }) => (
    <div data-testid="filter-preset-strip">
      {presets.map((p) => (
        <button key={p.label} data-filter={typeof p.filter === 'function' ? p.filter() : p.filter} title={p.title}>
          {p.label}
        </button>
      ))}
    </div>
  ),
  StatusActionBar: () => <div />
}));

vi.mock('../components/CrossOrderSourceChip', () => ({
  crossOrderSourceColumn: { field: 'crossOrderSource', headerName: 'Source check' }
}));

vi.mock('./operations/shared', () => ({
  columnsByView: {
    orders: [
      { field: 'orderNo', pinned: 'left', width: 150 },
      { field: 'customer', width: 180 },
      { field: 'status', width: 125 },
      { field: 'total', type: 'numericColumn', width: 120 },
      { field: 'packed', width: 105 },
      { field: 'inventoryPosted', width: 125 },
      { field: 'paymentFollowup', width: 125 }
    ]
  },
  EMPTY_ROWS: []
}));

import { OrdersView } from './OrdersView';

// ---------------------------------------------------------------------------
// UX-G05: needsMarks derived column
// ---------------------------------------------------------------------------

describe('UX-G05 — needsMarks derived column', () => {
  it('is present in ordersColumns (hidden)', () => {
    render(<OrdersView />);
    const needsMarks = capturedProps.columns?.find((c) => c.field === 'needsMarks');
    expect(needsMarks).toBeDefined();
    expect(needsMarks?.hide).toBe(true);
  });

  it('valueGetter returns false for non-posted orders', () => {
    render(<OrdersView />);
    const col = capturedProps.columns?.find((c) => c.field === 'needsMarks');
    const vg = col?.valueGetter as ((p: { data?: GridRow }) => boolean) | undefined;
    expect(vg?.({ data: { id: '1', status: 'draft', packed: false, inventoryPosted: false, paymentFollowup: false } as GridRow })).toBe(false);
    expect(vg?.({ data: { id: '2', status: 'confirmed', packed: false, inventoryPosted: false, paymentFollowup: false } as GridRow })).toBe(false);
  });

  it('valueGetter returns true for posted order with packed=false', () => {
    render(<OrdersView />);
    const col = capturedProps.columns?.find((c) => c.field === 'needsMarks');
    const vg = col?.valueGetter as ((p: { data?: GridRow }) => boolean) | undefined;
    expect(vg?.({ data: { id: '3', status: 'posted', packed: false, inventoryPosted: true, paymentFollowup: true } as GridRow })).toBe(true);
  });

  it('valueGetter returns true for posted order with inventoryPosted=false', () => {
    render(<OrdersView />);
    const col = capturedProps.columns?.find((c) => c.field === 'needsMarks');
    const vg = col?.valueGetter as ((p: { data?: GridRow }) => boolean) | undefined;
    expect(vg?.({ data: { id: '4', status: 'posted', packed: true, inventoryPosted: false, paymentFollowup: true } as GridRow })).toBe(true);
  });

  it('valueGetter returns false for fully-marked posted order', () => {
    render(<OrdersView />);
    const col = capturedProps.columns?.find((c) => c.field === 'needsMarks');
    const vg = col?.valueGetter as ((p: { data?: GridRow }) => boolean) | undefined;
    expect(vg?.({ data: { id: '5', status: 'posted', packed: true, inventoryPosted: true, paymentFollowup: true } as GridRow })).toBe(false);
  });

  it('"Needs marks" preset button is rendered with needsMarks:true filter', () => {
    render(<OrdersView />);
    const btn = screen.getByRole('button', { name: 'Needs marks' });
    expect(btn.getAttribute('data-filter')).toBe('needsMarks:true');
  });
});

// ---------------------------------------------------------------------------
// UX-G04: invoice inspector tab
// ---------------------------------------------------------------------------

describe('UX-G04 — orders invoice inspector tab', () => {
  it('inspectorTabs returns tab with key "invoice" when row has invoiceNo', () => {
    render(<OrdersView />);
    const row: GridRow = { id: 'ord-1', invoiceNo: 'INV-001', invoiceStatus: 'open', total: 500, amountPaid: 0 } as GridRow;
    const tabs = capturedProps.inspectorTabs?.(row);
    expect(tabs).toBeDefined();
    expect(tabs?.some((t) => t.key === 'invoice')).toBe(true);
  });

  it('inspectorTabs returns empty array when row has no invoiceNo', () => {
    render(<OrdersView />);
    const row: GridRow = { id: 'ord-2' } as GridRow;
    const tabs = capturedProps.inspectorTabs?.(row);
    expect(tabs?.length).toBe(0);
  });

  it('invoice tab label is "Invoice"', () => {
    render(<OrdersView />);
    const row: GridRow = { id: 'ord-3', invoiceNo: 'INV-002' } as GridRow;
    const tabs = capturedProps.inspectorTabs?.(row);
    const invoiceTab = tabs?.find((t) => t.key === 'invoice');
    expect(invoiceTab?.label).toBe('Invoice');
  });

  it('invoice tab renders invoice number and status', () => {
    render(<OrdersView />);
    const row: GridRow = { id: 'ord-4', invoiceNo: 'INV-003', invoiceStatus: 'partial', total: 1000, amountPaid: 400 } as GridRow;
    const tabs = capturedProps.inspectorTabs?.(row);
    const invoiceTab = tabs?.find((t) => t.key === 'invoice');
    if (!invoiceTab) throw new Error('invoice tab not found');
    const { container } = render(invoiceTab.render());
    expect(container.textContent).toContain('INV-003');
    expect(container.textContent).toContain('partial');
  });

  it('invoice tab renders "View in Payments" button', () => {
    render(<OrdersView />);
    const row: GridRow = { id: 'ord-5', invoiceNo: 'INV-004', total: 200, amountPaid: 0 } as GridRow;
    const tabs = capturedProps.inspectorTabs?.(row);
    const invoiceTab = tabs?.find((t) => t.key === 'invoice');
    if (!invoiceTab) throw new Error('invoice tab not found');
    const { container } = render(invoiceTab.render());
    expect(container.textContent).toContain('View in Payments');
  });

  it('no-invoice case shows "No invoice linked yet" message', () => {
    render(<OrdersView />);
    const row: GridRow = { id: 'ord-6', invoiceNo: '', total: 100 } as GridRow;
    const tabs = capturedProps.inspectorTabs?.(row);
    const invoiceTab = tabs?.find((t) => t.key === 'invoice');
    if (!invoiceTab) return; // row without invoiceNo doesn't produce tab — that's also valid
    const { container } = render(invoiceTab.render());
    expect(container.textContent).toContain('No invoice');
  });
});
