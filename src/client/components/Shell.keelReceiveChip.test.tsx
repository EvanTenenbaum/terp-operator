// @vitest-environment jsdom
// UX-A09 (2026-06-12): Verify the Keel "Receive against PO" chip is renamed
// (was "Receive") and re-pointed to purchaseOrders view (was intake/receiving).
// PO-first intake is official per TER-1658 / Execution Decision 3.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SessionUser } from '../../shared/types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      health: {
        useQuery: () => ({ data: { ok: true }, isLoading: false })
      },
      reference: {
        useQuery: () => ({ data: { customers: [] } })
      }
    },
    auth: {
      logout: {
        useMutation: () => ({ mutate: vi.fn() })
      }
    },
    useContext: () => ({
      auth: { me: { invalidate: vi.fn() } }
    })
  }
}));

import { Keel } from './Shell';

function ownerUser(): SessionUser {
  return { id: 'u-owner', name: 'Owner', email: 'owner@example.test', role: 'owner', workLoop: null };
}

describe('Keel — UX-A09 Receive chip rename + re-point to PO picker', () => {
  it('renders "Receive against PO" label (not the old "Receive" label)', () => {
    render(
      <MemoryRouter>
        <Keel user={ownerUser()} />
      </MemoryRouter>
    );

    // Open the quick-action popover first
    const quickActionsButton = screen.getByRole('button', { name: /quick actions/i });
    fireEvent.click(quickActionsButton);

    // New label must be present
    expect(screen.getByText('Receive against PO')).toBeInTheDocument();
    // Old label must be absent
    expect(screen.queryByRole('menuitem', { name: /^Receive$/ })).toBeNull();
  });

  it('navigates to /purchaseOrders (not /intake) when "Receive against PO" is clicked', () => {
    mockNavigate.mockClear();
    render(
      <MemoryRouter>
        <Keel user={ownerUser()} />
      </MemoryRouter>
    );

    // Open the quick-action popover
    const quickActionsButton = screen.getByRole('button', { name: /quick actions/i });
    fireEvent.click(quickActionsButton);

    // Click the Receive against PO chip
    const receiveChip = screen.getByText('Receive against PO');
    fireEvent.click(receiveChip.closest('button')!);

    // Must navigate to purchaseOrders, not intake
    expect(mockNavigate).toHaveBeenCalledWith('/purchaseOrders');
    // Specifically must NOT navigate to /intake
    expect(mockNavigate).not.toHaveBeenCalledWith('/intake');
  });

  it('does NOT have a chip with launch="receiving" going to /intake', () => {
    render(
      <MemoryRouter>
        <Keel user={ownerUser()} />
      </MemoryRouter>
    );

    // Open the quick-action popover
    const quickActionsButton = screen.getByRole('button', { name: /quick actions/i });
    fireEvent.click(quickActionsButton);

    // The old "Receive" chip label must not appear
    expect(screen.queryByRole('menuitem', { name: /^receive$/i })).toBeNull();
  });
});
