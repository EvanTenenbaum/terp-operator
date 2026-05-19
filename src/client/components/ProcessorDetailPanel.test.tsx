// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useQueryMock = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      processorWithTotals: {
        useQuery: (...args: unknown[]) => useQueryMock(...args)
      }
    }
  }
}));
vi.mock('./ProcessorFeesGrid', () => ({
  ProcessorFeesGrid: () => <div data-testid="fees-grid" />
}));

import { ProcessorDetailPanel } from './ProcessorDetailPanel';

describe('ProcessorDetailPanel', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it('renders the processor name in the header', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: false });
    render(
      <ProcessorDetailPanel processorId="proc-1" processorName="Stripe" onClose={() => {}} />
    );
    expect(screen.getByRole('heading', { name: 'Stripe' })).toBeInTheDocument();
  });

  it('renders the four totals values from the query', () => {
    useQueryMock.mockReturnValue({
      data: {
        id: 'proc-1',
        name: 'Stripe',
        totalFeesProcessed: '100.00',
        userFeesCollectible: '25.00',
        userFeesCollected: '50.00',
        processorFeesUnpaid: '75.00',
        feeType: 'percentage',
        feePercentage: '3.5',
        feeFixedAmount: null
      },
      isLoading: false
    });
    render(
      <ProcessorDetailPanel processorId="proc-1" processorName="Stripe" onClose={() => {}} />
    );
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: false });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ProcessorDetailPanel processorId="proc-1" processorName="Stripe" onClose={onClose} />
    );
    await user.click(screen.getByRole('button', { name: /close panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('embeds the ProcessorFeesGrid', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: false });
    render(
      <ProcessorDetailPanel processorId="proc-1" processorName="Stripe" onClose={() => {}} />
    );
    expect(screen.getByTestId('fees-grid')).toBeInTheDocument();
  });
});
