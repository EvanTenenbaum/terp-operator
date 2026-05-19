// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const runCommand = vi.fn().mockResolvedValue({ ok: true, affectedIds: ['media-1'], commandId: 'cmd-1' });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));

const fetchMock = vi.fn().mockResolvedValue({ ok: true });
Object.defineProperty(globalThis, 'fetch', {
  value: fetchMock,
  writable: true,
  configurable: true
});

import { MediaUploadMobile, MediaUploadMobileRoute } from './MediaUploadMobile';

describe('MediaUploadMobile', () => {
  let xhrMock: {
    open: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    setRequestHeader: ReturnType<typeof vi.fn>;
    upload: { onprogress: ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    status: number;
    responseText: string;
  };

  beforeEach(() => {
    runCommand.mockClear();
    fetchMock.mockClear();

    xhrMock = {
      open: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
      setRequestHeader: vi.fn(),
      upload: { onprogress: null },
      onload: null,
      onerror: null,
      onabort: null,
      status: 200,
      responseText: JSON.stringify({
        fileId: 'file-1',
        filePath: '/uploads/file-1.jpg',
        originalFilename: 'photo.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        thumbnailPath: '/uploads/thumbs/file-1.jpg',
        mediumPath: '/uploads/medium/file-1.jpg'
      })
    };

    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(
      function () {
        return xhrMock as unknown as XMLHttpRequest;
      } as unknown as typeof XMLHttpRequest
    );
  });

  it('calls runCommand with mediaType derived from mimeType and isPrimary false on success', async () => {
    const user = userEvent.setup();
    render(<MediaUploadMobile batchId="batch-1" />);

    const file = new File(['fake-image'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    // Simulate successful XHR response
    if (xhrMock.onload) {
      xhrMock.onload();
    }

    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledTimes(1);
    });

    expect(runCommand).toHaveBeenCalledWith(
      'uploadBatchMedia',
      expect.objectContaining({
        batchId: 'batch-1',
        fileId: 'file-1',
        filePath: '/uploads/file-1.jpg',
        originalFilename: 'photo.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        mediaType: 'photo',
        isPrimary: false,
        thumbnailPath: '/uploads/thumbs/file-1.jpg',
        mediumPath: '/uploads/medium/file-1.jpg'
      })
    );
  });

  it('shows API thumbnail preview after runCommand returns affectedIds', async () => {
    const user = userEvent.setup();
    render(<MediaUploadMobile batchId="batch-1" />);

    const file = new File(['fake-image'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    if (xhrMock.onload) {
      xhrMock.onload();
    }

    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledTimes(1);
    });

    const img = await screen.findByRole('img', { name: 'photo.jpg' });
    expect(img).toHaveAttribute('src', '/api/media/media-1/thumb');
    expect(img).not.toHaveAttribute('src', '/uploads/thumbs/file-1.jpg');
  });

  it('falls back to file icon when runCommand returns no affectedIds', async () => {
    runCommand.mockResolvedValueOnce({ ok: true, affectedIds: [], commandId: 'cmd-2' });

    const user = userEvent.setup();
    render(<MediaUploadMobile batchId="batch-1" />);

    const file = new File(['fake-image'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    if (xhrMock.onload) {
      xhrMock.onload();
    }

    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole('img', { name: 'photo.jpg' })).not.toBeInTheDocument();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('sends DELETE cleanup and shows generic failure when runCommand rejects after XHR success', async () => {
    runCommand.mockRejectedValueOnce(new Error('Command failed'));

    const user = userEvent.setup();
    render(<MediaUploadMobile batchId="batch-1" />);

    const file = new File(['fake-image'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    if (xhrMock.onload) {
      xhrMock.onload();
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upload/media/staged',
      expect.objectContaining({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: '/uploads/file-1.jpg',
          thumbnailPath: '/uploads/thumbs/file-1.jpg',
          mediumPath: '/uploads/medium/file-1.jpg'
        })
      })
    );

    expect(screen.getByText('Upload failed. Please try again.')).toBeInTheDocument();
  });

  it('aborts XHR on unmount and does not call runCommand if onload fires later', async () => {
    const abortMock = vi.fn();
    vi.spyOn(window, 'XMLHttpRequest').mockImplementation(
      function () {
        const mock = {
          open: vi.fn(),
          send: vi.fn(),
          setRequestHeader: vi.fn(),
          upload: { onprogress: null },
          onload: null,
          onerror: null,
          onabort: null,
          status: 200,
          responseText: JSON.stringify({
            fileId: 'file-1',
            filePath: '/uploads/file-1.jpg',
            originalFilename: 'photo.jpg',
            fileSize: 1024,
            mimeType: 'image/jpeg',
            thumbnailPath: '/uploads/thumbs/file-1.jpg',
            mediumPath: '/uploads/medium/file-1.jpg'
          }),
          abort: abortMock
        };
        xhrMock = mock as unknown as typeof xhrMock;
        return mock as unknown as XMLHttpRequest;
      } as unknown as typeof XMLHttpRequest
    );

    const user = userEvent.setup();
    const { unmount } = render(<MediaUploadMobile batchId="batch-1" />);

    const file = new File(['fake-image'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    unmount();

    expect(abortMock).toHaveBeenCalledTimes(1);

    // Simulate late onload firing after unmount
    if (xhrMock.onload) {
      xhrMock.onload();
    }

    // runCommand should never be called after unmount
    await new Promise((r) => setTimeout(r, 50));
    expect(runCommand).not.toHaveBeenCalled();
  });
});

describe('MediaUploadMobileRoute', () => {
  it('renders heading and upload button for valid batchId', () => {
    render(
      <MemoryRouter initialEntries={['/photography/mobile/batch-1']}>
        <Routes>
          <Route path="/photography/mobile/:batchId" element={<MediaUploadMobileRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Mobile Media Upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take Photo/Video' })).toBeInTheDocument();
  });

  it('shows missing batch message when batchId is absent', () => {
    render(
      <MemoryRouter initialEntries={['/photography/mobile/']}>
        <Routes>
          <Route path="/photography/mobile/:batchId?" element={<MediaUploadMobileRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/batch id is required/i)).toBeInTheDocument();
  });
});
