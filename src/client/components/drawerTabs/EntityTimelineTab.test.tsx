// @vitest-environment jsdom
/**
 * EntityTimelineTab — UX-U01 (UX-N01 / UX-N02) tests.
 *
 * N01: the ContextDrawer Timeline tab renders the merged chronological event
 * list (icon/label, timestamp, actor, deep link where a target exists), with
 * loading / empty / error states.
 *
 * N02: on order timelines, "Copy status summary (customer-safe)" writes a
 * status story to the clipboard that NEVER contains cost/margin/internal
 * notes — even when those fields are present on the selected row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock
}));

// Controllable trpc stub.
interface QueryState {
  data?: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}
let queryState: QueryState = { data: { events: [], nextOffset: null }, isLoading: false, isError: false, refetch: vi.fn() };
let lastQueryInput: unknown = null;
let lastQueryOpts: unknown = null;
vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      entityTimeline: {
        useQuery: (input: unknown, opts?: unknown) => {
          lastQueryInput = input;
          lastQueryOpts = opts;
          return queryState;
        }
      }
    }
  }
}));

// Minimal uiStore stub — selector-style hook over a fixed action set.
const setGridFilter = vi.fn();
const setDrawerEntity = vi.fn();
const setDrawerState = vi.fn();
const setActiveView = vi.fn();
const pushToast = vi.fn();
vi.mock('../../store/uiStore', () => ({
  useUiStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ setGridFilter, setDrawerEntity, setDrawerState, setActiveView, pushToast })
}));

import { EntityTimelineTab } from './EntityTimelineTab';

const ORDER_ID = '33333333-3333-3333-3333-333333333333';

function makeEvents() {
  return [
    {
      id: 'allocation:a1',
      eventType: 'allocation',
      label: 'Payment applied to INV-9',
      actor: null,
      status: null,
      amount: '250.00',
      refNo: 'INV-9',
      targetType: 'order',
      targetId: 'order-1',
      occurredAt: '2026-06-05T10:00:00Z'
    },
    {
      id: 'command:c1',
      eventType: 'command',
      label: 'postSalesOrder',
      actor: 'Op One',
      status: 'ok',
      amount: null,
      refNo: null,
      targetType: null,
      targetId: null,
      occurredAt: '2026-06-03T10:00:00Z'
    }
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  queryState = { data: { events: [], nextOffset: null }, isLoading: false, isError: false, refetch: vi.fn() };
  lastQueryInput = null;
  lastQueryOpts = null;
});

describe('EntityTimelineTab — states', () => {
  it('renders a select prompt (query disabled) when no entityId', () => {
    render(<EntityTimelineTab entityType="customer" entityId={null} />);
    expect(screen.getByText('Select a row to view its timeline.')).toBeInTheDocument();
    expect((lastQueryOpts as { enabled: boolean }).enabled).toBe(false);
  });

  it('renders loading state', () => {
    queryState = { isLoading: true, isError: false, refetch: vi.fn() };
    render(<EntityTimelineTab entityType="order" entityId={ORDER_ID} />);
    expect(screen.getByText('Loading timeline…')).toBeInTheDocument();
  });

  it('renders error state with a working Retry', () => {
    const refetch = vi.fn();
    queryState = { isLoading: false, isError: true, refetch };
    render(<EntityTimelineTab entityType="order" entityId={ORDER_ID} />);
    expect(screen.getByText('Timeline failed to load.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders empty state when there are no events', () => {
    render(<EntityTimelineTab entityType="order" entityId={ORDER_ID} />);
    expect(screen.getByText('No events recorded for this entity yet.')).toBeInTheDocument();
  });

  it('passes the entityType + capped limit to the query', () => {
    render(<EntityTimelineTab entityType="lot" entityId={ORDER_ID} />);
    expect(lastQueryInput).toMatchObject({ entityType: 'lot', entityId: ORDER_ID, limit: 50, offset: 0 });
  });
});

describe('EntityTimelineTab — events (UX-N01)', () => {
  it('renders event labels, actor, status, and humanized command labels', () => {
    queryState = { data: { events: makeEvents(), nextOffset: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<EntityTimelineTab entityType="order" entityId={ORDER_ID} />);
    expect(screen.getByText('Payment applied to INV-9')).toBeInTheDocument();
    expect(screen.getByText('Op One')).toBeInTheDocument();
    // Command names are humanized via the shared commandCatalog — the raw
    // camelCase name must not render.
    expect(screen.queryByText('postSalesOrder')).not.toBeInTheDocument();
  });

  it('deep-links events with a target through the grid filter + drawer pattern', () => {
    queryState = { data: { events: makeEvents(), nextOffset: null }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<EntityTimelineTab entityType="customer" entityId={ORDER_ID} />);
    const openButtons = screen.getAllByRole('button', { name: /^Open / });
    expect(openButtons).toHaveLength(1); // command event has no target
    fireEvent.click(openButtons[0]);
    expect(setGridFilter).toHaveBeenCalledWith('orders', 'id:order-1');
    expect(setDrawerEntity).toHaveBeenCalledWith('orders', 'order', 'order-1');
    expect(setDrawerState).toHaveBeenCalledWith('orders', 'standard');
    expect(setActiveView).toHaveBeenCalledWith('orders');
    expect(navigateMock).toHaveBeenCalledWith('/orders');
  });
});

describe('EntityTimelineTab — copy status summary (UX-N02)', () => {
  it('shows the copy action only on order timelines', () => {
    render(<EntityTimelineTab entityType="customer" entityId={ORDER_ID} />);
    expect(screen.queryByRole('button', { name: /Copy status summary/ })).not.toBeInTheDocument();
  });

  it('copies a customer-safe summary — forbidden fields never appear even when present on the row', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    queryState = { data: { events: makeEvents(), nextOffset: null }, isLoading: false, isError: false, refetch: vi.fn() };
    const row = {
      id: ORDER_ID,
      orderNo: 'SO-2002',
      status: 'posted' as const,
      total: '1000',
      deliveryWindow: 'Friday',
      unitCost: 'SECRET_COST_777',
      internalMargin: 'SECRET_MARGIN_888',
      notes: 'SECRET_NOTE_111',
      belowFloorReason: 'SECRET_FLOOR_444'
    };
    render(<EntityTimelineTab entityType="order" entityId={ORDER_ID} row={row} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy status summary \(customer-safe\)/ }));
    expect(writeText).toHaveBeenCalledOnce();
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('SO-2002 — posted');
    expect(text).toContain('Order total: $1,000.00');
    expect(text).toContain('Delivery window: Friday');
    expect(text).toContain('Payment applied to INV-9');
    for (const sentinel of ['SECRET_COST_777', 'SECRET_MARGIN_888', 'SECRET_NOTE_111', 'SECRET_FLOOR_444']) {
      expect(text).not.toContain(sentinel);
    }
    expect(text).not.toMatch(/cost|margin/i);
    expect(pushToast).toHaveBeenCalledWith(
      'Copied customer-safe status — cost, margin, and internal notes excluded.',
      'success'
    );
  });
});
