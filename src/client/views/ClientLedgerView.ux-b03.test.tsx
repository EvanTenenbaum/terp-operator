// @vitest-environment jsdom
/**
 * UX-B03 — ClientLedgerView: contact link + "Link contact" inline action.
 *
 * Spec:
 *  (1) Name cell links to /contacts/:id when contactId is present.
 *  (2) Name cell renders a "Link contact" button when contactId is absent.
 *  (3) "Link contact" action dispatches linkContactToExistingEntity command.
 *  (4) "Link contact" is not rendered when contactId is present.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData, columnDefs }: { rowData: unknown[]; columnDefs: Array<{ cellRenderer?: (p: unknown) => ReactNode; field?: string }> }) => {
    // Render cell renderers for the 'name' column so we can assert on them.
    const nameCol = columnDefs?.find((col) => col.field === 'name');
    if (!nameCol?.cellRenderer) return <div data-testid="ag-grid-stub" />;
    return (
      <div data-testid="ag-grid-stub">
        {(rowData as Array<Record<string, unknown>>)?.map((row) => (
          <div key={String(row.id)} data-testid={`row-${String(row.id)}`}>
            {nameCol.cellRenderer?.({ data: row, value: row.name })}
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
  useCommandRunner: () => ({ runCommand: mockRunCommand, isRunning: false }),
}));

const ROWS_WITH_CONTACT = [
  { id: 'c-1', name: 'Acme Corp', balance: 5000, creditLimit: 10000, contactId: 'con-1', customerId: 'c-1' },
];
const ROWS_NO_CONTACT = [
  { id: 'c-2', name: 'Beta Ltd', balance: 2000, creditLimit: 5000, contactId: null, customerId: 'c-2' },
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
      // GridJourney uses trpc.queries.grid.useQuery({ view }) to load rows.
      if (prop === 'grid') {
        return {
          useQuery: () => makeQuery([...ROWS_WITH_CONTACT, ...ROWS_NO_CONTACT]),
          useMutation: () => noopMutation,
        };
      }
      if (prop === 'matchmakingSettings') return { useQuery: () => makeQuery({ showClientsColumn: false }) };
      if (prop === 'matchmakingEntityCounts') return { useQuery: () => makeQuery({ customers: {}, vendors: {} }) };
      if (prop === 'me') return { useQuery: () => makeQuery({ id: 'u1', role: 'operator', name: 'op', email: 'op@x' }) };
      if (prop === 'contacts') return { useQuery: () => makeQuery([{ id: 'con-99', name: 'New Contact' }]) };
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

import { ClientLedgerView } from './ClientLedgerView';

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

describe('UX-B03 ClientLedgerView — contact link', () => {
  it('renders a button that navigates to /contacts/:contactId when contactId is present', () => {
    render(<Wrap><ClientLedgerView /></Wrap>);
    const link = screen.getByRole('button', { name: 'Acme Corp' });
    fireEvent.click(link);
    expect(mockNavigate).toHaveBeenCalledWith('/contacts/con-1');
  });

  it('does NOT render a Link contact button when contactId is present', () => {
    render(<Wrap><ClientLedgerView /></Wrap>);
    // There must be no "Link contact" button in the Acme Corp row
    const acmeRow = screen.getByTestId('row-c-1');
    expect(acmeRow.textContent).not.toMatch(/link contact/i);
  });

  it('renders a "Link contact" action button when contactId is absent', () => {
    render(<Wrap><ClientLedgerView /></Wrap>);
    const linkBtn = screen.getByRole('button', { name: /link contact/i });
    expect(linkBtn).toBeDefined();
  });

  it('"Link contact" dispatches linkContactToExistingEntity for a customer row', () => {
    render(<Wrap><ClientLedgerView /></Wrap>);
    const linkBtn = screen.getByRole('button', { name: /link contact/i });
    fireEvent.click(linkBtn);
    // The command is dispatched (dialog may gate actual execution, but button fires)
    // With no dialog in test env the inline dispatch path runs
    expect(mockRunCommand).toHaveBeenCalledWith(
      'linkContactToExistingEntity',
      expect.objectContaining({ entityType: 'customer', entityId: 'c-2' }),
      expect.any(String)
    );
  });
});
