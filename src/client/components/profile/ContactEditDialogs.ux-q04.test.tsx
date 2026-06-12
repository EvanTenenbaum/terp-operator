// @vitest-environment jsdom
/**
 * UX-Q04: Tests for ContactEditDialogs (UpdateContactDialog + ArchiveContactDialog).
 * Verifies that wired-backend updateContact and archiveContact are correctly
 * surfaced with the right payloads and FormDialog tone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('../useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));
vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

import { UpdateContactDialog, ArchiveContactDialog } from './ContactEditDialogs';
import type { ContactProfileData } from './types';

const MOCK_DATA: ContactProfileData = {
  contact: {
    id: 'contact-123',
    name: 'Acme Corp',
    display_name: 'Acme',
    phone: '555-1234',
    secondary_phone: null,
    email: 'acme@example.com',
    company_name: 'Acme Corporation',
    address: '123 Main St',
    notes: 'VIP customer',
  },
  customer: null,
  vendor: null,
  referee: null,
  processor: null,
  user: null,
  upcomingAppointmentCount: 0,
};

describe('UpdateContactDialog', () => {
  beforeEach(() => { runCommand.mockClear(); });

  it('renders pre-filled fields with existing contact data', () => {
    render(<UpdateContactDialog data={MOCK_DATA} onClose={() => {}} />);
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
    expect(screen.getByDisplayValue('555-1234')).toBeInTheDocument();
    expect(screen.getByDisplayValue('acme@example.com')).toBeInTheDocument();
  });

  it('calls runCommand("updateContact", ...) on submit', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<UpdateContactDialog data={MOCK_DATA} onClose={onClose} />);
    const nameInput = screen.getByLabelText(/name \*/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Acme Updated');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'updateContact',
      expect.objectContaining({ contactId: 'contact-123', name: 'Acme Updated' }),
      'Edit contact profile'
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('submit button becomes disabled and runCommand is not called when name is cleared', async () => {
    const user = userEvent.setup();
    render(<UpdateContactDialog data={MOCK_DATA} onClose={() => {}} />);
    const nameInput = screen.getByLabelText(/name \*/i);
    await user.clear(nameInput);
    // submitDisabled={!name.trim()} — button is disabled when name is blank
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('has dialog role and aria-modal', () => {
    render(<UpdateContactDialog data={MOCK_DATA} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

describe('ArchiveContactDialog', () => {
  beforeEach(() => { runCommand.mockClear(); });

  it('renders the contact name in the description', () => {
    render(
      <ArchiveContactDialog
        contactId="contact-123"
        contactName="Acme Corp"
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/Archive "Acme Corp"\?/)).toBeInTheDocument();
  });

  it('submit button has tone:danger styling (btn-danger class)', () => {
    render(
      <ArchiveContactDialog
        contactId="contact-123"
        contactName="Acme Corp"
        onClose={() => {}}
      />
    );
    const submitBtn = screen.getByRole('button', { name: /^archive$/i });
    expect(submitBtn.className).toContain('btn-danger');
  });

  it('calls runCommand("archiveContact", ...) with reason', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ArchiveContactDialog
        contactId="contact-123"
        contactName="Acme Corp"
        onClose={onClose}
      />
    );
    const reasonField = screen.getByLabelText(/reason \*/i);
    await user.type(reasonField, 'Account closed at request');
    await user.click(screen.getByRole('button', { name: /^archive$/i }));
    expect(runCommand).toHaveBeenCalledWith(
      'archiveContact',
      { contactId: 'contact-123', reason: 'Account closed at request' },
      'Account closed at request'
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('submit button is disabled and runCommand is not called when reason is empty', async () => {
    render(
      <ArchiveContactDialog
        contactId="contact-123"
        contactName="Acme Corp"
        onClose={() => {}}
      />
    );
    // submitDisabled={!reason.trim()} — button starts disabled with empty reason
    const archiveBtn = screen.getByRole('button', { name: /^archive$/i });
    expect(archiveBtn).toBeDisabled();
    expect(runCommand).not.toHaveBeenCalled();
  });
});
