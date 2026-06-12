// @vitest-environment jsdom
/**
 * UX-Q04: Tests for ContactSettingsActions (AddContactRoleForm + LinkContactToUserForm).
 * Verifies addContactRole and linkContactToUser commands are wired correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const runCommand = vi.fn().mockResolvedValue({ ok: true, toast: 'done' });
vi.mock('../useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand, isRunning: false })
}));
vi.mock('../../store/uiStore', () => ({
  useUiStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      collapsedPanels: {},
      focusedPanelId: null,
      togglePanelCollapsed: vi.fn(),
      setFocusedPanel: vi.fn(),
    }),
}));
vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      reference: {
        useQuery: vi.fn(() => ({
          data: {
            staff: [
              { id: 'user-1', name: 'Alice', role: 'operator' },
              { id: 'user-2', name: 'Bob', role: 'manager' },
            ]
          },
          isLoading: false,
        })),
      },
    },
  },
}));

import { AddContactRoleForm, LinkContactToUserForm } from './ContactSettingsActions';

describe('AddContactRoleForm', () => {
  beforeEach(() => { runCommand.mockClear(); });

  it('renders the role selector', () => {
    render(<AddContactRoleForm contactId="contact-123" />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByTestId('add-role-submit')).toBeInTheDocument();
  });

  it('shows credit limit field when "customer" role is selected', async () => {
    render(<AddContactRoleForm contactId="contact-123" />);
    // Default is 'customer'
    expect(screen.getByLabelText(/credit limit/i)).toBeInTheDocument();
  });

  it('shows terms field when "vendor" role is selected', async () => {
    const user = userEvent.setup();
    render(<AddContactRoleForm contactId="contact-123" />);
    await user.selectOptions(screen.getByRole('combobox'), 'vendor');
    expect(screen.getByLabelText(/terms \(days\)/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/credit limit/i)).not.toBeInTheDocument();
  });

  it('calls runCommand("addContactRole", ...) on submit with customer role', async () => {
    const user = userEvent.setup();
    render(<AddContactRoleForm contactId="contact-123" />);
    await user.click(screen.getByTestId('add-role-submit'));
    expect(runCommand).toHaveBeenCalledWith(
      'addContactRole',
      expect.objectContaining({ contactId: 'contact-123', role: 'customer' }),
      'Add customer role to contact'
    );
  });

  it('calls runCommand("addContactRole", ...) with vendor role and termsDays', async () => {
    const user = userEvent.setup();
    render(<AddContactRoleForm contactId="contact-123" />);
    await user.selectOptions(screen.getByRole('combobox'), 'vendor');
    const termsInput = screen.getByLabelText(/terms \(days\)/i);
    await user.clear(termsInput);
    await user.type(termsInput, '30');
    await user.click(screen.getByTestId('add-role-submit'));
    expect(runCommand).toHaveBeenCalledWith(
      'addContactRole',
      expect.objectContaining({ contactId: 'contact-123', role: 'vendor', termsDays: 30 }),
      'Add vendor role to contact'
    );
  });
});

describe('LinkContactToUserForm', () => {
  beforeEach(() => { runCommand.mockClear(); });

  it('shows "already linked" message when currentUserId is provided', () => {
    render(<LinkContactToUserForm contactId="contact-123" currentUserId="user-existing" />);
    expect(screen.getByText(/already linked to a system account/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /link account/i })).not.toBeInTheDocument();
  });

  it('renders user dropdown when no currentUserId', () => {
    render(<LinkContactToUserForm contactId="contact-123" currentUserId={null} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByTestId('link-account-submit')).toBeInTheDocument();
  });

  it('renders staff members in the dropdown', () => {
    render(<LinkContactToUserForm contactId="contact-123" currentUserId={null} />);
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument();
  });

  it('calls runCommand("linkContactToUser", ...) when user is selected and submitted', async () => {
    const user = userEvent.setup();
    render(<LinkContactToUserForm contactId="contact-123" currentUserId={null} />);
    await user.selectOptions(screen.getByRole('combobox'), 'user-1');
    await user.click(screen.getByTestId('link-account-submit'));
    expect(runCommand).toHaveBeenCalledWith(
      'linkContactToUser',
      { contactId: 'contact-123', userId: 'user-1' },
      'Link contact to operator user account'
    );
  });

  it('submit button is disabled when no user is selected', () => {
    render(<LinkContactToUserForm contactId="contact-123" currentUserId={null} />);
    // Button has disabled={isRunning || !userId} — disabled by default since userId is empty
    const submitBtn = screen.getByTestId('link-account-submit');
    expect(submitBtn).toBeDisabled();
    expect(runCommand).not.toHaveBeenCalled();
  });
});
