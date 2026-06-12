/**
 * UX-Q04: Edit and archive dialogs for the ContactProfileHeader.
 * Surfaces the wired-backend updateContact and archiveContact commands.
 */
import { useState } from 'react';
import { useCommandRunner } from '../useCommandRunner';
import { FormDialog, FormField } from '../templates';
import type { ContactProfileData } from './types';

// ─── UpdateContactDialog ────────────────────────────────────────────────────

interface UpdateContactDialogProps {
  data: ContactProfileData;
  onClose: () => void;
}

export function UpdateContactDialog({ data, onClose }: UpdateContactDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const contact = data.contact as Record<string, unknown>;
  const contactId = String(contact.id ?? '');

  const [name, setName] = useState(String(contact.name ?? ''));
  const [displayName, setDisplayName] = useState(String(contact.display_name ?? ''));
  const [phone, setPhone] = useState(String(contact.phone ?? ''));
  const [secondaryPhone, setSecondaryPhone] = useState(String(contact.secondary_phone ?? ''));
  const [email, setEmail] = useState(String(contact.email ?? ''));
  const [companyName, setCompanyName] = useState(String(contact.company_name ?? ''));
  const [address, setAddress] = useState(String(contact.address ?? ''));
  const [notes, setNotes] = useState(String(contact.notes ?? ''));
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Name is required.');
      return;
    }
    const result = await runCommand(
      'updateContact',
      {
        contactId,
        name: name.trim(),
        displayName: displayName.trim() || null,
        phone: phone.trim() || null,
        secondaryPhone: secondaryPhone.trim() || null,
        email: email.trim() || null,
        companyName: companyName.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      },
      'Edit contact profile'
    );
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="Edit Contact"
      titleId="update-contact-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Save"
      pendingLabel="Saving…"
      pending={isRunning}
      submitDisabled={!name.trim()}
      error={formError}
      maxWidthClass="max-w-lg"
    >
      <FormField id="uc-name" label="Name *">
        <input
          id="uc-name"
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>

      <FormField id="uc-display-name" label="Display name">
        <input
          id="uc-display-name"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Optional alias shown in the UI"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField id="uc-phone" label="Phone">
          <input
            id="uc-phone"
            type="tel"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FormField>
        <FormField id="uc-phone2" label="Secondary phone">
          <input
            id="uc-phone2"
            type="tel"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
            value={secondaryPhone}
            onChange={(e) => setSecondaryPhone(e.target.value)}
          />
        </FormField>
      </div>

      <FormField id="uc-email" label="Email">
        <input
          id="uc-email"
          type="email"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>

      <FormField id="uc-company" label="Company name">
        <input
          id="uc-company"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </FormField>

      <FormField id="uc-address" label="Address">
        <textarea
          id="uc-address"
          rows={2}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent resize-none"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormField>

      <FormField id="uc-notes" label="Notes">
        <textarea
          id="uc-notes"
          rows={3}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}

// ─── ArchiveContactDialog ───────────────────────────────────────────────────

interface ArchiveContactDialogProps {
  contactId: string;
  contactName: string;
  onClose: () => void;
}

export function ArchiveContactDialog({ contactId, contactName, onClose }: ArchiveContactDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!reason.trim()) {
      setFormError('A reason is required to archive a contact.');
      return;
    }
    const result = await runCommand(
      'archiveContact',
      { contactId, reason: reason.trim() },
      reason.trim()
    );
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="Archive Contact"
      titleId="archive-contact-title"
      description={`Archive "${contactName}"? This will deactivate the contact. The contact cannot be archived if they have open invoices, unpaid vendor bills, active referee relationships, or uncollected processor fees.`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Archive"
      pendingLabel="Archiving…"
      pending={isRunning}
      submitDisabled={!reason.trim()}
      error={formError}
      tone="danger"
      maxWidthClass="max-w-md"
    >
      <FormField id="ac-reason" label="Reason *">
        <textarea
          id="ac-reason"
          rows={3}
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent resize-none"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g., Account closed at customer request"
          autoFocus
        />
      </FormField>
    </FormDialog>
  );
}
