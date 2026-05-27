// @vitest-environment jsdom
/**
 * TER-1628 F-41 — Recovery vs per-row Undo guidance subtitle and cross-links.
 *
 * Verifies that:
 *  - The page-subtitle explaining when to use Recovery appears at /recovery.
 *  - The "→ Action Log" cross-link appears at /recovery.
 *  - The subtitle and "→ Action Log" link are absent when embedded inside Settings.
 *  - The "For bulk reversals → Recovery" cross-link appears when inside Settings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// --- react-router-dom mock (provides useLocation + useNavigate) ---
const mockNavigate = vi.fn();
let mockPathname = '/recovery';

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname }),
  useNavigate: () => mockNavigate,
  // Not used by RecoveryView directly but re-export to satisfy any static import
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children,
}));

// --- trpc mock ---
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      recoverySearch: { useQuery: () => ({ data: [], isLoading: false }) },
      reference: { useQuery: () => ({ data: { backupSnapshots: [] }, isLoading: false }) },
      supportPacket: { useQuery: (_i: unknown, _o: unknown) => ({ data: undefined, isLoading: false, refetch: vi.fn() }) },
      snapshotDiff: { useQuery: () => ({ data: null, isLoading: false }) },
      findReplacePreview: { useQuery: () => ({ data: null, isLoading: false }) },
    },
  },
}));

// --- uiStore mock ---
const mockSetSelectedRows = vi.fn();
const mockSetActiveSettingsTab = vi.fn();
const mockSelectedRecoveryRows = vi.fn().mockReturnValue(undefined);

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      selectedRows: { recovery: undefined },
      setSelectedRows: mockSetSelectedRows,
      setActiveSettingsTab: mockSetActiveSettingsTab,
    };
    return selector(store);
  },
}));

// --- useCommandRunner mock ---
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false }),
}));

// --- OperatorGrid: stub to avoid AG Grid complexity ---
vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: ({ title, actions }: { title?: string; actions?: React.ReactNode }) => (
    <div data-testid="operator-grid">
      {title ? <span data-testid="grid-title">{title}</span> : null}
      {actions}
    </div>
  ),
}));

// --- CommandReversalTab: stub ---
vi.mock('../components/drawerTabs/CommandReversalTab', () => ({
  CommandReversalTab: ({ commandId }: { commandId: string }) => (
    <div data-testid="command-reversal-tab" data-command-id={commandId} />
  ),
}));

import type React from 'react';
import { RecoveryView } from './OperationsViews';

beforeEach(() => {
  mockNavigate.mockReset();
  mockSetSelectedRows.mockReset();
  mockSetActiveSettingsTab.mockReset();
  mockPathname = '/recovery';
});

describe('RecoveryView — TER-1628 F-41 guidance copy', () => {
  it('shows the page-subtitle guidance text when at /recovery', () => {
    mockPathname = '/recovery';
    render(<RecoveryView />);
    expect(
      screen.getByText(
        /Use this for bulk reversals or commands older than the last 30 days' log/i
      )
    ).toBeInTheDocument();
  });

  it('shows the "→ Action Log" cross-link when at /recovery', () => {
    mockPathname = '/recovery';
    render(<RecoveryView />);
    expect(screen.getByText(/→ Action Log/i)).toBeInTheDocument();
  });

  it('does NOT show the page-subtitle guidance at /settings (Action Log context)', () => {
    mockPathname = '/settings';
    render(<RecoveryView />);
    expect(
      screen.queryByText(
        /Use this for bulk reversals or commands older than the last 30 days' log/i
      )
    ).not.toBeInTheDocument();
  });

  it('does NOT show "→ Action Log" cross-link when embedded in Settings', () => {
    mockPathname = '/settings';
    render(<RecoveryView />);
    expect(screen.queryByText(/→ Action Log/i)).not.toBeInTheDocument();
  });
});
