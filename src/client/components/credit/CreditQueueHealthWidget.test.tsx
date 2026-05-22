// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const queueHealthMock = vi.fn();

vi.mock('../../api/trpc', () => ({
  trpc: {
    credit: {
      creditRecomputeQueueHealth: {
        useQuery: (input: unknown, options: unknown) => queueHealthMock(input, options),
      },
    },
  },
}));

import { CreditQueueHealthWidget } from './CreditQueueHealthWidget';

interface HealthData {
  pendingCount: number;
  oldestPendingAgeSeconds: number | null;
  processingCount: number;
  doneCount: number;
  failedTerminalCount: number;
  staleProcessingCount: number;
}

function mockHealth(data: HealthData) {
  queueHealthMock.mockReturnValue({ data, isLoading: false });
}

describe('CreditQueueHealthWidget', () => {
  it('renders nothing while loading', () => {
    queueHealthMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<CreditQueueHealthWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('renders healthy state when all counts are zero', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 0, doneCount: 10, failedTerminalCount: 0, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    expect(screen.getByLabelText('Credit recompute queue health')).toBeInTheDocument();
    expect(screen.getByText(/Pending: 0/)).toBeInTheDocument();
  });

  it('highlights stale processing count in red', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 2, doneCount: 5, failedTerminalCount: 0, staleProcessingCount: 3 });
    render(<CreditQueueHealthWidget />);
    const staleEl = screen.getByText(/Stale: 3/);
    expect(staleEl.className).toContain('text-red-600');
  });

  it('highlights failed terminal count in red', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 0, doneCount: 5, failedTerminalCount: 2, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    const failedEl = screen.getByText(/Failed: 2/);
    expect(failedEl.className).toContain('text-red-600');
  });

  it('shows oldest pending age when pending count > 0', () => {
    mockHealth({ pendingCount: 3, oldestPendingAgeSeconds: 180, processingCount: 1, doneCount: 0, failedTerminalCount: 0, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    expect(screen.getByText(/Oldest: 3m/)).toBeInTheDocument();
  });

  it('uses amber border when unhealthy (stale or failed)', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 1, doneCount: 0, failedTerminalCount: 1, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    const widget = screen.getByLabelText('Credit recompute queue health');
    expect(widget.className).toContain('border-amber-300');
  });

  it('uses zinc border when healthy', () => {
    mockHealth({ pendingCount: 0, oldestPendingAgeSeconds: null, processingCount: 0, doneCount: 10, failedTerminalCount: 0, staleProcessingCount: 0 });
    render(<CreditQueueHealthWidget />);
    const widget = screen.getByLabelText('Credit recompute queue health');
    expect(widget.className).toContain('border-zinc-200');
  });
});
