// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useQueryMock = vi.fn();
const authMeMock = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      batchMediaList: {
        useQuery: (...args: unknown[]) => useQueryMock(...args)
      }
    },
    auth: {
      me: {
        useQuery: (...args: unknown[]) => authMeMock(...args)
      }
    }
  }
}));

const runCommand = vi.fn().mockResolvedValue({ ok: true, affectedIds: ['media-1'], commandId: 'cmd-1' });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));

import { MediaBatchDrawer } from './MediaBatchDrawer';

function setup() {
  authMeMock.mockReturnValue({ data: { role: 'owner' } });
  useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
  render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
}

function baseMedia() {
  return {
    id: 'media-1',
    batchId: 'batch-1',
    mediaType: 'photo',
    role: 'additional',
    status: 'draft',
    originalFilename: 'flower.jpg',
    fileSize: 1024,
    mimeType: 'image/jpeg',
    hasThumbnail: true,
    publishedAt: null as string | null,
    replacedAt: null as string | null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };
}
function makeMedia(overrides: Partial<ReturnType<typeof baseMedia>> = {}) {
  return { ...baseMedia(), ...overrides };
}

describe('MediaBatchDrawer', () => {
  beforeEach(() => { useQueryMock.mockReset(); runCommand.mockClear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  // --- Shell tests (header + close) ---

  it('renders batch code and name in the header', () => {
    setup();
    expect(screen.getByText('BC-001')).toBeInTheDocument();
    expect(screen.getByText('Rose Lot')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close batch media drawer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // --- Media list tests ---

  it('renders loading state', () => {
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    const refetch = vi.fn();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders empty state', () => {
    setup();
    expect(screen.getByText(/no media/i)).toBeInTheDocument();
  });

  it('renders populated rows with thumbnail for photo', () => {
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [makeMedia()], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    expect(screen.getByText('flower.jpg')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /flower\.jpg/ })).toHaveAttribute('src', '/api/media/media-1/thumb');
  });

  it('shows role and status pills', () => {
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [makeMedia({ role: 'primary_photo', status: 'published' })], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    expect(screen.getByText('primary_photo')).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
  });

  it('runs setBatchMediaRole primary_photo on action click', async () => {
    const user = userEvent.setup();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [makeMedia({ role: 'additional' })], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /set primary photo/i }));
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith('setBatchMediaRole', { mediaId: 'media-1', role: 'primary_photo' }, 'Set primary photo');
    });
  });

  it('runs setBatchMediaRole primary_video on action click', async () => {
    const user = userEvent.setup();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [makeMedia({ mediaType: 'video', role: 'additional', originalFilename: 'clip.mp4', mimeType: 'video/mp4' })], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /set primary video/i }));
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith('setBatchMediaRole', { mediaId: 'media-1', role: 'primary_video' }, 'Set primary video');
    });
  });

  it('runs publishBatchMedia for draft rows', async () => {
    const user = userEvent.setup();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [makeMedia({ status: 'draft' })], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /publish/i }));
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith('publishBatchMedia', { mediaId: 'media-1' }, 'Publish media');
    });
  });

  it('two-step delete: confirm then cancel', async () => {
    const user = userEvent.setup();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [makeMedia()], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('button', { name: /confirm delete/i })).not.toBeInTheDocument();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('runs deleteBatchMedia on confirm', async () => {
    const user = userEvent.setup();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [makeMedia()], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith('deleteBatchMedia', { mediaId: 'media-1' }, 'Delete media');
    });
  });

  it('hides write actions for viewer role', () => {
    authMeMock.mockReturnValue({ data: { role: 'viewer' } });
    useQueryMock.mockReturnValue({ data: [makeMedia({ status: 'draft', role: 'additional' })], isLoading: false, isError: false, refetch: vi.fn() });
    render(<MediaBatchDrawer batchId="batch-1" batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /set primary photo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.getByText('flower.jpg')).toBeInTheDocument();
  });
});
