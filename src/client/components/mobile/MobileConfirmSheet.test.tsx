// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileConfirmSheet } from './MobileConfirmSheet';

describe('MobileConfirmSheet', () => {
  it('renders nothing when closed', () => {
    render(
      <MobileConfirmSheet open={false} summary="Recording $500" onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog with summary when open', () => {
    render(
      <MobileConfirmSheet open={true} summary="Recording $28,400 from Green Leaf via Wire" onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Recording $28,400 from Green Leaf via Wire')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn();
    render(
      <MobileConfirmSheet open={true} summary="Confirm?" onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    render(
      <MobileConfirmSheet open={true} summary="Confirm?" onConfirm={() => {}} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when backdrop clicked', () => {
    const onCancel = vi.fn();
    render(
      <MobileConfirmSheet open={true} summary="Confirm?" onConfirm={() => {}} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByTestId('confirm-sheet-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
