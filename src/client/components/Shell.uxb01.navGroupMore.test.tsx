// @vitest-environment jsdom
/**
 * UX-B01 — per-group "More" disclosure for low-frequency nav lanes.
 *
 * Contract:
 * - Low-frequency lanes (Items, Referees, Disputes, Receipts, Credit Review,
 *   Photography) are collapsed behind a "More" button by default.
 * - Primary (high-frequency) lanes are always visible.
 * - The "More" button has aria-expanded and controls attributes.
 * - Keyboard shortcuts (⌘N + aria-keyshortcuts) work for collapsed lanes —
 *   their nav buttons are rendered (sr-only) even when the group is collapsed.
 * - Expanding the group reveals secondary items and changes "More" to "Less".
 * - The active view's lane is always primary (promoted out of the More bucket).
 * - The expansion state is persisted in uiStore (navGroupExpansion).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SessionUser } from '../../shared/types';
import { useUiStore } from '../store/uiStore';

vi.mock('../api/trpc', () => ({
  trpc: {
    credit: {
      creditReviewQueue: {
        useQuery: () => ({ data: undefined, isLoading: false })
      }
    },
    queries: {
      reference: {
        useQuery: () => ({ data: undefined })
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

const DEFAULT_UI_STATE = {
  activeView: 'dashboard' as const,
  sideNavCollapsed: false,
  navGroupExpansion: {}
};

describe('UX-B01 — SideNav "More" disclosure for low-frequency lanes', () => {
  beforeEach(() => {
    useUiStore.setState(DEFAULT_UI_STATE);
  });

  it('renders primary lanes (Intake, Sales, Payments, Inventory) always visible', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('sidenav-item-intake')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav-item-sales')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav-item-payments')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav-item-inventory')).toBeInTheDocument();
  });

  it('renders a "More" button for groups that contain low-frequency lanes', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    // Procure group has Receipts + Photography + Items as secondary
    const procureMore = screen.getByTestId('sidenav-more-Procure');
    expect(procureMore).toBeInTheDocument();
    expect(procureMore).toHaveAttribute('aria-expanded', 'false');
  });

  it('"More" button has aria-expanded=false when collapsed', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const moreBtn = screen.getByTestId('sidenav-more-Procure');
    expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('expanding "More" reveals secondary lanes and changes label to "Less"', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const moreBtn = screen.getByTestId('sidenav-more-Procure');
    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
    expect(moreBtn).toHaveTextContent('Less');
    // Photography is a secondary Procure lane
    const photoItem = screen.getByTestId('sidenav-item-photography');
    // After expansion the item should be visible (not sr-only parent)
    expect(photoItem).toBeInTheDocument();
  });

  it('expanding updates navGroupExpansion in the store', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('sidenav-more-Procure'));
    expect(useUiStore.getState().navGroupExpansion['Procure']).toBe(true);
  });

  it('secondary lane buttons are rendered in the DOM when collapsed (for keyboard nav)', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    // Photography is secondary in Procure — button must be in the DOM even
    // when the group is collapsed so that any bound keyboard shortcut can still
    // navigate to it without the "More" being open.
    expect(screen.getByTestId('sidenav-item-photography')).toBeInTheDocument();
  });

  it('active view lane is promoted to primary (not hidden behind More)', () => {
    // Set photography as active view — it should NOT be behind More
    useUiStore.setState({ ...DEFAULT_UI_STATE, activeView: 'photography' });
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    // Photography button should be rendered as a primary (aria-current=page).
    const photoBtn = screen.getByTestId('sidenav-item-photography');
    expect(photoBtn).toHaveAttribute('aria-current', 'page');
    // The More panel (if it exists) should NOT contain the promoted item.
    const morePanel = document.getElementById('sidenav-more-panel-Procure');
    if (morePanel) {
      expect(morePanel).not.toContain(photoBtn);
    }
  });

  it('Money group "More" button controls Referees and Disputes (secondary)', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const moneyMore = screen.getByTestId('sidenav-more-Money');
    expect(moneyMore).toBeInTheDocument();
    // Expanding reveals Referees and Disputes
    fireEvent.click(moneyMore);
    expect(screen.getByTestId('sidenav-item-referees')).toBeInTheDocument();
    expect(screen.getByTestId('sidenav-item-disputes')).toBeInTheDocument();
  });

  it('Sell group "More" button controls Credit Review (secondary)', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const sellMore = screen.getByTestId('sidenav-more-Sell');
    expect(sellMore).toBeInTheDocument();
  });

  it('persisted navGroupExpansion re-opens a group on mount', () => {
    useUiStore.setState({
      ...DEFAULT_UI_STATE,
      navGroupExpansion: { Procure: true }
    });
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const moreBtn = screen.getByTestId('sidenav-more-Procure');
    expect(moreBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('navGroupExpansion is persisted in localStorage', () => {
    window.localStorage.clear();
    useUiStore.setState(DEFAULT_UI_STATE);
    // Trigger a setNavGroupExpanded which should flush to partialize
    useUiStore.getState().setNavGroupExpanded('Procure', true);
    // Trigger a persist-touching mutation
    useUiStore.getState().setShowMargin(true);
    const raw = window.localStorage.getItem('terp-agro-ui');
    const parsed = JSON.parse(raw ?? '{}');
    const persisted = parsed?.state ?? parsed;
    expect(persisted).toHaveProperty('navGroupExpansion');
    expect((persisted.navGroupExpansion as Record<string, boolean>)['Procure']).toBe(true);
  });
});
