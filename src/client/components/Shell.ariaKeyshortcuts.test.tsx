// @vitest-environment jsdom
/**
 * UX-S02 / UX-B02 — aria-keyshortcuts on Hotkeys-bound shell controls,
 * sourced from the UX-T07 shortcuts registry:
 *  - SideNav items with a ⌘1–⌘6 binding carry aria-keyshortcuts (Meta+N) and
 *    their <kbd> badge text comes from the registry (badge only where bound).
 *  - Unbound lanes (Reports, Fulfillment, ...) carry NO aria-keyshortcuts
 *    and no badge.
 *  - Lanes hidden from an operator never expose a binding (defence-in-depth,
 *    #34 FE-L4 preserved).
 *  - The Keel search button carries the ⌘K binding.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SessionUser } from '../../shared/types';
import { navShortcuts } from '../shortcuts/registry';

vi.mock('../api/trpc', () => ({
  trpc: {
    credit: {
      creditReviewQueue: { useQuery: () => ({ data: undefined, isLoading: false }) }
    },
    auth: {
      logout: { useMutation: () => ({ mutate: vi.fn() }) }
    },
    queries: {
      health: { useQuery: () => ({ data: { ok: true } }) },
      reference: { useQuery: () => ({ data: { customers: [] } }) }
    },
    useContext: () => ({ auth: { me: { invalidate: vi.fn() } } })
  }
}));

import { SideNav, Keel } from './Shell';

function ownerUser(): SessionUser {
  return { id: 'u-owner', name: 'Owner', email: 'owner@example.test', role: 'owner', workLoop: null };
}

function intakeOnlyUser(): SessionUser {
  return { id: 'u-intake', name: 'Intake Operator', email: 'intake@example.test', role: 'operator', workLoop: null };
}

describe('UX-S02/B02 — SideNav aria-keyshortcuts from the shortcuts registry', () => {
  it('every registry-bound lane carries aria-keyshortcuts and a matching badge for an owner', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    for (const shortcut of navShortcuts()) {
      const item = screen.getByTestId(`sidenav-item-${shortcut.view}`);
      expect(item.getAttribute('aria-keyshortcuts'), String(shortcut.view)).toBe(shortcut.ariaKeyshortcuts);
      expect(within(item).getByText(shortcut.combo)).toBeInTheDocument();
    }
  });

  it('unbound lanes have neither aria-keyshortcuts nor a badge', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    for (const view of ['reports', 'fulfillment', 'orders', 'vendors', 'settings']) {
      const item = screen.getByTestId(`sidenav-item-${view}`);
      expect(item.hasAttribute('aria-keyshortcuts'), view).toBe(false);
      expect(item.querySelector('kbd'), view).toBeNull();
    }
  });

  it('keeps the #34 FE-L4 gate: lanes hidden from an operator expose no binding anywhere', () => {
    render(
      <MemoryRouter>
        <SideNav user={intakeOnlyUser()} />
      </MemoryRouter>
    );
    // Sales is not part of the intake operator workspace.
    expect(screen.queryByTestId('sidenav-item-sales')).toBeNull();
    expect(screen.queryByText('⌘3')).toBeNull();
    expect(document.querySelector('[aria-keyshortcuts="Meta+3"]')).toBeNull();
    // Intake stays bound for this operator.
    const intake = screen.getByTestId('sidenav-item-intake');
    expect(intake.getAttribute('aria-keyshortcuts')).toBe('Meta+2');
    expect(within(intake).getByText('⌘2')).toBeInTheDocument();
  });

  it('the Keel search button carries the ⌘K palette binding from the registry', () => {
    render(
      <MemoryRouter>
        <Keel user={ownerUser()} />
      </MemoryRouter>
    );
    const search = screen.getByRole('button', { name: /Search/ });
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Meta+K');
    expect(within(search).getByText('⌘K')).toBeInTheDocument();
  });
});
