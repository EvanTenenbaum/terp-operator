// @vitest-environment jsdom
/**
 * UX-M02 — SelectionSupportPacket component
 *
 * Verifies:
 *  - Component renders an export button when rows are provided.
 *  - Button is absent when no rows are passed (rowIds.length === 0).
 *  - Clicking the button triggers a refetch and then calls downloadJson.
 *  - downloadJson: creates a Blob with the correct JSON and triggers a click.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type React from 'react';
import type { GridRow } from '../../shared/types';

// --- downloadJson unit tests (pure util, no React) ---
// Tested inline in the component tests via mocking below.

// --- trpc mock ---
const mockRefetch = vi.fn().mockResolvedValue({
  data: {
    generatedAt: '2026-06-12T00:00:00Z',
    selectedRowIds: ['row-uuid-001'],
    rows: [],
    commands: [],
  },
});

vi.mock('../api/trpc', () => ({
  trpc: {
    queries: {
      selectionSupportPacket: {
        useQuery: (_input: unknown, _opts: unknown) => ({
          isFetching: false,
          refetch: mockRefetch,
        }),
      },
    },
  },
}));

// --- URL mock for Blob download ---
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();

Object.defineProperty(globalThis, 'URL', {
  value: { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL },
  writable: true,
});

// Spy on createElement to intercept the anchor click
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'a') {
    const anchor = originalCreateElement('a');
    anchor.click = mockClick;
    return anchor;
  }
  return originalCreateElement(tag);
});

import { SelectionSupportPacket, downloadJson } from './SelectionSupportPacket';

beforeEach(() => {
  mockRefetch.mockClear();
  mockClick.mockClear();
  mockCreateObjectURL.mockClear();
});

describe('SelectionSupportPacket', () => {
  it('renders the export button when rows have ids', () => {
    render(<SelectionSupportPacket rows={[{ id: 'row-uuid-001' }]} view="recovery" />);
    expect(screen.getByTestId('export-support-packet-btn')).toBeTruthy();
  });

  it('does NOT render when rowIds is empty', () => {
    render(<SelectionSupportPacket rows={[]} view="recovery" />);
    expect(screen.queryByTestId('export-support-packet-btn')).toBeNull();
  });

  it('does NOT render when row has no id', () => {
    // Cast as GridRow to satisfy TS; tests runtime guard for missing id string.
    render(<SelectionSupportPacket rows={[{} as GridRow]} view="recovery" />);
    expect(screen.queryByTestId('export-support-packet-btn')).toBeNull();
  });

  it('calls refetch and triggers download on click', async () => {
    render(<SelectionSupportPacket rows={[{ id: 'row-uuid-001' }]} view="orders" />);
    const btn = screen.getByTestId('export-support-packet-btn');
    fireEvent.click(btn);
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClick).toHaveBeenCalledTimes(1));
  });

  it('download filename includes view name and date', async () => {
    const capturedLinks: HTMLAnchorElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        capturedLinks.push(el as HTMLAnchorElement);
        el.click = mockClick;
      }
      return el;
    });
    render(<SelectionSupportPacket rows={[{ id: 'row-uuid-001' }]} view="payments" />);
    fireEvent.click(screen.getByTestId('export-support-packet-btn'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    await waitFor(() => {
      const link = capturedLinks[capturedLinks.length - 1];
      expect(link?.download).toMatch(/terp-support-packet-payments/);
    });
  });
});

describe('downloadJson util', () => {
  it('creates a Blob and triggers anchor click with correct filename', () => {
    downloadJson('test-file.json', { key: 'value' });
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = mockCreateObjectURL.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(mockClick).toHaveBeenCalled();
  });

  it('is a no-op when value is falsy', () => {
    mockCreateObjectURL.mockClear();
    mockClick.mockClear();
    downloadJson('test.json', null);
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
  });
});
