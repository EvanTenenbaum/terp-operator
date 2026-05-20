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

vi.mock('../components/MediaDetailPanel', () => ({
  MediaDetailPanel: ({ batchId }: { batchId: string }) => <div data-testid="media-detail-panel">{batchId}</div>
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

  it('shows selection placeholder when no row selected', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<MediaView />);
    expect(screen.getByText(/select a batch to manage its media/i)).toBeInTheDocument();
  });

  it('renders detail panel when a row is selected', async () => {
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
    expect(screen.getByTestId('media-detail-panel')).toHaveTextContent('batch-1');
  });

  it('renders mobile link action when a row is selected', async () => {
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
    const actions = screen.getByTestId('selection-actions');
    expect(actions).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /mobile link|mobile upload/i })
    ).toBeInTheDocument();
  });
});
