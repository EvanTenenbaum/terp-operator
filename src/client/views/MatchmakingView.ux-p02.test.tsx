// @vitest-environment jsdom
/**
 * UX-P02 — Matchmaking view accepted rows show "Next:" workflow links.
 *
 * Spec:
 *  (1) Open rows: show Accept + Dismiss buttons only.
 *  (2) Accepted rows: show "Create PO" and "Create Sale" buttons plus Reopen.
 *  (3) Dismissed rows: show Reopen button only (no "Next:" links).
 *  (4) "Create PO" navigates to /purchasing with quickLaunch = 'purchase'.
 *  (5) "Create Sale" navigates to /sales with quickLaunch = 'sale'.
 *
 * Strategy: extract the actionsRenderer from matchExpansionConfig and render it
 * with synthetic row objects, verifying button presence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GridRow } from '../../shared/types';

// ── react-router-dom ────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useNavigate: () => mockNavigate,
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children
}));

// ── trpc mock ────────────────────────────────────────────────────────────────
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      reference: { useQuery: () => ({ data: { customers: [], vendors: [], categories: [] } }) },
      matchmakingBoard: { useQuery: () => ({ data: { needs: [], supplies: [], matches: [] }, isLoading: false }) },
      matchmakingSettings: { useQuery: () => ({ data: null }) },
      matchmakingOpportunities: { useQuery: () => ({ data: { toMove: [], toSource: [] }, isLoading: false }) },
      statusCounts: { useQuery: () => ({ data: null, isLoading: false }) },
    },
    auth: { me: { useQuery: () => ({ data: { role: 'owner' } }) } }
  }
}));

// ── uiStore mock ──────────────────────────────────────────────────────────────
const mockSetActiveView = vi.fn();
const mockSetActiveQuickLaunch = vi.fn();

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeQuickLaunch: null,
      setActiveView: mockSetActiveView,
      setActiveQuickLaunch: mockSetActiveQuickLaunch,
      gridFilters: {} as Record<string, string>,
      setGridFilter: vi.fn(),
      gridAdvancedFilters: {} as Record<string, unknown>,
      setGridAdvancedFilter: vi.fn(),
      clearGridAdvancedFilter: vi.fn(),
      gridColumnPrefs: {} as Record<string, unknown>,
    })
}));

// ── useCommandRunner mock ─────────────────────────────────────────────────────
const mockRunCommand = vi.fn();
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: mockRunCommand, isRunning: false })
}));

// ── OperatorGrid + WorkspacePanel capture ─────────────────────────────────────
interface ExpansionConfig {
  enabled?: boolean;
  actionsRenderer?: (row: GridRow) => React.ReactNode;
  childrenRenderer?: (row: GridRow) => React.ReactNode;
}
let capturedExpansionConfig: ExpansionConfig | null = null;

vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: (props: { expansionConfig?: ExpansionConfig; [k: string]: unknown }) => {
    if (props.expansionConfig) capturedExpansionConfig = props.expansionConfig;
    return <div data-testid="operator-grid" />;
  }
}));

vi.mock('../components/WorkspacePanel', () => ({
  WorkspacePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

import { MatchmakingView } from './MatchmakingView';

// Render MatchmakingView once to capture the config, then use the actionsRenderer
// in isolation for per-row assertions.
function renderAndCapture(): ExpansionConfig {
  capturedExpansionConfig = null;
  render(<MatchmakingView />);
  if (!capturedExpansionConfig) throw new Error('OperatorGrid expansionConfig not captured');
  return capturedExpansionConfig;
}

function makeRow(status: string): GridRow {
  return { id: 'match-1', status, vendor: 'Test Vendor', customer: 'Test Customer' } as GridRow;
}

// ---------------------------------------------------------------------------
// UX-P02 tests
// ---------------------------------------------------------------------------

describe('UX-P02 — matchmaking accepted rows show Next: workflow links', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetActiveView.mockClear();
    mockSetActiveQuickLaunch.mockClear();
  });

  it('open row shows Accept and Dismiss buttons', () => {
    const config = renderAndCapture();
    expect(config.actionsRenderer).toBeDefined();
    const { container } = render(config.actionsRenderer!(makeRow('open')));
    const buttons = container.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent?.trim());
    expect(labels).toContain('Accept');
    expect(labels).toContain('Dismiss');
  });

  it('open row does NOT show Create PO or Create Sale', () => {
    const config = renderAndCapture();
    const { container } = render(config.actionsRenderer!(makeRow('open')));
    const text = container.textContent ?? '';
    expect(text).not.toContain('Create PO');
    expect(text).not.toContain('Create Sale');
  });

  it('accepted row shows Create PO button', () => {
    const config = renderAndCapture();
    const { container } = render(config.actionsRenderer!(makeRow('accepted')));
    expect(container.textContent).toContain('Create PO');
  });

  it('accepted row shows Create Sale button', () => {
    const config = renderAndCapture();
    const { container } = render(config.actionsRenderer!(makeRow('accepted')));
    expect(container.textContent).toContain('Create Sale');
  });

  it('accepted row shows Reopen button alongside Next: links', () => {
    const config = renderAndCapture();
    const { container } = render(config.actionsRenderer!(makeRow('accepted')));
    expect(container.textContent).toContain('Reopen');
    expect(container.textContent).toContain('Create PO');
  });

  it('accepted row does NOT show Accept or Dismiss', () => {
    const config = renderAndCapture();
    const { container } = render(config.actionsRenderer!(makeRow('accepted')));
    const text = container.textContent ?? '';
    expect(text).not.toContain('Accept');
    expect(text).not.toContain('Dismiss');
  });

  it('dismissed row shows Reopen only (no Next: links)', () => {
    const config = renderAndCapture();
    const { container } = render(config.actionsRenderer!(makeRow('dismissed')));
    const text = container.textContent ?? '';
    expect(text).toContain('Reopen');
    expect(text).not.toContain('Create PO');
    expect(text).not.toContain('Create Sale');
  });

  it('Create PO button navigates to /purchase-orders', () => {
    const config = renderAndCapture();
    const { container } = render(config.actionsRenderer!(makeRow('accepted')));
    const buttons = Array.from(container.querySelectorAll('button'));
    const poBtn = buttons.find((b) => b.textContent?.includes('Create PO'));
    expect(poBtn).toBeDefined();
    fireEvent.click(poBtn!);
    expect(mockNavigate).toHaveBeenCalledWith('/purchase-orders');
    expect(mockSetActiveQuickLaunch).toHaveBeenCalledWith('purchaseOrder');
    expect(mockSetActiveView).toHaveBeenCalledWith('purchaseOrders');
  });

  it('Create Sale button navigates to /sales', () => {
    const config = renderAndCapture();
    const { container } = render(config.actionsRenderer!(makeRow('accepted')));
    const buttons = Array.from(container.querySelectorAll('button'));
    const saleBtn = buttons.find((b) => b.textContent?.includes('Create Sale'));
    expect(saleBtn).toBeDefined();
    fireEvent.click(saleBtn!);
    expect(mockNavigate).toHaveBeenCalledWith('/sales');
    expect(mockSetActiveQuickLaunch).toHaveBeenCalledWith('sale');
    expect(mockSetActiveView).toHaveBeenCalledWith('sales');
  });
});
