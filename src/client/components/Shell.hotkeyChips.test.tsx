// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SessionUser } from '../../shared/types';

// SideNav consumes trpc.credit.creditReviewQueue for the badge — stub it.
vi.mock('../api/trpc', () => ({
  trpc: {
    credit: {
      creditReviewQueue: {
        useQuery: () => ({ data: undefined, isLoading: false })
      }
    }
  }
}));

import { SideNav } from './Shell';

function intakeOnlyUser(): SessionUser {
  // Hint the workLoop -> 'intake' via email/name substring matching in
  // accessPolicy.workLoopForUser(). Role must NOT be owner/manager/viewer
  // for that heuristic to apply.
  return { id: 'u-intake', name: 'Intake Operator', email: 'intake@example.test', role: 'operator', workLoop: null };
}

function salesOnlyUser(): SessionUser {
  return { id: 'u-sales', name: 'Sales Operator', email: 'sales@example.test', role: 'operator', workLoop: null };
}

describe('SideNav — Cmd+1..6 hotkey chips gating (#34 FE-L4)', () => {
  it('does NOT render the Sales hotkey chip (⌘3) for an intake-only operator', () => {
    render(
      <MemoryRouter>
        <SideNav user={intakeOnlyUser()} />
      </MemoryRouter>
    );

    // The Sales nav item itself must not be in the DOM for an intake-only
    // operator — and therefore its hotkey chip (⌘3) must not be either.
    expect(screen.queryByTestId('sidenav-item-sales')).toBeNull();
    expect(screen.queryByText('⌘3')).toBeNull();
  });

  it('does NOT render the Client Ledger hotkey chip (⌘6) for an intake-only operator', () => {
    render(
      <MemoryRouter>
        <SideNav user={intakeOnlyUser()} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('sidenav-item-clients')).toBeNull();
    expect(screen.queryByText('⌘6')).toBeNull();
  });

  it('renders Dashboard, Intake, and Inventory chips for an intake-only operator', () => {
    render(
      <MemoryRouter>
        <SideNav user={intakeOnlyUser()} />
      </MemoryRouter>
    );

    const dashboard = screen.getByTestId('sidenav-item-dashboard');
    expect(within(dashboard).getByText('⌘1')).toBeInTheDocument();
    const intake = screen.getByTestId('sidenav-item-intake');
    expect(within(intake).getByText('⌘2')).toBeInTheDocument();
    const inventory = screen.getByTestId('sidenav-item-inventory');
    expect(within(inventory).getByText('⌘5')).toBeInTheDocument();
  });

  it('does NOT render the Intake hotkey chip (⌘2) for a sales-only operator', () => {
    render(
      <MemoryRouter>
        <SideNav user={salesOnlyUser()} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('sidenav-item-intake')).toBeNull();
    expect(screen.queryByText('⌘2')).toBeNull();
  });

  it('only renders a hotkey chip inside a visible nav button (defence-in-depth)', () => {
    // Belt-and-suspenders: every <kbd> chip must be a descendant of a
    // [data-testid="sidenav-item-..."] button. If a refactor ever loosens
    // the visibleItems filter, this still keeps chips from leaking.
    render(
      <MemoryRouter>
        <SideNav user={intakeOnlyUser()} />
      </MemoryRouter>
    );
    const chips = Array.from(document.querySelectorAll('kbd'));
    for (const chip of chips) {
      const parent = chip.closest('[data-testid^="sidenav-item-"]');
      expect(parent).not.toBeNull();
    }
  });
});
