// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));

import { MediaUploadMobile } from './MediaUploadMobile';

describe('MediaUploadMobile', () => {
  let xhrMock: {
    open: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
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

    xhrMock = {
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
});
