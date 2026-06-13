// @vitest-environment jsdom
/**
 * UX-B06 — ContextDrawer state-cycle button and one-time coachmark.
 *
 * Contract:
 * - The open drawer renders a state-cycle button (data-testid="drawer-cycle-btn").
 * - The button's aria-label includes the current state name.
 * - Clicking it cycles: peek → standard → wide → focus → peek.
 * - The coachmark (data-testid="drawer-coachmark") is shown on first open
 *   when dismissedDrawerCoachmark === false.
 * - Clicking "Got it" sets dismissedDrawerCoachmark = true and hides it.
 * - The dismissedDrawerCoachmark flag is persisted to localStorage.
 * - When dismissedDrawerCoachmark === true, the coachmark is not rendered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useUiStore } from '../store/uiStore';

// Minimal trpc stubs for ContextDrawer dependencies.
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      relationshipSummary: { useQuery: () => ({ data: undefined }) },
      salesOrderLines: { useQuery: () => ({ data: [] }) }
    }
  }
}));

vi.mock('../hooks/useDrawerUrlSync', () => ({
  useDrawerUrlSync: () => {}
}));

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

import { ContextDrawer } from './ContextDrawer';

function openDrawer(view = 'payments' as const) {
  useUiStore.setState({
    activeView: view,
    selectedRows: { [view]: [{ id: 'row-1', status: 'posted', amount: 100 }] },
    activeDrawerEntityByView: {
      [view]: { entityType: 'payment', entityId: 'row-1' }
    },
    drawerByView: {
      [`${view}:payment:row-1`]: { state: 'standard', activeTab: 'allocations' }
    },
    dismissedDrawerCoachmark: false,
    navGroupExpansion: {}
  });
}

describe('UX-B06 — ContextDrawer state-cycle button', () => {
  beforeEach(() => {
    window.localStorage.clear();
    openDrawer();
  });

  it('renders the cycle button when the drawer is open', () => {
    render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    expect(screen.getByTestId('drawer-cycle-btn')).toBeInTheDocument();
  });

  it('the cycle button aria-label mentions the current drawer state', () => {
    render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    const btn = screen.getByTestId('drawer-cycle-btn');
    expect(btn.getAttribute('aria-label')).toMatch(/standard/i);
  });

  it('clicking the cycle button advances: standard → wide', () => {
    render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('drawer-cycle-btn'));
    const state = Object.values(useUiStore.getState().drawerByView)[0];
    expect(state?.state).toBe('wide');
  });

  it('cycling continues: wide → focus', () => {
    useUiStore.setState({
      ...useUiStore.getState(),
      drawerByView: { 'payments:payment:row-1': { state: 'wide', activeTab: 'allocations' } }
    });
    render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('drawer-cycle-btn'));
    const state = Object.values(useUiStore.getState().drawerByView)[0];
    expect(state?.state).toBe('focus');
  });

  it('cycling wraps: focus → peek', () => {
    useUiStore.setState({
      ...useUiStore.getState(),
      drawerByView: { 'payments:payment:row-1': { state: 'focus', activeTab: 'allocations' } }
    });
    render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('drawer-cycle-btn'));
    const state = Object.values(useUiStore.getState().drawerByView)[0];
    expect(state?.state).toBe('peek');
  });
});

describe('UX-B06 — ContextDrawer coachmark (one-time dismissible)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    openDrawer();
  });

  it('shows the coachmark on first open (dismissedDrawerCoachmark = false)', () => {
    render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    expect(screen.getByTestId('drawer-coachmark')).toBeInTheDocument();
  });

  it('hides the coachmark when dismissedDrawerCoachmark = true', () => {
    useUiStore.setState({
      ...useUiStore.getState(),
      dismissedDrawerCoachmark: true
    });
    render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('drawer-coachmark')).toBeNull();
  });

  it('"Got it" button sets dismissedDrawerCoachmark to true', () => {
    render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss drawer tip/i }));
    expect(useUiStore.getState().dismissedDrawerCoachmark).toBe(true);
  });

  it('"Got it" removes the coachmark from the DOM after click', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss drawer tip/i }));
    rerender(
      <MemoryRouter>
        <ContextDrawer />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('drawer-coachmark')).toBeNull();
  });

  it('dismissedDrawerCoachmark is persisted to localStorage', () => {
    useUiStore.getState().setDismissedDrawerCoachmark(true);
    // Trigger a persist flush
    useUiStore.getState().setShowMargin(true);
    const raw = window.localStorage.getItem('terp-agro-ui');
    const parsed = JSON.parse(raw ?? '{}');
    const persisted = parsed?.state ?? parsed;
    expect(persisted).toHaveProperty('dismissedDrawerCoachmark', true);
  });
});
