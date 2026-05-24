import { useState } from 'react';
import { useCommandRunner } from '../useCommandRunner';
import type { AppointmentType } from '../../../shared/types';

/** Convert a UTC ISO string to a "YYYY-MM-DDTHH:MM" string in local time,
 *  suitable for <input type="datetime-local">. */
function toLocalInputString(isoUtc: string | undefined): string {
  if (!isoUtc) return '';
  const d = new Date(isoUtc);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const APPOINTMENT_TYPES: AppointmentType[] = ['meeting','call','delivery','pickup','vacation','job','other'];

interface Props {
  contactId: string;
  appointmentId?: string;   // present in edit mode
  initialValues?: {
    title?: string;
    appointmentType?: AppointmentType;
    startsAt?: string;
    endsAt?: string;
    location?: string;
    notes?: string;
  };
  onClose: () => void;
}

export function AppointmentModal({ contactId, appointmentId, initialValues, onClose }: Props) {
  const { runCommand, isRunning } = useCommandRunner();
  const isEdit = Boolean(appointmentId);

  const [title, setTitle]          = useState(initialValues?.title ?? '');
  const [appointmentType, setType] = useState<AppointmentType>(initialValues?.appointmentType ?? 'meeting');
  const [startsAt, setStartsAt]    = useState(toLocalInputString(initialValues?.startsAt));
  const [endsAt, setEndsAt]        = useState(toLocalInputString(initialValues?.endsAt));
  const [location, setLocation]    = useState(initialValues?.location ?? '');
  const [notes, setNotes]          = useState(initialValues?.notes ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startsAt) return;
    const payload = {
      title: title.trim(),
      appointmentType,
      startsAt: new Date(startsAt).toISOString(),
      endsAt:   endsAt ? new Date(endsAt).toISOString() : undefined,
      location: location || undefined,
      notes:    notes || undefined,
    };
    if (isEdit && appointmentId) {
      const result = await runCommand('updateAppointment', { appointmentId, ...payload }, 'Update appointment from profile');
      if (result.ok) onClose();
    } else {
      const result = await runCommand('createAppointment', { contactId, ...payload }, 'Create appointment from profile');
      if (result.ok) onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog" aria-modal="true" aria-labelledby="appt-modal-title">
      <div className="bg-white rounded shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 id="appt-modal-title" className="section-title">{isEdit ? 'Edit Appointment' : 'Add Appointment'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="field-inline flex-col items-start gap-1">
            Title <input required className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field-inline">
            Type
            <select className="select" value={appointmentType} onChange={(e) => setType(e.target.value as AppointmentType)}>
              {APPOINTMENT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </label>
          <label className="field-inline">
            Starts
            <input required type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="field-inline">
            Ends (optional)
            <input type="datetime-local" className="input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label className="field-inline flex-col items-start gap-1">
            Location <input className="input w-full" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="field-inline flex-col items-start gap-1">
            Notes <textarea className="input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={isRunning || !title.trim() || !startsAt}>
              {isRunning ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
