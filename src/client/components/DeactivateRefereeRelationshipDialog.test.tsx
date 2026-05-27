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

import { DeactivateRefereeRelationshipDialog } from './DeactivateRefereeRelationshipDialog';

describe('DeactivateRefereeRelationshipDialog', () => {
  beforeEach(() => {
    runCommand.mockClear();
  });

  it('renders the entity name', () => {
    render(
      <DeactivateRefereeRelationshipDialog
        relationshipId="rel-1"
        entityName="Acme Corp"
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('calls runCommand with literal name, payload, and reason argument', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DeactivateRefereeRelationshipDialog
        relationshipId="rel-1"
        entityName="Acme Corp"
        onClose={onClose}
      />
    );
    const reasonField = screen.getByLabelText(/reason/i);
    await user.type(reasonField, 'No longer needed');
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'deactivateRefereeRelationship',
      { relationshipId: 'rel-1' },
      'No longer needed'
    );
  });

  it('shows inline field error for empty reason (no runCommand call)', async () => {
    const user = userEvent.setup();
    render(
      <DeactivateRefereeRelationshipDialog
        relationshipId="rel-1"
        entityName="Acme Corp"
        onClose={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('A reason is required to deactivate a relationship.');
    expect(runCommand).not.toHaveBeenCalled();
  });
});
