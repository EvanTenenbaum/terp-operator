// @vitest-environment jsdom
/**
 * UX-O03: MediaView multi-select bulk publish
 * UX-O04: MediaView upload-complete signal (refetch interval + "N new uploads" badge)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useQueryMock = vi.fn();
const refetchMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: { id: 'user-1', role: 'operator' } }) }
    },
    queries: {
      grid: {
        useQuery: (...args: unknown[]) => useQueryMock(...args)
      },
      photographyQueue: {
        useQuery: () => ({ data: [] })
      }
    }
  }
}));

vi.mock('../components/OperatorGrid', () => ({
  OperatorGrid: ({
    rows,
    loading,
    onSelectionChange,
    columns
  }: {
    rows: any[];
    loading: boolean;
    onSelectionChange?: (rows: any[]) => void;
    columns?: any[];
    selectionActions?: (rows: any[]) => React.ReactNode;
  }) => (
    <div data-testid="operator-grid">
      {loading ? <span>Grid loading</span> : null}
      {rows.map((row: any) => (
        <button
          key={row.id}
          data-testid={`row-${row.id}`}
          onClick={() => onSelectionChange?.([row])}
        >
          {row.batchCode}
        </button>
      ))}
      {/* Multi-select: clicking the "select-all" triggers selection with all rows */}
      {rows.length > 1 && (
        <button
          data-testid="select-all"
          onClick={() => onSelectionChange?.(rows)}
        >
          Select all
        </button>
      )}
      {(columns ?? []).map((col: any) =>
        rows.map((row: any) => {
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
    </div>
  )
}));

vi.mock('../components/MediaBatchDrawer', () => ({
  MediaBatchDrawer: ({ batchId, onClose }: { batchId: string | null; onClose: () => void }) => (
    <div data-testid="media-batch-drawer" data-batch-id={batchId ?? ''}>
      <button onClick={onClose}>Close</button>
    </div>
  )
}));

vi.mock('../components/StatusPill', () => ({
  StatusPill: ({ status }: { status?: string }) => (
    <span data-testid="status-pill" data-status={status ?? 'unknown'}>
      {status ?? 'unknown'}
    </span>
  )
}));

const runCommandMock = vi.fn();
const pushToastMock = vi.fn();

vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({
    runCommand: runCommandMock,
    isRunning: false,
    setNextSuccessActions: vi.fn()
  })
}));

vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (state: any) => any) =>
    selector({
      pushToast: pushToastMock,
      isCellEditing: false
    })
}));

import { MediaView } from './MediaView';

// ---------------------------------------------------------------------------
// Fixture rows
// ---------------------------------------------------------------------------

const draftRow = {
  id: 'batch-draft',
  batchCode: 'DRAFT-1',
  name: 'Draft Batch',
  mediaStatus: 'in_progress',
  publishedMediaCount: 0,
  draftMediaCount: 2,
  hasPrimaryPhoto: false,
  hasPrimaryVideo: false,
  mediaUpdatedAt: null,
  createdAt: '2024-01-01T00:00:00Z'
};

const doneRow = {
  id: 'batch-done',
  batchCode: 'DONE-1',
  name: 'Done Batch',
  mediaStatus: 'done',
  publishedMediaCount: 3,
  draftMediaCount: 0,
  hasPrimaryPhoto: true,
  hasPrimaryVideo: false,
  mediaUpdatedAt: null,
  createdAt: '2024-01-01T00:00:00Z'
};

const draftRow2 = {
  id: 'batch-draft-2',
  batchCode: 'DRAFT-2',
  name: 'Draft Batch 2',
  mediaStatus: 'open',
  publishedMediaCount: 0,
  draftMediaCount: 1,
  hasPrimaryPhoto: false,
  hasPrimaryVideo: false,
  mediaUpdatedAt: null,
  createdAt: '2024-01-01T00:00:00Z'
};

