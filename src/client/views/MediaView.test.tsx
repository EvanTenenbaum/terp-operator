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
  OperatorGrid: ({ rows, loading, onSelectionChange, selectionActions }: any) => (
    <div data-testid="operator-grid">
      {loading ? <span>Grid loading</span> : null}
      {rows.map((row: any) => (
        <button key={row.id} data-testid={`row-${row.id}`} onClick={() => onSelectionChange?.([row])}>
          {row.batchCode}
        </button>
      ))}
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

import { MediaView } from './MediaView';

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
      data: [
        {
          id: 'batch-1',
          batchCode: 'B001',
          name: 'Test Batch',
          mediaUpdatedAt: null,
          publishedMediaCount: 0,
          draftMediaCount: 0,
          hasPrimaryPhoto: false,
          hasPrimaryVideo: false,
          createdAt: '2024-01-01T00:00:00Z'
        }
      ],
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
      data: [
        {
          id: 'batch-1',
          batchCode: 'B001',
          name: 'Test Batch',
          mediaUpdatedAt: null,
          publishedMediaCount: 0,
          draftMediaCount: 0,
          hasPrimaryPhoto: false,
          hasPrimaryVideo: false,
          createdAt: '2024-01-01T00:00:00Z'
        }
      ],
      isLoading: false,
      isError: false
    });
    render(<MediaView />);
    await user.click(screen.getByTestId('row-batch-1'));
    expect(screen.queryByTestId('selection-actions')).not.toBeInTheDocument();
  });
});
