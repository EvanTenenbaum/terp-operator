// @vitest-environment jsdom
// TER-1627: CSV import textarea drag-and-drop tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Minimal mocks matching the existing focusTrap test pattern

const csvFocusRef = { current: null };
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: (_isOpen: boolean, _onClose?: () => void) => csvFocusRef,
}));

vi.mock('../hooks/useConfirm', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

vi.mock('../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: vi.fn().mockResolvedValue({ ok: true, toast: 'done' }), isRunning: false }),
  invalidateAffectedQueries: vi.fn(),
}));

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />,
}));

vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: { id: 'u-1', name: 'op', role: 'operator' } }) },
    },
    queries: {
      intakeQueue: {
        useQuery: () => ({ data: [], isLoading: false, isError: false }),
      },
      receiptPreview: {
        useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
      },
    },
    useUtils: () => ({
      queries: {
        intakeQueue: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
    }),
  },
}));

import { IntakeView } from './IntakeView';

/** Helper: build a minimal File-like object that satisfies drop handling */
function makeFile(name: string, content: string, type = 'text/csv'): File {
  return new File([content], name, { type });
}

/** Helper: fire a drop event with a FileList containing the given file */
async function dropFile(dropTarget: Element, file: File) {
  const dataTransfer = {
    files: [file] as unknown as FileList,
    items: [],
    types: ['Files'],
  };
  await act(async () => {
    dropTarget.dispatchEvent(
      Object.assign(new Event('dragover', { bubbles: true }), { dataTransfer })
    );
    dropTarget.dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true }), { dataTransfer })
    );
  });
}

describe('IntakeView CSV drag-and-drop (TER-1627)', () => {
  beforeEach(() => {
    // FileReader is not implemented in jsdom; provide a minimal synchronous stub
    vi.stubGlobal(
      'FileReader',
      class {
        result: string | null = null;
        onload: ((ev: { target: { result: string } }) => void) | null = null;
        readAsText(file: File) {
          // Synchronously resolve via microtask to match real async behaviour
          const reader = this;
          file.text().then((text) => {
            reader.result = text;
            reader.onload?.({ target: { result: text } });
          });
        }
      }
    );
  });

  it('opens the CSV import panel', async () => {
    const user = userEvent.setup();
    render(<IntakeView />);
    await user.click(screen.getByRole('button', { name: /csv import/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('populates the textarea when a .csv file is dropped', async () => {
    const user = userEvent.setup();
    render(<IntakeView />);
    await user.click(screen.getByRole('button', { name: /csv import/i }));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const dropZone = textarea.closest('.media-upload-zone') as Element;
    expect(dropZone).not.toBeNull();

    const csvContent = 'name,category\ntest-item,flower\n';
    await dropFile(dropZone, makeFile('test.csv', csvContent));

    // FileReader stub resolves asynchronously — wait for state update
    await act(async () => {
      await Promise.resolve();
    });

    expect(textarea.value).toBe(csvContent);
  });

  it('ignores a dropped non-.csv file', async () => {
    const user = userEvent.setup();
    render(<IntakeView />);
    await user.click(screen.getByRole('button', { name: /csv import/i }));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const initialValue = textarea.value;
    const dropZone = textarea.closest('.media-upload-zone') as Element;

    await dropFile(dropZone, makeFile('report.txt', 'some text', 'text/plain'));

    await act(async () => {
      await Promise.resolve();
    });

    // Value must be unchanged — only .csv / text/csv accepted
    expect(textarea.value).toBe(initialValue);
  });
});
