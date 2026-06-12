// @vitest-environment jsdom
/**
 * UX-B08 — IdentityRibbon stale-entity sweep.
 *
 * Contract:
 * - Navigating to 'reports' clears selectedRows + drawerEntity for that view.
 * - Navigating to 'matchmaking' clears selectedRows + drawerEntity for that view.
 * - Navigating to 'sales' without a row selected clears activeCustomerId
 *   (orders-mode: operator has not chosen a customer workspace).
 * - Navigating to views that DO own their entity (e.g., 'payments') does NOT
 *   trigger a spurious clear.
 * - The IdentityRibbon does not render when no entity is set for the view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { act } from '@testing-library/react';
import { useUiStore } from '../store/uiStore';

// Stub trpc — IdentityRibbon queries reference when activeCustomerId is set.
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: {
        useQuery: () => ({ data: { customers: [] } })
      }
    }
  }
}));

import { IdentityRibbon } from './IdentityRibbon';

const BASE_STATE = {
  activeView: 'dashboard' as const,
  selectedRows: {},
  activeCustomerId: null as string | null,
  activeDrawerEntityByView: {} as Record<string, { entityType: string; entityId: string | null }>,
  drawerByView: {},
  routeHistory: [],
  navGroupExpansion: {},
  dismissedDrawerCoachmark: false
};

describe('UX-B08 — IdentityRibbon stale-entity clear on route change', () => {
  beforeEach(() => {
    useUiStore.setState(BASE_STATE);
  });

  it('clears selectedRows for "reports" when activeView changes to reports', () => {
    // Seed a stale row on the reports view from a prior navigation
    useUiStore.setState({
      ...BASE_STATE,
      activeView: 'inventory',
      selectedRows: { reports: [{ id: 'stale-row', label: 'Stale' }] },
      activeDrawerEntityByView: { reports: { entityType: 'report', entityId: 'stale-row' } }
    });

    render(<IdentityRibbon />);

    // Simulate navigating to reports
    act(() => {
      useUiStore.getState().setActiveView('reports');
    });

    const state = useUiStore.getState();
    expect(state.selectedRows['reports']).toEqual([]);
  });

  it('clears drawerEntity for "matchmaking" when navigating to it', () => {
    useUiStore.setState({
      ...BASE_STATE,
      activeView: 'sales',
      activeDrawerEntityByView: {
        matchmaking: { entityType: 'customerNeed', entityId: 'need-123' }
      }
    });

    render(<IdentityRibbon />);

    act(() => {
      useUiStore.getState().setActiveView('matchmaking');
    });

    const state = useUiStore.getState();
    const entity = state.activeDrawerEntityByView['matchmaking'];
    // After clear, entity should be queue/null
    expect(!entity || entity.entityType === 'queue').toBe(true);
  });

  it('clears activeCustomerId when navigating to sales with no row selected', () => {
    useUiStore.setState({
      ...BASE_STATE,
      activeView: 'dashboard',
      activeCustomerId: 'customer-abc',
      selectedRows: { sales: [] }
    });

    render(<IdentityRibbon />);

    act(() => {
      useUiStore.getState().setActiveView('sales');
    });

    expect(useUiStore.getState().activeCustomerId).toBeNull();
  });

  it('does NOT clear activeCustomerId when sales has a row selected', () => {
    useUiStore.setState({
      ...BASE_STATE,
      activeView: 'dashboard',
      activeCustomerId: 'customer-abc',
      selectedRows: { sales: [{ id: 'order-1', orderNo: 'SO-001', customerId: 'customer-abc' }] }
    });

    render(<IdentityRibbon />);

    act(() => {
      useUiStore.getState().setActiveView('sales');
    });

    // Customer ID preserved because a row is selected
    expect(useUiStore.getState().activeCustomerId).toBe('customer-abc');
  });

  it('does NOT clear entity when navigating to a view that owns its own entity (payments)', () => {
    useUiStore.setState({
      ...BASE_STATE,
      activeView: 'dashboard',
      selectedRows: { payments: [{ id: 'pay-1', amount: 500 }] },
      activeDrawerEntityByView: { payments: { entityType: 'payment', entityId: 'pay-1' } }
    });

    render(<IdentityRibbon />);

    act(() => {
      useUiStore.getState().setActiveView('payments');
    });

    // Payments row not cleared (payments is not in STALE_ENTITY_VIEWS)
    expect(useUiStore.getState().selectedRows['payments']?.length).toBe(1);
  });

  it('IdentityRibbon does not render when no entity is set for reports', () => {
    useUiStore.setState({
      ...BASE_STATE,
      activeView: 'reports',
      selectedRows: { reports: [] },
      activeCustomerId: null
    });

    const { container } = render(<IdentityRibbon />);
    // Should render nothing (null)
    expect(container.firstChild).toBeNull();
  });
});
