// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      contactProfile:  { useQuery: vi.fn() },
      relatedCommands: { useQuery: vi.fn() },
    },
  },
}));

import { trpc } from '../../api/trpc';
import { MobileContactProfileView } from './MobileContactProfileView';

const mockProfile  = trpc.queries.contactProfile.useQuery  as ReturnType<typeof vi.fn>;
const mockCommands = trpc.queries.relatedCommands.useQuery as ReturnType<typeof vi.fn>;

const PROFILE = {
  contact: {
    id: 'c1', name: 'Acme Corp', display_name: null,
    company_name: 'Acme Corp Ltd', phone: '555-1234', email: 'acme@example.com',
    address: '123 Main St', notes: 'Long-term customer',
    is_customer: true, is_vendor: false, is_referee: false,
    is_processor: false, is_contractor: false, is_employee: false,
    tags: null,
  },
  customer: { id: 'cu1', balance: 14500, credit_limit: 25000 },
  vendor: null, referee: null, processor: null, user: null,
  upcomingAppointmentCount: 0,
};

const COMMANDS = [
  { id: 'cmd1', commandName: 'logPayment', actorName: 'Maya R.', createdAt: new Date('2026-05-30').toISOString(), toast: 'Payment received $5,200' },
];

beforeEach(() => {
  mockProfile.mockReturnValue({ data: PROFILE, isLoading: false });
  mockCommands.mockReturnValue({ data: COMMANDS });
});

function renderView(id = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/mobile/contacts/${id}`]}>
      <Routes>
        <Route path="/mobile/contacts/:id" element={<MobileContactProfileView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MobileContactProfileView', () => {
  it('renders contact name', () => {
    renderView();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders company name', () => {
    renderView();
    expect(screen.getByText('Acme Corp Ltd')).toBeInTheDocument();
  });

  it('renders phone and email as plain text (no links)', () => {
    renderView();
    expect(screen.getByText('555-1234')).toBeInTheDocument();
    expect(screen.getByText('acme@example.com')).toBeInTheDocument();
    // No tel: or mailto: links
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows Customer badge', () => {
    renderView();
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('shows customer balance and credit limit', () => {
    renderView();
    expect(screen.getByText(/\$14,500/)).toBeInTheDocument();
    expect(screen.getByText(/\$25,000/)).toBeInTheDocument();
  });

  it('shows command history entries', () => {
    renderView();
    expect(screen.getByText('logPayment')).toBeInTheDocument();
    expect(screen.getByText('Maya R.')).toBeInTheDocument();
    expect(screen.getByText(/payment received/i)).toBeInTheDocument();
  });

  it('shows empty history state when no commands', () => {
    mockCommands.mockReturnValue({ data: [] });
    renderView();
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockProfile.mockReturnValue({ data: undefined, isLoading: true });
    renderView();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows not found state when no profile data', () => {
    mockProfile.mockReturnValue({ data: null, isLoading: false });
    renderView();
    expect(screen.getByText(/contact not found/i)).toBeInTheDocument();
  });
});
