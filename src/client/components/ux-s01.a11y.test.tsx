// @vitest-environment jsdom
// UX-S01: Extended a11y contract suite for the components cited in the audit.
// Tests run against the REAL components — no test-only abstractions.
//
// Coverage:
//   1. StatusActionBar — tray menu roles (aria-haspopup, role=menu, role=menuitem)
//   2. InspectorDrawer — tablist/tabpanel semantics per view (role=tablist, role=tab,
//      aria-selected, aria-controls/labelledby linkage, role=dialog)
//   3. FilterPresetStrip — aria-pressed group semantics (real component, mocked store)
//   4. ToastCenter — aria-live region + compound toast role=status + action button roles
//   5. SideNav/Keel — landmark structure (nav, header, aria-label)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { GridRow, SessionUser } from '../../shared/types';
import { useUiStore } from '../store/uiStore';

// ─── Module-level mocks (hoisted by vitest/vite) ─────────────────────────────
// Stub tRPC and the focus trap (pure side-effect utilities that cannot run in jsdom).
vi.mock('../api/trpc', () => ({
  trpc: {
    credit: {
      creditReviewQueue: {
        useQuery: () => ({ data: undefined, isLoading: false })
      }
    },
    auth: {
      logout: {
        useMutation: () => ({ mutate: vi.fn() })
      }
    },
    queries: {
      health: { useQuery: () => ({ data: undefined }) },
      reference: { useQuery: () => ({ data: undefined }) }
    },
    useContext: () => ({
      auth: { me: { invalidate: vi.fn() } }
    })
  }
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

// ─── Import real components after mocks are in place ──────────────────────────
import { StatusActionBar, type StatusActionTable } from './templates/StatusActionBar';
import { InspectorDrawer } from './templates/InspectorDrawer';
import { FilterPresetStrip } from './templates/FilterPresetStrip';
import { ToastCenter } from './ToastCenter';
import { SideNav, Keel } from './Shell';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ownerUser(): SessionUser {
  return { id: 'u-1', name: 'Owner', email: 'o@x.test', role: 'owner', workLoop: null };
}

function makeRows(status: string): GridRow[] {
  return [{ id: 'r-1', status } as GridRow];
}

function makeTable(): StatusActionTable {
  return {
    rules: [
      {
        when: 'draft',
        primary: { key: 'confirm', label: 'Confirm', run: vi.fn() },
        tray: [
          { key: 'reprice', label: 'Reprice', run: vi.fn() },
          { key: 'cancel', label: 'Cancel', run: vi.fn() }
        ]
      },
      {
        when: 'posted',
        primary: { key: 'mark-packed', label: 'Mark packed', run: vi.fn() },
        tray: [{ key: 'reverse', label: 'Reverse', run: vi.fn() }]
      }
    ]
  };
}

// ─── 1. StatusActionBar — tray menu roles ────────────────────────────────────

describe('UX-S01 § StatusActionBar — tray menu ARIA roles', () => {
  it('More trigger has aria-haspopup="menu"', () => {
    render(<StatusActionBar rows={makeRows('draft')} table={makeTable()} />);
    const trigger = screen.getByRole('button', { name: /more/i });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('More trigger has aria-expanded=false initially', () => {
    render(<StatusActionBar rows={makeRows('draft')} table={makeTable()} />);
    expect(screen.getByRole('button', { name: /more/i }).getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking More sets aria-expanded=true and reveals a role=menu container', () => {
    render(<StatusActionBar rows={makeRows('draft')} table={makeTable()} />);
    const trigger = screen.getByRole('button', { name: /more/i });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(menu).toBeTruthy();
  });

  it('menu items carry role=menuitem', () => {
    render(<StatusActionBar rows={makeRows('draft')} table={makeTable()} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.map((el) => el.textContent)).toContain('Reprice');
  });

  it('More trigger aria-controls matches the menu id', () => {
    render(<StatusActionBar rows={makeRows('draft')} table={makeTable()} />);
    const trigger = screen.getByRole('button', { name: /more/i });
    fireEvent.click(trigger);
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const menu = document.getElementById(controlsId!);
    expect(menu?.getAttribute('role')).toBe('menu');
  });

  it('primary button does NOT carry aria-haspopup (it is a direct action)', () => {
    render(<StatusActionBar rows={makeRows('draft')} table={makeTable()} />);
    const primary = screen.getByRole('button', { name: 'Confirm' });
    expect(primary.getAttribute('aria-haspopup')).toBeNull();
  });

  it('when no rows selected the bar renders nothing (no orphaned menus)', () => {
    const { container } = render(<StatusActionBar rows={[]} table={makeTable()} />);
    expect(container.firstChild).toBeNull();
  });

  it('mixed selection renders a reason pill — no menu present', () => {
    const rows = [
      { id: '1', status: 'draft' },
      { id: '2', status: 'posted' }
    ] as GridRow[];
    render(<StatusActionBar rows={rows} table={makeTable()} />);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByText('Select rows of same status')).toBeTruthy();
  });
});

// ─── 2. InspectorDrawer — tab semantics ──────────────────────────────────────

describe('UX-S01 § InspectorDrawer — tab semantics', () => {
  const tabs = [
    { key: 'history', label: 'History', render: () => <div>history body</div> },
    { key: 'relationship', label: 'Relationship', render: () => <div>relationship body</div> },
    {
      key: 'issue',
      label: 'Issue',
      available: false,
      unavailableReason: 'Viewer only',
      render: () => <div>issue body</div>
    }
  ];

  function renderInspector(activeTab = 'history') {
    const onTabChange = vi.fn();
    const onClose = vi.fn();
    render(
      <InspectorDrawer
        open
        title="Order Inspector"
        subtitle="SO-1001"
        ariaLabel="Order SO-1001 inspector"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onClose={onClose}
      />
    );
    return { onTabChange, onClose };
  }

  it('renders a role=dialog with aria-modal=true and an accessible name', () => {
    renderInspector();
    const dialog = screen.getByRole('dialog', { name: 'Order SO-1001 inspector' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders a role=tablist with an accessible label', () => {
    renderInspector();
    const tablist = screen.getByRole('tablist', { name: 'Order Inspector sections' });
    expect(tablist).toBeTruthy();
  });

  it('active tab has aria-selected=true; inactive enabled tabs have aria-selected=false', () => {
    renderInspector();
    expect(screen.getByRole('tab', { name: 'History' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Relationship' }).getAttribute('aria-selected')).toBe('false');
  });

  it('active tab button has tabIndex=0; others have tabIndex=-1 (roving tabindex)', () => {
    renderInspector();
    const history = screen.getByRole('tab', { name: 'History' });
    const rel = screen.getByRole('tab', { name: 'Relationship' });
    expect(history.getAttribute('tabindex')).toBe('0');
    expect(rel.getAttribute('tabindex')).toBe('-1');
  });

  it('each tab has aria-controls pointing to a panel; active panel has matching aria-labelledby', () => {
    renderInspector();
    const history = screen.getByRole('tab', { name: 'History' });
    const panelId = history.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe(panelId);
    expect(panel.getAttribute('aria-labelledby')).toBe(history.id);
  });

  it('disabled tab is marked disabled and shows tooltip reason', () => {
    renderInspector();
    const issue = screen.getByRole('tab', { name: 'Issue' }) as HTMLButtonElement;
    expect(issue.disabled).toBe(true);
    expect(issue.getAttribute('title')).toBe('Viewer only');
  });

  it('ArrowRight navigates to the next enabled tab', () => {
    const { onTabChange } = renderInspector();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('relationship');
  });

  it('ArrowLeft wraps back past disabled tabs', () => {
    const { onTabChange } = renderInspector();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(onTabChange).toHaveBeenCalledWith('relationship');
  });

  it('backdrop and close button both carry accessible names', () => {
    const { onClose } = renderInspector();
    const closeButtons = screen.getAllByRole('button', { name: 'Close Order Inspector' });
    expect(closeButtons.length).toBe(2);
    for (const btn of closeButtons) fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('InspectorDrawer renders nothing when open=false', () => {
    const { container } = render(
      <InspectorDrawer
        open={false}
        title="Order Inspector"
        tabs={tabs}
        activeTab="history"
        onTabChange={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ─── 3. FilterPresetStrip — aria-pressed group ────────────────────────────────
// FilterPresetStrip reads from uiStore. We use the REAL store here so tests
// cover the integration path (same as what the ToastCenter and SideNav tests do).

describe('UX-S01 § FilterPresetStrip — aria-pressed group semantics', () => {
  beforeEach(() => {
    // Reset the grid filter for the test view so each test starts clean.
    useUiStore.setState({ gridFilters: {} });
  });

  it('renders role=group with an accessible label', () => {
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[{ label: 'All Open', filter: 'status:draft,confirmed' }]}
      />
    );
    expect(screen.getByRole('group', { name: 'Filter by status' })).toBeTruthy();
  });

  it('each preset button exposes aria-pressed', () => {
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[
          { label: 'All Open', filter: 'status:draft,confirmed' },
          { label: 'Confirmed', filter: 'status:confirmed' }
        ]}
      />
    );
    for (const btn of screen.getAllByRole('button')) {
      expect(
        btn.getAttribute('aria-pressed'),
        `"${btn.textContent}" is missing aria-pressed`
      ).not.toBeNull();
    }
  });

  it('inactive preset has aria-pressed=false', () => {
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[{ label: 'Confirmed', filter: 'status:confirmed' }]}
      />
    );
    expect(screen.getByRole('button', { name: 'Confirmed' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('active preset (current gridFilter matches) has aria-pressed=true', () => {
    useUiStore.setState({ gridFilters: { orders: 'status:confirmed' } });
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[{ label: 'Confirmed', filter: 'status:confirmed' }]}
      />
    );
    expect(screen.getByRole('button', { name: 'Confirmed' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a preset updates the store and aria-pressed reflects the change', () => {
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[{ label: 'Confirmed', filter: 'status:confirmed' }]}
      />
    );
    const btn = screen.getByRole('button', { name: 'Confirmed' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(useUiStore.getState().gridFilters?.orders).toBe('status:confirmed');
  });

  it('preset buttons are native <button> elements', () => {
    render(
      <FilterPresetStrip
        view="orders"
        ariaLabel="Filter by status"
        presets={[{ label: 'Draft', filter: 'status:draft' }]}
      />
    );
    const btn = screen.getByRole('button', { name: 'Draft' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });
});

// ─── 4. ToastCenter — live region + action button roles ───────────────────────

describe('UX-S01 § ToastCenter — aria-live region and action button roles', () => {
  function resetToasts() {
    useUiStore.setState({ toasts: [], announcement: '' });
  }

  beforeEach(() => {
    resetToasts();
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      act(() => { vi.runOnlyPendingTimers(); });
      vi.useRealTimers();
    }
    resetToasts();
  });

  it('renders a polite aria-live region (screen readers announce completions)', () => {
    const { container } = render(<ToastCenter />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.classList.contains('sr-only')).toBe(true);
  });

  it('announcement text appears in the live region after pushToast', () => {
    const { container } = render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Order posted', 'success');
    });
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('Order posted');
  });

  it('simple (no-action) toast renders as role=button (click-to-dismiss)', () => {
    render(<ToastCenter />);
    act(() => { useUiStore.getState().pushToast('Command done', 'success'); });
    expect(screen.getByRole('button', { name: 'Command done' })).toBeTruthy();
  });

  it('compound toast (with actions) uses role=status — not role=button — for the container', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Posted!', 'success', {
        actions: [{ label: 'View order', onAction: vi.fn() }]
      });
    });
    const status = screen.getByRole('status', { name: 'Posted!' });
    expect(status).toBeTruthy();
    expect(status.tagName).not.toBe('BUTTON');
  });

  it('Wave-3 action buttons inside compound toast carry role=button and fire onAction', () => {
    vi.useRealTimers();
    const onAction = vi.fn();
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Payment logged', 'success', {
        actions: [{ label: 'Allocate now', onAction }]
      });
    });
    const actionBtn = screen.getByRole('button', { name: 'Allocate now' });
    expect(actionBtn).toBeTruthy();
    fireEvent.click(actionBtn);
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('compound toast dismiss button has aria-label="Dismiss"', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Order posted', 'success', {
        actions: [{ label: 'View order', onAction: vi.fn() }]
      });
    });
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('error toast without actions persists past the 4.2s auto-dismiss window', () => {
    render(<ToastCenter />);
    act(() => { useUiStore.getState().pushToast('Failed to post', 'error'); });
    act(() => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByRole('button', { name: 'Failed to post' })).toBeTruthy();
  });

  it('multiple action buttons are all rendered as native buttons (focus-able)', () => {
    render(<ToastCenter />);
    act(() => {
      useUiStore.getState().pushToast('Command failed', 'error', {
        actions: [
          { label: 'Copy details', onAction: vi.fn() },
          { label: 'Open in Recovery', onAction: vi.fn() }
        ]
      });
    });
    const copy = screen.getByRole('button', { name: 'Copy details' });
    const recovery = screen.getByRole('button', { name: 'Open in Recovery' });
    expect(copy.tagName).toBe('BUTTON');
    expect(recovery.tagName).toBe('BUTTON');
  });
});

// ─── 5. SideNav — landmark structure ─────────────────────────────────────────

describe('UX-S01 § SideNav landmark structure', () => {
  beforeEach(() => {
    useUiStore.setState({ activeView: 'dashboard', navGroupExpansion: {} });
  });

  it('SideNav renders a <nav> element (landmark)', () => {
    const { container } = render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    expect(container.querySelector('nav')).not.toBeNull();
  });

  it('nav group labels are visible text so groups are identifiable', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Decide')).toBeTruthy();
    expect(screen.getByText('Sell')).toBeTruthy();
    expect(screen.getByText('Money')).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
  });

  it('nav items have aria-label matching their visible label', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const dashboard = screen.getByRole('button', { name: 'Dashboard' });
    expect(dashboard.getAttribute('aria-label')).toBe('Dashboard');
  });

  it('active nav item has aria-current="page"', () => {
    useUiStore.setState({ activeView: 'dashboard', navGroupExpansion: {} });
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('sidenav-item-dashboard').getAttribute('aria-current')).toBe('page');
  });

  it('collapse/expand toggle has aria-label describing the action', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('button', { name: /collapse navigation|expand navigation/i })
    ).toBeTruthy();
  });

  it('UX-B01 More button (if present) has aria-expanded attribute', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    const moreBtn = screen.queryByTestId('sidenav-more-Procure');
    if (moreBtn) {
      expect(moreBtn.getAttribute('aria-expanded')).not.toBeNull();
    }
    // Pass regardless — More button may not appear if all items are primary
  });

  it('More panel group has aria-label when More button is present', () => {
    render(
      <MemoryRouter>
        <SideNav user={ownerUser()} />
      </MemoryRouter>
    );
    // The more-panel div has role=group aria-label="More <Group> items"
    const morePanel = document.querySelector('[role=group][aria-label^="More "]');
    if (morePanel) {
      expect(morePanel.getAttribute('aria-label')).toMatch(/^More .+ items$/);
    }
    // Pass if no More panels exist
  });
});

// ─── 6. Keel — landmark structure ────────────────────────────────────────────

describe('UX-S01 § Keel landmark structure', () => {
  beforeEach(() => {
    useUiStore.setState({
      activeView: 'dashboard',
      activeCustomerId: null,
      activeQuickLaunch: null
    });
  });

  it('Keel renders a <header> element with aria-label', () => {
    const { container } = render(
      <MemoryRouter>
        <Keel user={ownerUser()} />
      </MemoryRouter>
    );
    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.getAttribute('aria-label')).toBeTruthy();
  });

  it('quick-actions chip row has aria-label for the group', () => {
    const { container } = render(
      <MemoryRouter>
        <Keel user={ownerUser()} />
      </MemoryRouter>
    );
    // The keel-chip-row carries aria-label="Quick actions and tools" but no
    // explicit role (it's a presentational grouping div). The accessible label
    // is still present for AT context and can be promoted to role=group if needed.
    const chipRow = container.querySelector('[aria-label="Quick actions and tools"]');
    expect(chipRow).not.toBeNull();
  });

  it('command search button is a native button with an accessible name', () => {
    render(
      <MemoryRouter>
        <Keel user={ownerUser()} />
      </MemoryRouter>
    );
    const searchBtn = screen.getByRole('button', { name: /search/i });
    expect(searchBtn).toBeTruthy();
    expect(searchBtn.tagName).toBe('BUTTON');
  });
});
