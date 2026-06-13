import { useState } from 'react';
import { useCommandRunner } from './useCommandRunner';
import { FormDialog, FormField } from './templates';

interface RefereeFormValues {
  name: string;
  email: string;
  phone: string;
  paymentMethod: 'check' | 'wire' | 'ach' | 'crypto' | 'cash';
  notes: string;
}

interface RefereeDialogProps {
  refereeId: string;
  initial: Partial<RefereeFormValues>;
  onClose: () => void;
}

export function RefereeDialog({ refereeId, initial, onClose }: RefereeDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const [values, setValues] = useState<RefereeFormValues>({
    name: initial.name ?? '',
    email: initial.email ?? '',
    phone: initial.phone ?? '',
    paymentMethod: initial.paymentMethod ?? 'check',
    notes: initial.notes ?? ''
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function update<K extends keyof RefereeFormValues>(key: K, value: RefereeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorMsg) setErrorMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      setErrorMsg('Name is required.');
      return;
    }
    setErrorMsg(null);
    const result = await runCommand('updateReferee', {
      refereeId,
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      paymentMethod: values.paymentMethod,
      notes: values.notes.trim() || null
    }, 'Update referee profile');
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="Edit Referee"
      titleId="rd-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Save Changes"
      pendingLabel="Saving..."
      pending={isRunning}
      error={errorMsg}
    >
      <FormField id="rd-name" label="Name">
        <input
          id="rd-name"
          type="text"
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          className={`w-full rounded border border-zinc-300 px-3 py-2${errorMsg ? ' input-error' : ''}`}
        />
      </FormField>
      <FormField id="rd-email" label="Email">
        <input id="rd-email" type="email" value={values.email} onChange={(e) => update('email', e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2" />
      </FormField>
      <FormField id="rd-phone" label="Phone">
        <input id="rd-phone" type="tel" value={values.phone} onChange={(e) => update('phone', e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2" />
      </FormField>
      <FormField id="rd-method" label="Payment Method">
        <select id="rd-method" value={values.paymentMethod} onChange={(e) => update('paymentMethod', e.target.value as RefereeFormValues['paymentMethod'])} className="w-full rounded border border-zinc-300 px-3 py-2">
          <option value="check">Check</option>
          <option value="wire">Wire</option>
          <option value="ach">ACH</option>
          <option value="cash">Cash</option>
          <option value="crypto">Crypto</option>
        </select>
      </FormField>
      <FormField id="rd-notes" label="Notes">
        <textarea id="rd-notes" value={values.notes} onChange={(e) => update('notes', e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2" rows={2} />
      </FormField>
    </FormDialog>
  );
}
