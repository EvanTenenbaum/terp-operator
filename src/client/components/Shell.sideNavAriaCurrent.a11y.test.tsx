// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SessionUser } from '../../shared/types';
import { useUiStore } from '../store/uiStore';

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

function ownerUser(): SessionUser {
  return {
    id: 'u-owner',
    name: 'Owner',
    email: 'owner@example.test',
    role: 'owner',
    workLoop: null
  };
}

describe('SideNav accessibility (#34): aria-current on active nav', () => {
  beforeEach(() => {
    useUiStore.setState({ activeView: 'dashboard' });
  });

  it('the active nav item exposes aria-current="page"', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const dashboardItem = screen.getByTestId('sidenav-item-dashboard');
    expect(dashboardItem).toHaveAttribute('aria-current', 'page');
  });

  it('non-active nav items do NOT expose aria-current', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const inventoryItem = screen.getByTestId('sidenav-item-inventory');
    expect(inventoryItem).not.toHaveAttribute('aria-current');
  });

  it('aria-current follows the active view when it changes', () => {
    useUiStore.setState({ activeView: 'inventory' });
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('sidenav-item-inventory')).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByTestId('sidenav-item-dashboard')).not.toHaveAttribute(
      'aria-current'
    );
  });
});
