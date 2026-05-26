import { useState } from 'react';
import { X } from 'lucide-react';
import { useCommandRunner } from './useCommandRunner';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { ContactRole } from '../../shared/types';

const ALL_ROLES: ContactRole[] = ['customer', 'vendor', 'referee', 'contractor', 'employee', 'processor'];

interface Props {
  onClose: () => void;
}

export function ContactCreateModal({ onClose }: Props) {
  const { runCommand, isRunning } = useCommandRunner();
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-contact-title"
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="create-contact-title" className="text-lg font-semibold text-zinc-900">
            New Contact
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
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

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="cc-email">
              Email
            </label>
            <input
              id="cc-email"
              type="email"
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="cc-phone">
              Phone
            </label>
            <input
              id="cc-phone"
              type="tel"
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

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
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="cc-credit-limit">
                Credit limit ($)
              </label>
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
            </div>
          )}

          {roles.includes('vendor') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="cc-terms-days">
                Payment terms (days)
              </label>
              <input
                id="cc-terms-days"
                type="number"
                min="0"
                step="1"
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
                value={termsDays}
                onChange={(e) => setTermsDays(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRunning || !name.trim() || roles.length === 0}
              className="btn-primary"
            >
              {isRunning ? 'Creating…' : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
