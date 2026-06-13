// @vitest-environment jsdom
/**
 * UX-A15 — "Sheet downloaded, but Recent Sheets snapshot failed" pill with a
 * "Retry snapshot" action. The retry re-runs the EXISTING snapshot call path
 * (createCustomerSheetSnapshot) with the payload captured at export time.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SnapshotRetryPill } from './SnapshotRetryPill';

const ERROR = 'Sheet downloaded, but Recent Sheets snapshot failed.';

describe('<SnapshotRetryPill>', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<SnapshotRetryPill error={null} canRetry={true} busy={false} onRetry={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the error pill text and a Retry snapshot button', () => {
    render(<SnapshotRetryPill error={ERROR} canRetry={true} busy={false} onRetry={vi.fn()} />);
    expect(screen.getByTestId('snapshot-error-pill').textContent).toBe(ERROR);
    expect(screen.getByTestId('retry-snapshot').textContent).toBe('Retry snapshot');
  });

  it('clicking Retry snapshot calls onRetry', () => {
    const onRetry = vi.fn();
    render(<SnapshotRetryPill error={ERROR} canRetry={true} busy={false} onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId('retry-snapshot'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables retry while a command is running', () => {
    render(<SnapshotRetryPill error={ERROR} canRetry={true} busy={true} onRetry={vi.fn()} />);
    expect((screen.getByTestId('retry-snapshot') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables retry with an explanatory title when no payload was captured', () => {
    render(<SnapshotRetryPill error={ERROR} canRetry={false} busy={false} onRetry={vi.fn()} />);
    const button = screen.getByTestId('retry-snapshot') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/export the sheet again/);
  });
});
