/**
 * UX-Q04: Add Role and Link-to-User forms for the ContactSettingsPanel.
 * Surfaces the wired-backend addContactRole and linkContactToUser commands.
 */
import { useState } from 'react';
import { trpc } from '../../api/trpc';
import { useCommandRunner } from '../useCommandRunner';
import { WorkspacePanel } from '../WorkspacePanel';

type ContactRole = 'customer' | 'vendor' | 'referee' | 'processor' | 'contractor' | 'employee';

const ALL_ROLES: ContactRole[] = ['customer', 'vendor', 'referee', 'processor', 'contractor', 'employee'];

interface AddContactRoleFormProps {
  contactId: string;
}

export function AddContactRoleForm({ contactId }: AddContactRoleFormProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const [role, setRole] = useState<ContactRole>('customer');
  const [creditLimit, setCreditLimit] = useState('');
  const [termsDays, setTermsDays] = useState('14');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccess(false);
    const payload: Record<string, unknown> = { contactId, role };
    if (role === 'customer' && creditLimit) payload.creditLimit = Number(creditLimit);
    if (role === 'vendor' && termsDays) payload.termsDays = Number(termsDays);

    const result = await runCommand(
      'addContactRole',
      payload,
      `Add ${role} role to contact`
    );
    if (result.ok) {
      setSuccess(true);
    } else {
      setFormError('Failed to add role. The role may already exist for this contact.');
    }
  }

  return (
    <WorkspacePanel panelId="contact-settings-add-role" title="Add Role">
      <form onSubmit={handleSubmit} className="space-y-3 p-3 text-sm" noValidate>
        {success && (
          <p className="text-xs text-green-700">Role added successfully. Refresh to see changes.</p>
        )}
        {formError && (
          <div className="field-error" role="alert">{formError}</div>
        )}
        <label className="field-inline">
          <span className="text-zinc-500">Role</span>
          <select
            className="select"
            value={role}
            onChange={(e) => { setRole(e.target.value as ContactRole); setSuccess(false); }}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </label>

        {role === 'customer' && (
          <label className="field-inline">
            <span className="text-zinc-500">Credit limit ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input compact"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="0"
            />
          </label>
        )}

        {role === 'vendor' && (
          <label className="field-inline">
            <span className="text-zinc-500">Terms (days)</span>
            <input
              type="number"
              min="0"
              step="1"
              className="input compact"
              value={termsDays}
              onChange={(e) => setTermsDays(e.target.value)}
            />
          </label>
        )}

        <button
          type="submit"
          className="secondary-button compact-action"
          disabled={isRunning}
          data-testid="add-role-submit"
        >
          Add role
        </button>
      </form>
    </WorkspacePanel>
  );
}

interface LinkContactToUserFormProps {
  contactId: string;
  currentUserId: string | null;
}

export function LinkContactToUserForm({ contactId, currentUserId }: LinkContactToUserFormProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const reference = trpc.queries.reference.useQuery();
  const [userId, setUserId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Already linked — show info state, not the form.
  if (currentUserId) {
    return (
      <WorkspacePanel panelId="contact-settings-link-user" title="System Account">
        <p className="px-3 pb-3 text-xs text-zinc-500">
          This contact is already linked to a system account.
        </p>
      </WorkspacePanel>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccess(false);
    if (!userId) {
      setFormError('Select a user account to link.');
      return;
    }
    const result = await runCommand(
      'linkContactToUser',
      { contactId, userId },
      'Link contact to operator user account'
    );
    if (result.ok) {
      setSuccess(true);
    } else {
      setFormError('Failed to link user. The user may already be linked to another contact.');
    }
  }

  // reference.data.staff holds active operator user accounts (owner/manager/operator).
  const users = reference.data?.staff ?? [];

  return (
    <WorkspacePanel panelId="contact-settings-link-user" title="Link System Account">
      <form onSubmit={handleSubmit} className="space-y-3 p-3 text-sm" noValidate>
        {success && (
          <p className="text-xs text-green-700">User account linked. Refresh to see changes.</p>
        )}
        {formError && (
          <div className="field-error" role="alert">{formError}</div>
        )}
        <p className="text-xs text-zinc-500">
          Link this contact to a TERP Operator user account (for employees).
        </p>
        <label className="field-inline">
          <span className="text-zinc-500">User</span>
          <select
            className="select"
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setSuccess(false); }}
          >
            <option value="">— Select operator account —</option>
            {users.map((u: { id: string; name?: string; role?: string }) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.id}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="secondary-button compact-action"
          disabled={isRunning || !userId}
          title={!userId ? 'Select a user account first' : undefined}
          data-testid="link-account-submit"
        >
          Link account
        </button>
      </form>
    </WorkspacePanel>
  );
}
