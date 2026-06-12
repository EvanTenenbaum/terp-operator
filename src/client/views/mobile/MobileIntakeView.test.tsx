// @vitest-environment jsdom
/**
 * UX-R02 — MobileIntakeView: minimal /mobile/intake — verify + flag only.
 * Decision 7: list intake batches pending verification, per-row verify action
 * (existing verify command) and flag-discrepancy action (existing discrepancy/reason path).
 * No creation, no posting independently.
 *
 * Verifies:
 *  - Renders pending batches from intakeQueue
 *  - Does NOT show posted batches
 *  - Verify flow calls updateBatch then postPurchaseReceipt
 *  - Flag flow calls flagBatch with reason
 *  - Empty state renders when no pending batches
 *  - Viewer role cannot see action buttons
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';

// --- trpc mock ---
const mockIntakeQueue = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('../../api/trpc', () => ({
  trpc: {
    auth: { me: { useQuery: vi.fn() } },
    queries: {
      intakeQueue: { useQuery: (_: unknown, _opts: unknown) => mockIntakeQueue() },
    },
    useUtils: () => ({ queries: { intakeQueue: { invalidate: mockInvalidate } } }),
  },
}));

// --- useCommandRunner mock ---
const mockRunCommand = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: mockRunCommand, isRunning: false }),
}));

// --- MobileToast mock ---
const mockAddToast = vi.fn();
vi.mock('../../components/mobile/MobileToast', () => ({
  useMobileToast: () => ({ addToast: mockAddToast }),
}));

import { trpc } from '../../api/trpc';
import { MobileIntakeView } from './MobileIntakeView';

const mockMe = trpc.auth.me.useQuery as ReturnType<typeof vi.fn>;

const INTAKE_DATA = [
  {
    id: 'po-uuid-001',
    poNo: 'PO-001',
    vendor: 'Green Valley Farms',
    status: 'approved',
    batches: [
      {
        id: 'batch-draft-001',
        batchCode: 'B-001',
        name: 'Green Leaf OZ',
        status: 'draft',
        intakeQty: '10',
        expectedQty: '12',
        notes: null,
        purchaseOrderId: 'po-uuid-001',
      },
      {
        id: 'batch-ready-002',
        batchCode: 'B-002',
        name: 'Purple Haze',
        status: 'ready',
        intakeQty: '8',
        expectedQty: '8',
        notes: null,
        purchaseOrderId: 'po-uuid-001',
      },
      {
        id: 'batch-posted-003',
        batchCode: 'B-003',
        name: 'Already Posted',
        status: 'posted',
        intakeQty: '5',
        expectedQty: '5',
        notes: null,
        purchaseOrderId: 'po-uuid-001',
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRunCommand.mockResolvedValue({ ok: true });
  mockMe.mockReturnValue({ data: { role: 'operator' } });
  mockIntakeQueue.mockReturnValue({
    data: INTAKE_DATA,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

function renderView() {
  return render(
    <MemoryRouter>
      <MobileIntakeView />
    </MemoryRouter>
  );
}

describe('MobileIntakeView (UX-R02)', () => {
  it('renders pending batches (draft + ready) but not posted ones', () => {
    renderView();
    expect(screen.getByText('Green Leaf OZ')).toBeTruthy();
    expect(screen.getByText('Purple Haze')).toBeTruthy();
    // posted batch should NOT appear
    expect(screen.queryByText('Already Posted')).toBeNull();
  });

  it('shows verify and flag discrepancy buttons for each pending batch', () => {
    renderView();
    const verifyBtns = screen.getAllByRole('button', { name: /verify/i });
    expect(verifyBtns.length).toBeGreaterThanOrEqual(2);
    const flagBtns = screen.getAllByRole('button', { name: /flag discrepancy/i });
    expect(flagBtns.length).toBeGreaterThanOrEqual(2);
  });

  it('clicking Verify opens a confirm panel', () => {
    renderView();
    const verifyBtns = screen.getAllByRole('button', { name: /^verify/i });
    fireEvent.click(verifyBtns[0]);
    expect(screen.getByRole('button', { name: /confirm verify/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('confirming verify calls updateBatch and postPurchaseReceipt', async () => {
    renderView();
    const verifyBtns = screen.getAllByRole('button', { name: /^verify/i });
    fireEvent.click(verifyBtns[0]); // open first batch verify
    const confirmBtn = screen.getByRole('button', { name: /confirm verify/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockRunCommand).toHaveBeenCalledWith(
        'updateBatch',
        expect.objectContaining({ id: 'batch-draft-001' }),
        expect.any(String)
      );
      expect(mockRunCommand).toHaveBeenCalledWith(
        'postPurchaseReceipt',
        expect.objectContaining({ batchIds: ['batch-draft-001'] }),
        expect.any(String)
      );
    });
  });

  it('clicking Flag opens a reason input', () => {
    renderView();
    const flagBtns = screen.getAllByRole('button', { name: /flag discrepancy/i });
    fireEvent.click(flagBtns[0]);
    expect(screen.getByLabelText(/reason/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit flag/i })).toBeTruthy();
  });

  it('submitting flag calls flagBatch with reason', async () => {
    renderView();
    const flagBtns = screen.getAllByRole('button', { name: /flag discrepancy/i });
    fireEvent.click(flagBtns[0]);
    const reasonInput = screen.getByLabelText(/reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Wrong variety delivered' } });
    const submitBtn = screen.getByRole('button', { name: /submit flag/i });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockRunCommand).toHaveBeenCalledWith(
        'flagBatch',
        expect.objectContaining({
          batchId: 'batch-draft-001',
          reason: 'Wrong variety delivered',
        }),
        expect.any(String)
      );
    });
  });

  it('submit flag is disabled when reason is empty', () => {
    renderView();
    const flagBtns = screen.getAllByRole('button', { name: /flag discrepancy/i });
    fireEvent.click(flagBtns[0]);
    const submitBtn = screen.getByRole('button', { name: /submit flag/i });
    expect(submitBtn).toBeDisabled();
  });

  it('shows empty state when no pending batches exist', () => {
    mockIntakeQueue.mockReturnValue({
      data: [{
        id: 'po-uuid-002',
        poNo: 'PO-002',
        vendor: 'Test Vendor',
        status: 'received',
        batches: [
          {
            id: 'batch-posted-only',
            batchCode: 'B-100',
            name: 'All Posted',
            status: 'posted',
            intakeQty: '5',
            expectedQty: '5',
            notes: null,
            purchaseOrderId: 'po-uuid-002',
          }
        ],
      }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderView();
    expect(screen.getByText(/no batches pending verification/i)).toBeTruthy();
  });

  it('viewer role cannot see action buttons', () => {
    mockMe.mockReturnValue({ data: { role: 'viewer' } });
    renderView();
    expect(screen.queryByRole('button', { name: /^verify/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /flag discrepancy/i })).toBeNull();
  });

  it('shows loading state', () => {
    mockIntakeQueue.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    renderView();
    expect(screen.getByText(/loading intake/i)).toBeTruthy();
  });

  it('shows error state with retry button', () => {
    const mockRefetch = vi.fn();
    mockIntakeQueue.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: mockRefetch });
    renderView();
    expect(screen.getByText(/failed to load intake/i)).toBeTruthy();
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeTruthy();
  });
});
