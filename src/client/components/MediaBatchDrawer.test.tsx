// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useQueryMock = vi.fn();
const authMeMock = vi.fn();
vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      batchMediaList: { useQuery: (...args: unknown[]) => useQueryMock(...args) }
    },
    auth: { me: { useQuery: (...args: unknown[]) => authMeMock(...args) } }
  }
}));

const runCommand = vi.fn().mockResolvedValue({ ok: true, affectedIds: [], commandId: 'cmd-1' });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));

import { MediaBatchDrawer } from './MediaBatchDrawer';

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

function renderDrawer(props?: Partial<{
  batchId: string | null;
  batchCode: string;
  batchName: string;
  onClose: () => void;
}>) {
  const onClose = props?.onClose ?? vi.fn();
  const batchId = (props && 'batchId' in props) ? props.batchId! : 'batch-1';
  return {
    onClose,
    ...render(
      <MediaBatchDrawer
        batchId={batchId}
        batchCode={props?.batchCode ?? 'BC-001'}
        batchName={props?.batchName ?? 'Rose Lot'}
        onClose={onClose}
      />
    )
  };
}

describe('MediaBatchDrawer', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    runCommand.mockClear();
    authMeMock.mockReturnValue({ data: { role: 'owner' } });
    useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ─── Drawer shell ──────────────────────────────────────────────────────────

  describe('drawer visibility', () => {
    it('renders batch code and name in header when open', () => {
      renderDrawer();
      expect(screen.getByText('BC-001')).toBeInTheDocument();
      expect(screen.getByText('Rose Lot')).toBeInTheDocument();
    });

    it('calls onClose when the close button is clicked', async () => {
      // InspectorDrawer chrome renders a backdrop close + header close, both
      // accessibly named; clicking either must call onClose.
      const user = userEvent.setup();
      const { onClose } = renderDrawer();
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      await user.click(closeButtons[closeButtons.length - 1]!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders nothing when batchId is null (drawer closed)', () => {
      render(<MediaBatchDrawer batchId={null} batchCode="BC-001" batchName="Rose Lot" onClose={vi.fn()} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('BC-001')).not.toBeInTheDocument();
    });

    it('renders the inspector drawer dialog when batchId is provided', () => {
      renderDrawer();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  // ─── Media list ────────────────────────────────────────────────────────────

  describe('media list', () => {
    it('renders loading state', () => {
      useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
      renderDrawer();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('renders error state with retry button', () => {
      const refetch = vi.fn();
      useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
      renderDrawer();
      expect(screen.getByText(/error/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('calls refetch when retry is clicked', async () => {
      const refetch = vi.fn();
      const user = userEvent.setup();
      useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
      renderDrawer();
      await user.click(screen.getByRole('button', { name: /retry/i }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('renders empty state', () => {
      useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
      renderDrawer();
      expect(screen.getByText(/no media/i)).toBeInTheDocument();
    });

    it('renders populated rows with thumbnail for photo', () => {
      useQueryMock.mockReturnValue({ data: [makeMedia()], isLoading: false, isError: false, refetch: vi.fn() });
      renderDrawer();
      expect(screen.getByText('flower.jpg')).toBeInTheDocument();
      const img = screen.getByRole('img', { name: /flower\.jpg/ });
      expect(img).toHaveAttribute('src', '/api/media/media-1/thumb');
    });

    it('renders icon fallback for video without thumbnail', () => {
      useQueryMock.mockReturnValue({
        data: [makeMedia({ mediaType: 'video', hasThumbnail: false, originalFilename: 'grow.mp4', mimeType: 'video/mp4' })],
        isLoading: false, isError: false, refetch: vi.fn()
      });
      renderDrawer();
      expect(screen.getByText('grow.mp4')).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: /grow\.mp4/ })).not.toBeInTheDocument();
    });

    it('shows role and status text', () => {
      useQueryMock.mockReturnValue({
        data: [makeMedia({ role: 'primary_photo', status: 'published' })],
        isLoading: false, isError: false, refetch: vi.fn()
      });
      renderDrawer();
      expect(screen.getByText('primary_photo')).toBeInTheDocument();
      expect(screen.getByText('published')).toBeInTheDocument();
    });

    it('shows published date or em dash', () => {
      useQueryMock.mockReturnValue({
        data: [
          makeMedia({ publishedAt: '2024-02-01T00:00:00Z' }),
          makeMedia({ id: 'media-2', publishedAt: null })
        ],
        isLoading: false, isError: false, refetch: vi.fn()
      });
      renderDrawer();
      expect(screen.getByText(/2024/)).toBeInTheDocument();
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    });

    it('shows set primary photo action for non-primary photo rows', async () => {
      const user = userEvent.setup();
      useQueryMock.mockReturnValue({ data: [makeMedia()], isLoading: false, isError: false, refetch: vi.fn() });
      renderDrawer();
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
        isLoading: false, isError: false, refetch: vi.fn()
      });
      renderDrawer();
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
      useQueryMock.mockReturnValue({ data: [makeMedia({ role: 'primary_photo' })], isLoading: false, isError: false, refetch: vi.fn() });
      renderDrawer();
      await user.click(screen.getByRole('button', { name: /demote/i }));
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
      useQueryMock.mockReturnValue({ data: [makeMedia()], isLoading: false, isError: false, refetch: vi.fn() });
      renderDrawer();
      await user.click(screen.getByRole('button', { name: /^publish$/i }));
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
      useQueryMock.mockReturnValue({ data: [makeMedia()], isLoading: false, isError: false, refetch: vi.fn() });
      renderDrawer();
      await user.click(screen.getByRole('button', { name: /^delete$/i }));
      expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      expect(cancelBtn).toBeInTheDocument();
      await user.click(cancelBtn);
      expect(screen.queryByRole('button', { name: /confirm delete/i })).not.toBeInTheDocument();
      expect(runCommand).not.toHaveBeenCalled();
    });

    it('runs deleteBatchMedia on confirm click', async () => {
      const user = userEvent.setup();
      useQueryMock.mockReturnValue({ data: [makeMedia()], isLoading: false, isError: false, refetch: vi.fn() });
      renderDrawer();
      await user.click(screen.getByRole('button', { name: /^delete$/i }));
      await user.click(screen.getByRole('button', { name: /confirm delete/i }));
      await waitFor(() => {
        expect(runCommand).toHaveBeenCalledWith(
          'deleteBatchMedia',
          { mediaId: 'media-1' },
          'Delete media'
        );
      });
    });

    it('does not show write action buttons for viewer users', () => {
      authMeMock.mockReturnValue({ data: { role: 'viewer' } });
      useQueryMock.mockReturnValue({
        data: [makeMedia({ status: 'draft', role: 'additional' })],
        isLoading: false, isError: false, refetch: vi.fn()
      });
      renderDrawer();
      expect(screen.queryByRole('button', { name: /set primary photo/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
      // Data still visible
      expect(screen.getByText('flower.jpg')).toBeInTheDocument();
      expect(screen.getByText('additional')).toBeInTheDocument();
      expect(screen.getByText('draft')).toBeInTheDocument();
    });
  });

  // ─── Mobile upload ─────────────────────────────────────────────────────────

  describe('mobile upload', () => {
    it('copies mobile upload link to clipboard when available', async () => {
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true
      });
      renderDrawer();
      await user.click(screen.getByRole('button', { name: /copy mobile upload link/i }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/photography/mobile/batch-1'));
      });
    });

    it('opens mobile upload in new tab via fallback when clipboard unavailable', async () => {
      const user = userEvent.setup();
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true
      });
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      renderDrawer();
      await user.click(screen.getByRole('button', { name: /open mobile upload/i }));
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('/photography/mobile/batch-1'),
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('shows mint share link button for owner', () => {
      authMeMock.mockReturnValue({ data: { role: 'owner' } });
      renderDrawer();
      expect(screen.getByRole('button', { name: /mint share link/i })).toBeInTheDocument();
    });

    it('hides mint share link button for viewer', () => {
      authMeMock.mockReturnValue({ data: { role: 'viewer' } });
      renderDrawer();
      expect(screen.queryByRole('button', { name: /mint share link/i })).not.toBeInTheDocument();
    });
  });

  // ─── Desktop upload zone ───────────────────────────────────────────────────

  describe('desktop upload zone', () => {
    it('renders upload zone with file input', () => {
      renderDrawer();
      expect(document.querySelector('.media-upload-zone')).toBeInTheDocument();
      expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    });

    it('adds media-upload-zone-active class on dragover and removes on dragleave', () => {
      renderDrawer();
      const zone = document.querySelector('.media-upload-zone') as HTMLElement;
      expect(zone).not.toHaveClass('media-upload-zone-active');
      fireEvent.dragOver(zone);
      expect(zone).toHaveClass('media-upload-zone-active');
      fireEvent.dragLeave(zone);
      expect(zone).not.toHaveClass('media-upload-zone-active');
    });

    it('calls XHR open+send then runCommand(uploadBatchMedia) for photo', async () => {
      const refetchMock = vi.fn().mockResolvedValue(undefined);
      useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: refetchMock });

      const responseData = {
        filePath: '/uploads/abc/test.jpg',
        originalFilename: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        thumbnailPath: null,
        mediumPath: null,
      };

      // Use a regular function (not arrow) so `new` works correctly as a constructor
      type XhrInst = {
        open: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
        upload: { onprogress: unknown };
        onload: (() => void) | null;
        onerror: unknown;
        status: number;
        responseText: string;
      };
      const instances: XhrInst[] = [];
      const MockXHR = vi.fn(function(this: XhrInst) {
        this.open = vi.fn();
        this.send = vi.fn();
        this.upload = { onprogress: null };
        this.onload = null;
        this.onerror = null;
        this.status = 200;
        this.responseText = JSON.stringify(responseData);
        instances.push(this);
      });
      vi.stubGlobal('XMLHttpRequest', MockXHR);

      renderDrawer({ batchId: 'batch-1' });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
      Object.defineProperty(input, 'files', {
        value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
        configurable: true,
      });
      fireEvent.change(input);

      // XHR should be created and methods called synchronously before the await
      expect(instances.length).toBe(1);
      const xhr = instances[0];
      expect(xhr.open).toHaveBeenCalledWith('POST', '/api/upload/media');
      expect(xhr.send).toHaveBeenCalled();

      // Simulate server response
      expect(xhr.onload).not.toBeNull();
      xhr.onload!();

      await waitFor(() => {
        expect(runCommand).toHaveBeenCalledWith(
          'uploadBatchMedia',
          expect.objectContaining({
            batchId: 'batch-1',
            filePath: '/uploads/abc/test.jpg',
            mediaType: 'photo',
          }),
          'Upload test.jpg'
        );
      });
    });

    it('classifies video files as mediaType video', async () => {
      const refetchMock = vi.fn().mockResolvedValue(undefined);
      useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: refetchMock });

      const responseData = {
        filePath: '/uploads/abc/clip.mp4',
        originalFilename: 'clip.mp4',
        fileSize: 2048,
        mimeType: 'video/mp4',
        thumbnailPath: null,
        mediumPath: null,
      };

      type XhrInst = {
        open: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
        upload: { onprogress: unknown };
        onload: (() => void) | null;
        onerror: unknown;
        status: number;
        responseText: string;
      };
      const instances: XhrInst[] = [];
      const MockXHR = vi.fn(function(this: XhrInst) {
        this.open = vi.fn();
        this.send = vi.fn();
        this.upload = { onprogress: null };
        this.onload = null;
        this.onerror = null;
        this.status = 200;
        this.responseText = JSON.stringify(responseData);
        instances.push(this);
      });
      vi.stubGlobal('XMLHttpRequest', MockXHR);

      renderDrawer({ batchId: 'batch-1' });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['data'], 'clip.mp4', { type: 'video/mp4' });
      Object.defineProperty(input, 'files', {
        value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
        configurable: true,
      });
      fireEvent.change(input);

      expect(instances.length).toBe(1);
      const xhr = instances[0];
      expect(xhr.onload).not.toBeNull();
      xhr.onload!();

      await waitFor(() => {
        expect(runCommand).toHaveBeenCalledWith(
          'uploadBatchMedia',
          expect.objectContaining({ mediaType: 'video' }),
          'Upload clip.mp4'
        );
      });
    });
  });
});