describe('MediaView — UX-O03 bulk publish', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    runCommandMock.mockReset();
    pushToastMock.mockReset();
    runCommandMock.mockResolvedValue({ ok: true });
  });

  it('does not show bulk publish button when only one row is selected', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [draftRow, draftRow2],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    render(<MediaView />);

    // Select one row
    await user.click(screen.getByTestId('row-batch-draft'));
    expect(screen.queryByTestId('bulk-publish-button')).not.toBeInTheDocument();
  });

  it('shows bulk publish button when multiple rows are selected', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [draftRow, draftRow2],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    render(<MediaView />);

    await user.click(screen.getByTestId('select-all'));
    const btn = screen.getByTestId('bulk-publish-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Publish 2 selected');
  });

  it('calls publishBatchMedia for each selected batch with draft media', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [draftRow, draftRow2],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    render(<MediaView />);

    await user.click(screen.getByTestId('select-all'));
    await user.click(screen.getByTestId('bulk-publish-button'));

    // Both rows have draftMediaCount > 0, so publishBatchMedia called twice
    const publishCalls = runCommandMock.mock.calls.filter(
      ([cmd]: string[]) => cmd === 'publishBatchMedia'
    );
    expect(publishCalls.length).toBe(2);
  });

  it('skips rows with no draft media and toasts "No draft media" when none qualify', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [doneRow, { ...doneRow, id: 'batch-done-2', batchCode: 'DONE-2' }],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    render(<MediaView />);

    // Trigger select-all (2 done rows)
    await user.click(screen.getByTestId('select-all'));
    const btn = screen.getByTestId('bulk-publish-button');
    await user.click(btn);

    expect(pushToastMock).toHaveBeenCalledWith('No draft media on selected batches.', 'info');
    expect(runCommandMock).not.toHaveBeenCalled();
  });

  it('shows aggregate success toast after bulk publish', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [draftRow, draftRow2],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    render(<MediaView />);

    await user.click(screen.getByTestId('select-all'));
    await user.click(screen.getByTestId('bulk-publish-button'));

    // Toast should contain "published"
    const toastCall = pushToastMock.mock.calls.find(
      ([msg]: string[]) => typeof msg === 'string' && msg.includes('published')
    );
    expect(toastCall).toBeDefined();
  });
});

describe('MediaView — UX-O04 upload signal', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    pushToastMock.mockReset();
  });

  it('does not show the new-uploads badge initially', () => {
    useQueryMock.mockReturnValue({
      data: [draftRow],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    render(<MediaView />);
    expect(screen.queryByTestId('new-uploads-badge')).not.toBeInTheDocument();
  });

  it('shows the new-uploads badge when media count increases after a refetch', async () => {
    // First render: baseline established
    useQueryMock.mockReturnValue({
      data: [draftRow],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    const { rerender } = render(<MediaView />);
    // draftRow has publishedMediaCount:0 + draftMediaCount:2 = 2 total
    expect(screen.queryByTestId('new-uploads-badge')).not.toBeInTheDocument();

    // Simulate a refetch that returns 3 more media items (total jumps from 2 to 5)
    useQueryMock.mockReturnValue({
      data: [{ ...draftRow, draftMediaCount: 5 }],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    await act(async () => {
      rerender(<MediaView />);
    });

    const badge = screen.getByTestId('new-uploads-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('3 new uploads');
  });

  it('uses refetchInterval when open sessions exist', () => {
    useQueryMock.mockReturnValue({
      data: [draftRow],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    render(<MediaView />);

    // The query should be called with refetchInterval: 30000 after effect runs
    // (draftRow.mediaStatus is 'in_progress', not 'done')
    const callsWithInterval = (useQueryMock.mock.calls as unknown[][]).filter(
      (args) => (args[1] as { refetchInterval?: unknown } | undefined)?.refetchInterval === 30_000
    );
    // After the effect runs, the interval should be active
    expect(callsWithInterval.length).toBeGreaterThanOrEqual(1);
  });

  it('does not poll when all sessions are done', () => {
    useQueryMock.mockReturnValue({
      data: [doneRow],
      isLoading: false,
      isError: false,
      refetch: refetchMock
    });
    render(<MediaView />);

    // After effect runs with all-done data, refetchInterval should be false
    const callsWithFalseInterval = (useQueryMock.mock.calls as unknown[][]).filter(
      (args) => (args[1] as { refetchInterval?: unknown } | undefined)?.refetchInterval === false
    );
    expect(callsWithFalseInterval.length).toBeGreaterThanOrEqual(1);
  });
});
