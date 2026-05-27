// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('./useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));
vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

import { RecordPrepaymentDialog } from './RecordPrepaymentDialog';

describe('RecordPrepaymentDialog', () => {
  beforeEach(() => {
    runCommand.mockClear();
  });

  it('renders the PO number and max amount', () => {
    render(<RecordPrepaymentDialog purchaseOrderId="po-1" poNo="PO-001" maxAmount={500} onClose={() => {}} />);
    expect(screen.getByText('PO-001')).toBeInTheDocument();
    expect(screen.getByText(/\$500\.00/)).toBeInTheDocument();
  });

  it('calls runCommand with the literal command name on submit', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecordPrepaymentDialog purchaseOrderId="po-1" poNo="PO-001" maxAmount={500} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /record prepayment/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'recordVendorPrepayment',
      expect.objectContaining({ purchaseOrderId: 'po-1' }),
      'Record vendor prepayment for purchase order'
    );
  });

  it('shows inline field error when amount exceeds maxAmount', async () => {
    const user = userEvent.setup();
    render(<RecordPrepaymentDialog purchaseOrderId="po-1" poNo="PO-001" maxAmount={100} onClose={() => {}} />);
    const input = screen.getByLabelText(/amount/i);
    await user.clear(input);
    await user.type(input, '500');
    await user.click(screen.getByRole('button', { name: /record prepayment/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Prepayment cannot exceed');
    expect(runCommand).not.toHaveBeenCalled();
  });
});
