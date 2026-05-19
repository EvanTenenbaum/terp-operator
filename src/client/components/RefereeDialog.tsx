import { useState } from 'react';
import { X } from 'lucide-react';
import { useCommandRunner } from './useCommandRunner';
import { useFocusTrap } from '../hooks/useFocusTrap';

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
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [values, setValues] = useState<RefereeFormValues>({
    name: initial.name ?? '',
    email: initial.email ?? '',
    phone: initial.phone ?? '',
    paymentMethod: initial.paymentMethod ?? 'check',
    notes: initial.notes ?? ''
  });

  function update<K extends keyof RefereeFormValues>(key: K, value: RefereeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) {
      alert('Name is required.');
      return;
    }
    const result = await runCommand('updateReferee', {
      refereeId,
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      paymentMethod: values.paymentMethod,
      notes: values.notes.trim() || null
    });
    if (result.ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Edit Referee</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="rd-name">Name</label>
            <input id="rd-name" type="text" value={values.name} onChange={(e) => update('name', e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="rd-email">Email</label>
            <input id="rd-email" type="email" value={values.email} onChange={(e) => update('email', e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="rd-phone">Phone</label>
            <input id="rd-phone" type="tel" value={values.phone} onChange={(e) => update('phone', e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="rd-method">Payment Method</label>
            <select id="rd-method" value={values.paymentMethod} onChange={(e) => update('paymentMethod', e.target.value as RefereeFormValues['paymentMethod'])} className="w-full rounded border border-zinc-300 px-3 py-2">
              <option value="check">Check</option>
              <option value="wire">Wire</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
              <option value="crypto">Crypto</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="rd-notes">Notes</label>
            <textarea id="rd-notes" value={values.notes} onChange={(e) => update('notes', e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="submit" disabled={isRunning} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {isRunning ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
