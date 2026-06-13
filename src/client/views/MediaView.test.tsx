// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useQueryMock = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      grid: {
        useQuery: (...args: unknown[]) => useQueryMock(...args)
      }
    }
  }
}));

vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: ({ rows, loading, onSelectionChange, selectionActions, columns }: any) => (
    <div data-testid="operator-grid">
      {loading ? <span>Grid loading</span> : null}
      {rows.map((row: any) => (
        <button key={row.id} data-testid={`row-${row.id}`} onClick={() => onSelectionChange?.([row])}>
          {row.batchCode}
        </button>
      ))}
      {/* Render column cells inline so tests can verify renderers */}
      {rows.map((row: any) =>
        (columns ?? []).map((col: any) => {
          const field = col.field ?? col.colId;
          if (col.cellRenderer) {
            return (
              <div key={`${row.id}-${field}`} data-testid={`cell-${row.id}-${field}`}>
                {col.cellRenderer({ value: row[field] })}
              </div>
            );
          }
          if (col.valueGetter) {
            const computed = col.valueGetter({ data: row });
            return (
              <div key={`${row.id}-${field}`} data-testid={`cell-${row.id}-${field}`}>
                {computed}
              </div>
            );
          }
          return null;
        })
      )}
      {selectionActions ? <div data-testid="selection-actions">{selectionActions(rows)}</div> : null}
    </div>
  )
}));

vi.mock('../components/MediaBatchDrawer', () => ({
  MediaBatchDrawer: ({ batchId, batchCode, batchName, onClose }: { batchId: string | null; batchCode: string; batchName: string; onClose: () => void }) => (
    <div data-testid="media-batch-drawer" data-batch-id={batchId}>
      <button onClick={onClose}>Close drawer</button>
      <span>{batchCode}</span>
      <span>{batchName}</span>
    </div>
  )
}));

// StatusPill renders a span with the status label; mock it with a data attribute
// so tests can assert the canonical value was passed without coupling to pill styles.
vi.mock('../components/StatusPill', () => ({
  StatusPill: ({ status }: { status?: string }) => (
    <span data-testid="status-pill" data-status={status ?? 'unknown'}>
      {status ?? 'unknown'}
    </span>
  )
}));

import { MediaView } from './MediaView';

const baseRow = {
  id: 'batch-1',
  batchCode: 'B001',
  name: 'Test Batch',
  mediaStatus: 'open',
  mediaUpdatedAt: null,
  publishedMediaCount: 0,
  draftMediaCount: 0,
  hasPrimaryPhoto: false,
  hasPrimaryVideo: false,
  createdAt: '2024-01-01T00:00:00Z'
};

describe('MediaView', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it('shows loading state on grid', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<MediaView />);
    expect(screen.getByText('Grid loading')).toBeInTheDocument();
  });

  it('drawer renders with no batch selected by default', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<MediaView />);
    const drawer = screen.getByTestId('media-batch-drawer');
    expect(drawer).not.toHaveAttribute('data-batch-id');
  });

  it('renders MediaBatchDrawer with selected batch data', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [baseRow],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    await user.click(screen.getByTestId('row-batch-1'));
    const drawer = screen.getByTestId('media-batch-drawer');
    expect(drawer).toHaveAttribute('data-batch-id', 'batch-1');
    expect(drawer).toHaveTextContent('B001');
    expect(drawer).toHaveTextContent('Test Batch');
  });

  it('does not render selection actions in grid toolbar', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [baseRow],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    await user.click(screen.getByTestId('row-batch-1'));
    expect(screen.queryByTestId('selection-actions')).not.toBeInTheDocument();
  });

  // UX-O01: canonical mediaStatus column renders via StatusPill

  it('renders the canonical mediaStatus column via StatusPill for each row', () => {
    useQueryMock.mockReturnValue({
      data: [{ ...baseRow, mediaStatus: 'done' }],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    const pill = screen.getByTestId('status-pill');
    expect(pill).toHaveAttribute('data-status', 'done');
  });

  it('passes the canonical mediaStatus value "open" to StatusPill', () => {
    useQueryMock.mockReturnValue({
      data: [{ ...baseRow, mediaStatus: 'open' }],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    const pill = screen.getByTestId('status-pill');
    expect(pill).toHaveAttribute('data-status', 'open');
  });

  it('passes the canonical mediaStatus value "in_progress" to StatusPill', () => {
    useQueryMock.mockReturnValue({
      data: [{ ...baseRow, mediaStatus: 'in_progress' }],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    const pill = screen.getByTestId('status-pill');
    expect(pill).toHaveAttribute('data-status', 'in_progress');
  });

  it('passes undefined mediaStatus gracefully to StatusPill (null/missing server field)', () => {
    const { mediaStatus: _omit, ...rowWithoutStatus } = baseRow;
    useQueryMock.mockReturnValue({
      data: [rowWithoutStatus],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    const pill = screen.getByTestId('status-pill');
    // StatusPill mock renders 'unknown' when status is undefined
    expect(pill).toHaveAttribute('data-status', 'unknown');
  });

  // UX-O01: secondary activity summary column (count-derived heuristic)

  it('shows "No media" activity when no media counts present', () => {
    useQueryMock.mockReturnValue({
      data: [{ ...baseRow, publishedMediaCount: 0, draftMediaCount: 0 }],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    expect(screen.getByTestId('cell-batch-1-mediaActivitySummary')).toHaveTextContent('No media');
  });

  it('shows "Has media" activity for total < 3', () => {
    useQueryMock.mockReturnValue({
      data: [{ ...baseRow, publishedMediaCount: 1, draftMediaCount: 1 }],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    expect(screen.getByTestId('cell-batch-1-mediaActivitySummary')).toHaveTextContent('Has media');
  });

  it('shows "Has media (3+)" activity for total >= 3', () => {
    useQueryMock.mockReturnValue({
      data: [{ ...baseRow, publishedMediaCount: 2, draftMediaCount: 1 }],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    expect(screen.getByTestId('cell-batch-1-mediaActivitySummary')).toHaveTextContent('Has media (3+)');
  });

  it('shows error message when grid query fails', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<MediaView />);
    expect(screen.getByText(/Error loading queue/i)).toBeInTheDocument();
  });
});
