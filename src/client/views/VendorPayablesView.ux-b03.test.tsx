// @vitest-environment jsdom
/**
 * UX-B03 — VendorPayablesView: contact link + "Link contact" inline action.
 *
 * Spec:
 *  (1) Vendor name cell links to /contacts/:id when contactId is present.
 *  (2) Vendor name cell renders a "Link contact" button when contactId is absent.
 *  (3) "Link contact" dispatches linkContactToExistingEntity for vendor entityType.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs }: { rowData: unknown[]; columnDefs: Array<{ cellRenderer?: (p: unknown) => ReactNode; field?: string }> }) => {
    const vendorCol = columnDefs?.find((col) => col.field === 'vendor');
    if (!vendorCol?.cellRenderer) return <div data-testid="ag-grid-stub" />;
    return (
      <div data-testid="ag-grid-stub">
        {(rowData as Array<Record<string, unknown>>)?.map((row) => (
          <div key={String(row.id)} data-testid={`row-${String(row.id)}`}>
            {vendorCol.cellRenderer?.({ data: row, value: row.vendor })}
          </div>
        ))}
      </div>
    );
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockRunCommand = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({
    runCommand: mockRunCommand,
    isRunning: false,
    setNextSuccessActions: vi.fn(),
  }),
}));

const mockConfirm = vi.fn().mockResolvedValue(false);
vi.mock('../hooks/useConfirm', () => ({ useConfirm: () => mockConfirm }));

const ROWS = [
  {
    id: 'b-1', vendor: 'ACME Supply', vendorId: 'v-1', billNo: 'B001',
    amount: 1000, amountPaid: 0, status: 'open', dueDate: null,
    contactId: 'con-1',
  },
  {
    id: 'b-2', vendor: 'Beta Farms', vendorId: 'v-2', billNo: 'B002',
    amount: 500, amountPaid: 0, status: 'open', dueDate: null,
    contactId: null,
  },
];

vi.mock('../api/trpc', () => {
  const noopMutation = {
    mutate: vi.fn(), mutateAsync: async () => ({}),
    isLoading: false, isPending: false, isError: false, isSuccess: false,
    reset: () => {}, data: undefined, error: null,
  };
  const makeQuery = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
  const procProxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      // VendorPayablesView uses GridJourney which calls trpc.queries.grid.useQuery({ view })
      if (prop === 'grid') return { useQuery: () => makeQuery(ROWS), useMutation: () => noopMutation };
      if (prop === 'matchmakingSettings') return { useQuery: () => makeQuery({ showVendorsColumn: false }) };
      if (prop === 'matchmakingEntityCounts') return { useQuery: () => makeQuery({ customers: {}, vendors: {} }) };
      if (prop === 'me') return { useQuery: () => makeQuery({ id: 'u1', role: 'operator', name: 'op', email: 'op@x' }) };
      if (prop === 'reference') return { useQuery: () => makeQuery({ vendors: [], commands: [] }) };
      if (prop === 'vendorPayments') return { useQuery: () => makeQuery([]) };
      if (prop === 'contacts') return { useQuery: () => makeQuery([]) };
      return { useQuery: () => makeQuery(undefined), useMutation: () => noopMutation };
    },
  });
  return {
    trpc: {
      auth: { me: { useQuery: () => makeQuery({ id: 'u1', role: 'operator', name: 'op', email: 'op@x' }) } },
      queries: procProxy,
      commands: procProxy,
      useContext: () => ({ auth: { me: { invalidate: () => {} } } }),
    },
  };
});

import { VendorPayablesView } from './VendorPayablesView';

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockRunCommand.mockClear();
});

describe('UX-B03 VendorPayablesView — contact link', () => {
  it('renders a button that navigates to /contacts/:contactId when contactId is present', () => {
    render(<Wrap><VendorPayablesView /></Wrap>);
    const link = screen.getByRole('button', { name: 'ACME Supply' });
    fireEvent.click(link);
    expect(mockNavigate).toHaveBeenCalledWith('/contacts/con-1');
  });

  it('does NOT render a Link contact button when contactId is present on vendor row', () => {
    render(<Wrap><VendorPayablesView /></Wrap>);
    const acmeRow = screen.getByTestId('row-b-1');
    expect(acmeRow.textContent).not.toMatch(/link contact/i);
  });

  it('renders a "Link contact" action button when vendor has no contactId', () => {
    render(<Wrap><VendorPayablesView /></Wrap>);
    const linkBtn = screen.getByRole('button', { name: /link contact/i });
    expect(linkBtn).toBeDefined();
  });

  it('"Link contact" dispatches linkContactToExistingEntity with entityType=vendor', () => {
    render(<Wrap><VendorPayablesView /></Wrap>);
    const linkBtn = screen.getByRole('button', { name: /link contact/i });
    fireEvent.click(linkBtn);
    expect(mockRunCommand).toHaveBeenCalledWith(
      'linkContactToExistingEntity',
      expect.objectContaining({ entityType: 'vendor', entityId: 'v-2' }),
      expect.any(String)
    );
  });
});
