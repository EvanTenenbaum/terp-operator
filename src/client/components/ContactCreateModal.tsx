import { useState } from 'react';
import { useCommandRunner } from './useCommandRunner';
import { FormDialog, FormField } from './templates';
import type { ContactRole } from '../../shared/types';

const ALL_ROLES: ContactRole[] = ['customer', 'vendor', 'referee', 'contractor', 'employee', 'processor'];

interface Props {
  onClose: () => void;
}

export function ContactCreateModal({ onClose }: Props) {
  const { runCommand, isRunning } = useCommandRunner();

  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [roles, setRoles]             = useState<ContactRole[]>(['customer']);
  const [creditLimit, setCreditLimit] = useState('');
  const [termsDays, setTermsDays]     = useState('14');

  function toggleRole(role: ContactRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || roles.length === 0) return;

    const result = await runCommand(
      'createContact',
      {
        name: name.trim(),
        email: email || undefined,
        phone: phone || undefined,
        roles,
        creditLimit:
          roles.includes('customer') && creditLimit
            ? Number(creditLimit)
            : undefined,
        termsDays:
          roles.includes('vendor') && termsDays
            ? Number(termsDays)
            : undefined,
      },
      'Create contact from directory'
    );
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="New Contact"
      titleId="create-contact-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Create Contact"
      pendingLabel="Creating…"
      pending={isRunning}
      submitDisabled={!name.trim() || roles.length === 0}
      maxWidthClass="max-w-md"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="cc-name">
          Name <span aria-hidden="true">*</span>
        </label>
        <input
          id="cc-name"
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <FormField id="cc-email" label="Email">
        <input
          id="cc-email"
          type="email"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>

      <FormField id="cc-phone" label="Phone">
        <input
          id="cc-phone"
          type="tel"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormField>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-zinc-700">
          Roles <span className="font-normal text-zinc-500">(select at least one)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      {roles.includes('customer') && (
        <FormField id="cc-credit-limit" label="Credit limit ($)">
          <input
            id="cc-credit-limit"
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder="0"
          />
        </FormField>
      )}

      {roles.includes('vendor') && (
        <FormField id="cc-terms-days" label="Payment terms (days)">
          <input
            id="cc-terms-days"
            type="number"
            min="0"
            step="1"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
            value={termsDays}
            onChange={(e) => setTermsDays(e.target.value)}
          />
        </FormField>
      )}
    </FormDialog>
  );
}
