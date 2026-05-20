// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useQueryMock = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      processorFees: {
        useQuery: (...args: unknown[]) => useQueryMock(...args)
      }
    }
  }
}));

const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));

import { ProcessorFeesGrid } from './ProcessorFeesGrid';

describe('ProcessorFeesGrid', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    runCommand.mockClear();
  });

  it('renders loading state when query is loading', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<ProcessorFeesGrid processorId="proc-1" />);
    expect(screen.getByText(/loading fees/i)).toBeInTheDocument();
  });

  it('renders empty state when no fees match', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false });
    render(<ProcessorFeesGrid processorId="proc-1" />);
    expect(screen.getByText(/no fees match the current filters/i)).toBeInTheDocument();
  });

  it('calls runCommand with markUserFeeCollected literal when Mark Collected is clicked', async () => {
    useQueryMock.mockReturnValue({
      data: [
        {
          id: 'fee-1',
          processorId: 'proc-1',
          saleId: null,
          paymentId: null,
          processingFeeTotal: '10.00',
          userFeeShare: '2.50',
          processorFeeShare: '7.50',
          userFeeStatus: 'collectible',
          processorFeeStatus: 'unpaid',
          createdAt: '2026-05-01T00:00:00Z'
        }
      ],
      isLoading: false
    });
    const user = userEvent.setup();
    render(<ProcessorFeesGrid processorId="proc-1" />);
    await user.click(screen.getByRole('button', { name: /mark collected/i }));
    expect(runCommand).toHaveBeenCalledWith('markUserFeeCollected', { processorFeeId: 'fee-1' }, 'Mark user processor fee collected');
  });

  it('calls runCommand with updateProcessorFeeStatus literal toggling unpaid → paid', async () => {
    useQueryMock.mockReturnValue({
      data: [
        {
          id: 'fee-2',
          processorId: 'proc-1',
          saleId: null,
          paymentId: null,
          processingFeeTotal: '10.00',
          userFeeShare: '2.50',
          processorFeeShare: '7.50',
          userFeeStatus: 'collected',
          processorFeeStatus: 'unpaid',
          createdAt: '2026-05-01T00:00:00Z'
        }
      ],
      isLoading: false
    });
    const user = userEvent.setup();
    render(<ProcessorFeesGrid processorId="proc-1" />);
    await user.click(screen.getByRole('button', { name: /toggle/i }));
    expect(runCommand).toHaveBeenCalledWith('updateProcessorFeeStatus', {
      processorFeeId: 'fee-2',
      status: 'paid'
    }, 'Toggle processor fee status to paid');
  });

  it('calls runCommand with updateProcessorFeeStatus literal toggling paid → unpaid', async () => {
    useQueryMock.mockReturnValue({
      data: [
        {
          id: 'fee-3',
          processorId: 'proc-1',
          saleId: null,
          paymentId: null,
          processingFeeTotal: '10.00',
          userFeeShare: '2.50',
          processorFeeShare: '7.50',
          userFeeStatus: 'collected',
          processorFeeStatus: 'paid',
          createdAt: '2026-05-01T00:00:00Z'
        }
      ],
      isLoading: false
    });
    const user = userEvent.setup();
    render(<ProcessorFeesGrid processorId="proc-1" />);
    await user.click(screen.getByRole('button', { name: /toggle/i }));
    expect(runCommand).toHaveBeenCalledWith('updateProcessorFeeStatus', {
      processorFeeId: 'fee-3',
      status: 'unpaid'
    }, 'Toggle processor fee status to unpaid');
  });

  it('shows the 200-row truncation banner when query returns exactly 200 rows', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      id: `fee-${i}`,
      processorId: 'proc-1',
      saleId: null,
      paymentId: null,
      processingFeeTotal: '10.00',
      userFeeShare: '2.50',
      processorFeeShare: '7.50',
      userFeeStatus: 'collected' as const,
      processorFeeStatus: 'paid' as const,
      createdAt: '2026-05-01T00:00:00Z'
    }));
    useQueryMock.mockReturnValue({ data: rows, isLoading: false });
    render(<ProcessorFeesGrid processorId="proc-1" />);
    expect(screen.getByText(/showing first 200 fees/i)).toBeInTheDocument();
  });
});
