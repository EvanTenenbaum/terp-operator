// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useConfirm } from './useConfirm';
import { ConfirmRoot } from '../components/ConfirmRoot';
import { useConfirmStore } from '../store/confirmStore';

// --------------------------------------------------------------------------
// Test harness — renders ConfirmRoot + a button that calls useConfirm.
// Records the resolved boolean for assertion.
// --------------------------------------------------------------------------
function Harness({ opts = {} }: { opts?: Partial<Parameters<ReturnType<typeof useConfirm>>[0]> } = {}) {
  const confirm = useConfirm();
  const [result, setResult] = useState<boolean | null>(null);

  return (
    <>
      <ConfirmRoot />
      <button
        data-testid="trigger"
        onClick={() => {
          void confirm({ title: 'Are you sure?', ...opts }).then((ok) => setResult(ok));
        }}
      >
        Open
      </button>
      {result !== null && (
        <div data-testid="result">{String(result)}</div>
      )}
    </>
  );
}

// Reset store state between tests
beforeEach(() => {
  useConfirmStore.setState({ pending: null });
});

describe('useConfirm + ConfirmRoot', () => {
  it('renders no dialog initially', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows dialog when confirm() is called', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('renders optional body text', async () => {
    render(<Harness opts={{ body: 'This cannot be undone.' }} />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('resolves true when primary (Confirm) button is clicked', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('confirm-primary'));

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('true');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when Cancel button is clicked', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('confirm-cancel'));

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('false');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when Escape is pressed', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // Escape is handled by useFocusTrap on the container element
    const container = screen.getByRole('dialog');
    fireEvent.keyDown(container, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('false');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when backdrop is clicked', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('confirm-backdrop'));

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('false');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does NOT resolve on backdrop click when persist:true', async () => {
    render(<Harness opts={{ persist: true }} />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('confirm-backdrop'));

    // Dialog should still be open, no result
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('result')).not.toBeInTheDocument();
  });

  it('uses custom labels', async () => {
    render(<Harness opts={{ primaryLabel: 'Delete', cancelLabel: 'Keep' }} />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('applies danger styling when tone is "danger"', async () => {
    render(<Harness opts={{ tone: 'danger' }} />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const primaryBtn = screen.getByTestId('confirm-primary');
    // Danger tone button should not use 'primary-button' class
    expect(primaryBtn.classList.contains('primary-button')).toBe(false);
    // Should have bg-danger somewhere in the class string
    expect(primaryBtn.className).toContain('bg-danger');
  });

  it('has correct accessibility attributes', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
    expect(screen.getByText('Are you sure?')).toHaveAttribute('id', 'confirm-dialog-title');
  });
});
