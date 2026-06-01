// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      contactDirectory: { useQuery: vi.fn() },
    },
  },
}));

import { trpc } from '../../api/trpc';
import { MobileContactsView } from './MobileContactsView';

const mockDir = trpc.queries.contactDirectory.useQuery as ReturnType<typeof vi.fn>;

const CONTACTS = [
  { id: 'c1', name: 'Acme Corp', displayName: null, companyName: 'Acme Corp Ltd', isCustomer: true, isVendor: false, isReferee: false, isProcessor: false, isContractor: false, isEmployee: false, customerBalance: 14500, vendorOpenBills: 0 },
  { id: 'c2', name: 'Blue River Farm', displayName: null, companyName: null, isCustomer: false, isVendor: true, isReferee: false, isProcessor: false, isContractor: false, isEmployee: false, customerBalance: 0, vendorOpenBills: 3200 },
  { id: 'c3', name: 'Carl Employee', displayName: null, companyName: null, isCustomer: false, isVendor: false, isReferee: false, isProcessor: false, isContractor: false, isEmployee: true, customerBalance: 0, vendorOpenBills: 0 },
];

beforeEach(() => {
  navigateMock.mockClear();
  mockDir.mockReturnValue({ data: { rows: CONTACTS, nextCursor: null }, isLoading: false });
});

function renderView() {
  return render(<MemoryRouter><MobileContactsView /></MemoryRouter>);
}

describe('MobileContactsView', () => {
  it('renders all contact names', () => {
    renderView();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Blue River Farm')).toBeInTheDocument();
    expect(screen.getByText('Carl Employee')).toBeInTheDocument();
  });

  it('filters contacts by search text', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Blue' } });
    expect(screen.getByText('Blue River Farm')).toBeInTheDocument();
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });

  it('filters contacts by Customer role chip', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('Blue River Farm')).not.toBeInTheDocument();
  });

  it('filters contacts by Vendor role chip', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Vendor' }));
    expect(screen.getByText('Blue River Farm')).toBeInTheDocument();
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });

  it('shows empty state when no contacts match', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzznomatch' } });
    expect(screen.getByText(/no contacts match/i)).toBeInTheDocument();
  });

  it('navigates to profile when a contact card is clicked', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /acme corp/i }));
    expect(navigateMock).toHaveBeenCalledWith('/mobile/contacts/c1');
  });

  it('shows loading skeletons while data loads', () => {
    mockDir.mockReturnValue({ data: undefined, isLoading: true });
    renderView();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('shows count line', () => {
    renderView();
    expect(screen.getByText(/showing 3 contacts/i)).toBeInTheDocument();
  });
});
