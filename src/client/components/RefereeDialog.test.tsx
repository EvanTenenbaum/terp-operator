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

import { RefereeDialog } from './RefereeDialog';

describe('RefereeDialog', () => {
  beforeEach(() => {
    runCommand.mockClear();
  });

  it('renders with pre-filled values from initial', () => {
    render(
      <RefereeDialog
        refereeId="ref-1"
        initial={{ name: 'Jane Doe', email: 'jane@example.com', phone: '555-1212', paymentMethod: 'wire', notes: 'VIP' }}
        onClose={() => {}}
      />
    );
    expect(screen.getByLabelText(/name/i)).toHaveValue('Jane Doe');
    expect(screen.getByLabelText(/email/i)).toHaveValue('jane@example.com');
    expect(screen.getByLabelText(/phone/i)).toHaveValue('555-1212');
    expect(screen.getByLabelText(/payment method/i)).toHaveValue('wire');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('VIP');
  });

  it('calls runCommand("updateReferee", ...) on submit with valid input', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <RefereeDialog
        refereeId="ref-1"
        initial={{ name: 'Jane Doe', email: 'jane@example.com', paymentMethod: 'check' }}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'updateReferee',
      expect.objectContaining({ refereeId: 'ref-1', name: 'Jane Doe' }),
      'Update referee profile'
    );
  });

  it('shows inline field error for empty name (no runCommand call)', async () => {
    const user = userEvent.setup();
    render(<RefereeDialog refereeId="ref-1" initial={{ name: '' }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
    expect(runCommand).not.toHaveBeenCalled();
  });
});
