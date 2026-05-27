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

import { VoidRefereeCreditDialog } from './VoidRefereeCreditDialog';

describe('VoidRefereeCreditDialog', () => {
  beforeEach(() => {
    runCommand.mockClear();
  });

  it('renders the transactionNo and credit amount', () => {
    render(
      <VoidRefereeCreditDialog
        creditId="cred-1"
        transactionNo="TX-001"
        creditAmount={125.5}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('TX-001')).toBeInTheDocument();
    expect(screen.getByText(/\$125\.50/)).toBeInTheDocument();
  });

  it('calls runCommand with literal name and reason in payload + 3rd arg', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <VoidRefereeCreditDialog
        creditId="cred-1"
        transactionNo="TX-001"
        creditAmount={125.5}
        onClose={onClose}
      />
    );
    const reasonField = screen.getByLabelText(/reason/i);
    await user.type(reasonField, 'duplicate entry');
    await user.click(screen.getByRole('button', { name: /void credit/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'voidRefereeCredit',
      { creditId: 'cred-1', reason: 'duplicate entry' },
      'duplicate entry'
    );
  });

  it('shows inline field error for empty reason (no runCommand call)', async () => {
    const user = userEvent.setup();
    render(
      <VoidRefereeCreditDialog
        creditId="cred-1"
        transactionNo="TX-001"
        creditAmount={125.5}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /void credit/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('A reason is required to void a referee credit.');
    expect(runCommand).not.toHaveBeenCalled();
  });
});
