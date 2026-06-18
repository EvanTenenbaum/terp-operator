// @vitest-environment jsdom
/**
 * UX-M04 — RecoveryView: entity-id and command-family filter chips above
 * the command journal grid.
 *
 * Verifies:
 *  - All command family chip buttons are rendered.
 *  - Clicking a family chip filters the grid to only that family's commands.
 *  - Clicking the active chip again clears the filter (toggle).
 *  - A "✕ Clear" button appears when a family filter is active and clears it.
 *  - Entity-id input is rendered.
 *  - Entering an entity UUID into the entity-id filter restricts the rows
 *    passed to OperatorGrid to only those whose affectedIds include the UUID.
 *  - commandFamilies map covers the major families from the catalog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type React from 'react';

// --- react-router-dom mock ---
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/recovery' }),
  useNavigate: () => vi.fn(),
}));

// --- trpc mock ---
const INTAKE_CMD = {
  id: 'cmd-intake-001',
  commandName: 'postPurchaseReceipt',
  actorName: 'Alice',
  status: 'ok',
  error: null,
  affectedIds: ['batch-aaa-001'],
  reversedByCommandId: null,
  createdAt: '2026-06-12T00:00:00Z',
};
const SALES_CMD = {
  id: 'cmd-sales-001',
  commandName: 'postSalesOrder',
  actorName: 'Bob',
  status: 'ok',
  error: null,
  affectedIds: ['order-bbb-001'],
  reversedByCommandId: null,
  createdAt: '2026-06-12T01:00:00Z',
};

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      recoverySearch: { useQuery: () => ({ data: [INTAKE_CMD, SALES_CMD], isLoading: false }) },
      reference: { useQuery: () => ({ data: { backupSnapshots: [] }, isLoading: false }) },
      supportPacket: { useQuery: (_i: unknown, _o: unknown) => ({ data: undefined, isLoading: false, refetch: vi.fn() }) },
      snapshotDiff: { useQuery: () => ({ data: null, isLoading: false }) },
      findReplacePreview: { useQuery: () => ({ data: null, isLoading: false }) },
    },
  },
}));

// --- uiStore mock ---
const mockSetSelectedRows = vi.fn();

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const store: Record<string, unknown> = {
      selectedRows: { recovery: [] },
      setSelectedRows: mockSetSelectedRows,
      collapsedPanels: {},
      focusedPanelId: null,
      togglePanelCollapsed: vi.fn(),
      setFocusedPanel: vi.fn(),
      gridFilters: {},
      setGridFilter: vi.fn(),
      activeDrawerEntityByView: { recovery: undefined },
      drawerByView: {},
      setDrawerEntity: vi.fn(),
      setDrawerState: vi.fn(),
    };
    return selector(store);
  },
}));

// --- useCommandRunner mock ---
vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn(), isRunning: false }),
}));

// --- WorkspacePanel stub ---
vi.mock('../components/WorkspacePanel', () => ({
  WorkspacePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// --- CommandReversalTab stub ---
vi.mock('../components/drawerTabs/CommandReversalTab', () => ({
  CommandReversalTab: () => null,
}));

// Capture rows passed to OperatorGrid so we can test filtering
let capturedRows: unknown[] = [];

vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: ({ rows }: { rows: unknown[] }) => {
    capturedRows = rows;
    return <div data-testid="operator-grid" data-row-count={rows.length} />;
  },
}));

import { RecoveryView } from './RecoveryView';
import { commandFamilies } from '../../shared/commandCatalog';

beforeEach(() => {
  capturedRows = [];
  mockSetSelectedRows.mockReset();
});

describe('UX-M04 — RecoveryView: command-family filter chips', () => {
  // Helper: find a chip button by its title attribute (avoids collisions with
  // other buttons that contain the same text).
  function getFamilyChip(family: string) {
    return screen.getByTitle(`Show only ${family} commands`);
  }

  it('renders a chip button for each command family', () => {
    render(<RecoveryView />);
    const families = Object.keys(commandFamilies);
    for (const family of families) {
      expect(getFamilyChip(family)).toBeTruthy();
    }
  });

  it('renders the "Intake" chip with aria-pressed=false initially', () => {
    render(<RecoveryView />);
    const chip = getFamilyChip('Intake');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking "Intake" chip filters rows to only Intake commands', () => {
    render(<RecoveryView />);
    fireEvent.click(getFamilyChip('Intake'));
    // postPurchaseReceipt is an Intake command; postSalesOrder is not
    expect(capturedRows).toHaveLength(1);
    expect((capturedRows[0] as typeof INTAKE_CMD).commandName).toBe('postPurchaseReceipt');
  });

  it('clicking "Sales" chip shows only Sales commands', () => {
    render(<RecoveryView />);
    fireEvent.click(getFamilyChip('Sales'));
    expect(capturedRows).toHaveLength(1);
    expect((capturedRows[0] as typeof SALES_CMD).commandName).toBe('postSalesOrder');
  });

  it('clicking the active family chip again clears the filter (shows all rows)', () => {
    render(<RecoveryView />);
    const chip = getFamilyChip('Intake');
    fireEvent.click(chip); // activate
    expect(capturedRows).toHaveLength(1);
    fireEvent.click(chip); // deactivate
    expect(capturedRows).toHaveLength(2);
  });

  it('shows a "Clear" button when a family filter is active', () => {
    render(<RecoveryView />);
    expect(screen.queryByText(/✕ Clear/)).toBeNull();
    fireEvent.click(getFamilyChip('Intake'));
    expect(screen.getByText(/✕ Clear/)).toBeTruthy();
  });

  it('"Clear" button removes the family filter', () => {
    render(<RecoveryView />);
    fireEvent.click(getFamilyChip('Intake'));
    fireEvent.click(screen.getByText(/✕ Clear/));
    expect(capturedRows).toHaveLength(2);
  });
});

describe('UX-M04 — RecoveryView: entity-id filter input', () => {
  it('renders the Entity ID filter input', () => {
    render(<RecoveryView />);
    expect(screen.getByPlaceholderText(/Paste entity UUID/i)).toBeTruthy();
  });

  it('entering a matching entity UUID filters to only rows with that ID in affectedIds', () => {
    render(<RecoveryView />);
    const input = screen.getByPlaceholderText(/Paste entity UUID/i);
    fireEvent.change(input, { target: { value: 'batch-aaa-001' } });
    expect(capturedRows).toHaveLength(1);
    expect((capturedRows[0] as typeof INTAKE_CMD).commandName).toBe('postPurchaseReceipt');
  });

  it('entering a non-matching UUID shows zero rows', () => {
    render(<RecoveryView />);
    const input = screen.getByPlaceholderText(/Paste entity UUID/i);
    fireEvent.change(input, { target: { value: 'xxxxxxxx-no-match' } });
    expect(capturedRows).toHaveLength(0);
  });

  it('clearing the entity filter restores all rows', () => {
    render(<RecoveryView />);
    const input = screen.getByPlaceholderText(/Paste entity UUID/i);
    fireEvent.change(input, { target: { value: 'batch-aaa-001' } });
    expect(capturedRows).toHaveLength(1);
    fireEvent.change(input, { target: { value: '' } });
    expect(capturedRows).toHaveLength(2);
  });
});

describe('commandFamilies map coverage', () => {
  it('includes all major expected families', () => {
    const keys = Object.keys(commandFamilies);
    expect(keys).toContain('Intake');
    expect(keys).toContain('PO');
    expect(keys).toContain('Sales');
    expect(keys).toContain('Payments');
    expect(keys).toContain('Vendor');
    expect(keys).toContain('Fulfillment');
    expect(keys).toContain('Recovery');
  });

  it('postPurchaseReceipt belongs to Intake family', () => {
    expect(commandFamilies['Intake']).toContain('postPurchaseReceipt');
  });

  it('postSalesOrder belongs to Sales family', () => {
    expect(commandFamilies['Sales']).toContain('postSalesOrder');
  });
});
