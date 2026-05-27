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

import { UpdateRefereeRelationshipDialog } from './UpdateRefereeRelationshipDialog';

describe('UpdateRefereeRelationshipDialog', () => {
  beforeEach(() => {
    runCommand.mockClear();
  });

  it('renders with the initial fee config visible', () => {
    render(
      <UpdateRefereeRelationshipDialog
        relationshipId="rel-1"
        initialFeeType="percentage"
        initialFeePercentage={5.5}
        initialApplyByDefault={true}
        initialNotes="initial notes"
        onClose={() => {}}
      />
    );
    expect(screen.getByLabelText(/fee structure/i)).toHaveValue('percentage');
    expect(screen.getByLabelText(/percentage/i)).toHaveValue(5.5);
    expect(screen.getByLabelText(/notes/i)).toHaveValue('initial notes');
  });

  it('calls runCommand("updateRefereeRelationship", ...) on submit', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <UpdateRefereeRelationshipDialog
        relationshipId="rel-1"
        initialFeeType="percentage"
        initialFeePercentage={5}
        initialApplyByDefault={true}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'updateRefereeRelationship',
      expect.objectContaining({ relationshipId: 'rel-1', feeType: 'percentage' }),
      'Update referee relationship'
    );
  });

  it('shows inline field error for out-of-range percentage (>100)', async () => {
    const user = userEvent.setup();
    render(
      <UpdateRefereeRelationshipDialog
        relationshipId="rel-1"
        initialFeeType="percentage"
        initialFeePercentage={5}
        initialApplyByDefault={true}
        onClose={() => {}}
      />
    );
    const input = screen.getByLabelText(/percentage/i);
    await user.clear(input);
    await user.type(input, '150');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Percentage must be between 0 and 100');
    expect(runCommand).not.toHaveBeenCalled();
  });
});
