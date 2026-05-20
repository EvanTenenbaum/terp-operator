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

import { MediaDetailPanel } from './MediaDetailPanel';

function makeMedia(overrides: Partial<ReturnType<typeof baseMedia>> = {}) {
  return { ...baseMedia(), ...overrides };
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

describe('MediaDetailPanel', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    runCommand.mockClear();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<MediaDetailPanel batchId="batch-1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    const refetch = vi.fn();
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<MediaDetailPanel batchId="batch-1" />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls refetch when retry is clicked', async () => {
    const refetch = vi.fn();
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<MediaDetailPanel batchId="batch-1" />);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders empty state with CTA', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<MediaDetailPanel batchId="batch-1" />);
    expect(screen.getByText(/no media/i)).toBeInTheDocument();
  });

  it('renders populated rows with thumbnail for photo', () => {
    useQueryMock.mockReturnValue({
      data: [makeMedia()],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    expect(screen.getByText('flower.jpg')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: /flower\.jpg/ });
    expect(img).toHaveAttribute('src', '/api/media/media-1/thumb');
  });

  it('renders icon fallback for video without thumbnail', () => {
    useQueryMock.mockReturnValue({
      data: [makeMedia({ mediaType: 'video', hasThumbnail: false, originalFilename: 'grow.mp4', mimeType: 'video/mp4' })],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    expect(screen.getByText('grow.mp4')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /grow\.mp4/ })).not.toBeInTheDocument();
  });

  it('shows role and status text', () => {
    useQueryMock.mockReturnValue({
      data: [makeMedia({ role: 'primary_photo', status: 'published' })],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    expect(screen.getByText('primary_photo')).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
  });

  it('shows published date or em dash', () => {
    useQueryMock.mockReturnValue({
      data: [
        makeMedia({ publishedAt: '2024-02-01T00:00:00Z' }),
        makeMedia({ id: 'media-2', publishedAt: null })
      ],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    // toLocaleDateString output varies by locale; check for the year which is stable
    expect(screen.getByText(/2024/)).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('shows set primary photo action for non-primary photo rows', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [makeMedia({ mediaType: 'photo', role: 'additional' })],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    const btn = screen.getByRole('button', { name: /set primary photo/i });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith(
        'setBatchMediaRole',
        { mediaId: 'media-1', role: 'primary_photo' },
        'Set primary photo'
      );
    });
  });

  it('shows set primary video action for non-primary video rows', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [makeMedia({ mediaType: 'video', role: 'additional', originalFilename: 'grow.mp4', mimeType: 'video/mp4' })],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    const btn = screen.getByRole('button', { name: /set primary video/i });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith(
        'setBatchMediaRole',
        { mediaId: 'media-1', role: 'primary_video' },
        'Set primary video'
      );
    });
  });

  it('shows demote action for non-additional rows', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [makeMedia({ role: 'primary_photo' })],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    const btn = screen.getByRole('button', { name: /demote/i });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith(
        'setBatchMediaRole',
        { mediaId: 'media-1', role: 'additional' },
        'Demote media'
      );
    });
  });

  it('shows publish action for draft rows', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [makeMedia({ status: 'draft' })],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    const btn = screen.getByRole('button', { name: /publish/i });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith(
        'publishBatchMedia',
        { mediaId: 'media-1' },
        'Publish media'
      );
    });
  });

  it('shows two-step delete confirm and cancel', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [makeMedia()],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteBtn);
    const confirmBtn = screen.getByRole('button', { name: /confirm delete/i });
    expect(confirmBtn).toBeInTheDocument();
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(cancelBtn).toBeInTheDocument();
    await user.click(cancelBtn);
    expect(screen.queryByRole('button', { name: /confirm delete/i })).not.toBeInTheDocument();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('runs deleteBatchMedia on second confirm click', async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({
      data: [makeMedia()],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));
    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith(
        'deleteBatchMedia',
        { mediaId: 'media-1' },
        'Delete media'
      );
    });
  });

  it('copies mobile upload link to clipboard when available', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true
    });
    useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<MediaDetailPanel batchId="batch-1" />);
    const copyBtn = screen.getByRole('button', { name: /copy mobile upload link/i });
    await user.click(copyBtn);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/photography/mobile/batch-1'));
    });
  });

  it('opens mobile upload in new tab via fallback button when clipboard unavailable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<MediaDetailPanel batchId="batch-1" />);
    const openBtn = screen.getByRole('button', { name: /open mobile upload/i });
    await user.click(openBtn);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/photography/mobile/batch-1'),
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('does not show write action buttons for viewer users', () => {
    authMeMock.mockReturnValue({ data: { role: 'viewer' } });
    useQueryMock.mockReturnValue({
      data: [makeMedia({ status: 'draft', role: 'additional' })],
      isLoading: false,
      isError: false
    });
    render(<MediaDetailPanel batchId="batch-1" />);
    expect(screen.queryByRole('button', { name: /set primary photo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    // Thumbnail, filename, role, status should still be visible
    expect(screen.getByText('flower.jpg')).toBeInTheDocument();
    expect(screen.getByText('additional')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });
});
