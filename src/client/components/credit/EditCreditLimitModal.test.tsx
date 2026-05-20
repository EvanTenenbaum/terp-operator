// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let isRunningValue = false;
const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('../useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: isRunningValue }),
}));

const focusTrapRef = { current: null };
const useFocusTrapMock = vi.fn((_isOpen: boolean, _onClose?: () => void) => focusTrapRef);
vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: (isOpen: boolean, onClose?: () => void) => useFocusTrapMock(isOpen, onClose),
}));

import { EditCreditLimitModal } from './EditCreditLimitModal';

const baseProps = {
  customerId: 'cust-1',
  currentLimit: 10_000,
  engineRecommendation: 12_000,
  ownerElevationThreshold: 18_000,
  source: 'engine' as const,
  open: true,
  onClose: () => {},
};

describe('EditCreditLimitModal - focus trap + Escape behavior', () => {
  beforeEach(() => {
    runCommand.mockClear();
    useFocusTrapMock.mockClear();
    isRunningValue = false;
  });

  it('wires useFocusTrap with isOpen=true and an onClose callback when modal is open', () => {
    render(<EditCreditLimitModal {...baseProps} />);
    expect(useFocusTrapMock).toHaveBeenCalled();
    const [isOpenArg, onCloseArg] = useFocusTrapMock.mock.calls[0]!;
    expect(isOpenArg).toBe(true);
    expect(typeof onCloseArg).toBe('function');
  });

  it('does not call useFocusTrap with isOpen=true when modal is closed', () => {
    render(<EditCreditLimitModal {...baseProps} open={false} />);
    // useFocusTrap may still be called (hook order rules), but should be called
    // with isOpen=false so the trap is inert.
    expect(useFocusTrapMock).toHaveBeenCalled();
    const [isOpenArg] = useFocusTrapMock.mock.calls[0]!;
    expect(isOpenArg).toBe(false);
  });

  it('Escape-to-close is guarded by !isRunning - onClose is NOT invoked when isRunning is true', () => {
    isRunningValue = true;
    const onClose = vi.fn();
    render(<EditCreditLimitModal {...baseProps} onClose={onClose} />);
    const [, onCloseArg] = useFocusTrapMock.mock.calls[0]!;
    // Simulate Escape firing the trap's onClose handler.
    (onCloseArg as () => void)();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape-to-close invokes onClose when isRunning is false', () => {
    isRunningValue = false;
    const onClose = vi.fn();
    render(<EditCreditLimitModal {...baseProps} onClose={onClose} />);
    const [, onCloseArg] = useFocusTrapMock.mock.calls[0]!;
    (onCloseArg as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders Cancel + Save buttons with design-system classes', () => {
    render(<EditCreditLimitModal {...baseProps} />);
    const cancel = screen.getByRole('button', { name: /cancel/i });
    const save = screen.getByRole('button', { name: /save manual limit/i });
    expect(cancel).toHaveClass('secondary-button');
    expect(save).toHaveClass('primary-button');
  });

  it('wires htmlFor/id pairs for the amount and reason form controls (a11y)', () => {
    render(<EditCreditLimitModal {...baseProps} />);
    const amount = screen.getByLabelText(/new credit limit/i);
    const reason = screen.getByLabelText(/reason/i);
    expect(amount.id).toBe('edit-credit-limit-amount');
    expect(reason.id).toBe('edit-credit-limit-reason');
  });

  it('submits successfully and calls onClose when a valid reason is provided', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EditCreditLimitModal {...baseProps} onClose={onClose} />);
    const reason = screen.getByLabelText(/reason/i);
    await user.type(reason, 'Manual bump for trade show');
    const save = screen.getByRole('button', { name: /save manual limit/i });
    await user.click(save);
    expect(runCommand).toHaveBeenCalledWith(
      'setCustomerCreditLimit',
      expect.objectContaining({ customerId: 'cust-1', amount: 10_000 }),
      expect.any(String)
    );
    expect(onClose).toHaveBeenCalled();
  });
});
