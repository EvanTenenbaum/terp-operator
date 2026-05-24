import { useState } from 'react';
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import { useCommandRunner } from '../useCommandRunner';
import { AppointmentModal } from './AppointmentModal';
import type { AppointmentType } from '../../../shared/types';

interface Props { contactId: string; }

export function ContactAppointmentsPanel({ contactId }: Props) {
  const { data, refetch } = trpc.queries.contactAppointments.useQuery({ contactId });
  const { runCommand, isRunning } = useCommandRunner();
  const [showModal, setShowModal] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Record<string, unknown> | null>(null);

  const upcoming = data?.upcoming ?? [];
  const past     = data?.past     ?? [];

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  async function handleCancel(appointmentId: string) {
    await runCommand('cancelAppointment', { appointmentId }, 'Cancel appointment from profile');
    await refetch();
  }

  async function handleComplete(appointmentId: string) {
    await runCommand('completeAppointment', { appointmentId }, 'Complete appointment from profile');
    await refetch();
  }

  return (
    <div className="space-y-4">
      {showModal && (
        <AppointmentModal
          contactId={contactId}
          appointmentId={editingAppt ? String(editingAppt.id) : undefined}
          initialValues={editingAppt ? {
            title: String(editingAppt.title ?? ''),
            appointmentType: String(editingAppt.appointment_type) as AppointmentType,
            startsAt: String(editingAppt.starts_at ?? ''),
            endsAt: editingAppt.ends_at ? String(editingAppt.ends_at) : undefined,
            location: editingAppt.location ? String(editingAppt.location) : undefined,
            notes: editingAppt.notes ? String(editingAppt.notes) : undefined,
          } : undefined}
          onClose={() => { setShowModal(false); setEditingAppt(null); void refetch(); }}
        />
      )}

      <WorkspacePanel
        panelId="contact-appointments-upcoming"
        title="Upcoming"
        subtitle={upcoming.length ? `${upcoming.length} scheduled` : undefined}
        actions={
          <button className="primary-button compact-action" onClick={() => { setEditingAppt(null); setShowModal(true); }}>
            Add Appointment
          </button>
        }
      >
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-400 p-4">No upcoming appointments. Add one to track interactions.</p>
        ) : (
          <div className="divide-y divide-line">
            {(upcoming as Record<string, unknown>[]).map((appt) => (
              <div key={String(appt.id)} className="flex items-start justify-between p-3 gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{String(appt.title)}</p>
                  <p className="text-xs text-zinc-500">{formatDateTime(String(appt.starts_at))}</p>
                  {appt.location ? <p className="text-xs text-zinc-400">{String(appt.location)}</p> : null}
                  <span className="selection-pill text-xs">{String(appt.appointment_type)}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="text-button text-xs" onClick={() => { setEditingAppt(appt); setShowModal(true); }}>Edit</button>
                  <button className="text-button text-xs" disabled={isRunning} onClick={() => handleComplete(String(appt.id))}>Complete</button>
                  <button className="text-button text-xs text-danger" disabled={isRunning} onClick={() => handleCancel(String(appt.id))}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkspacePanel>

      <WorkspacePanel panelId="contact-appointments-past" title="Past" subtitle={past.length ? `${past.length} entries` : undefined}>
        {past.length === 0 ? (
          <p className="text-sm text-zinc-400 p-4">No past appointments on record.</p>
        ) : (
          <div className="divide-y divide-line">
            {(past as Record<string, unknown>[]).map((appt) => (
              <div key={String(appt.id)} className="p-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{String(appt.title)}</p>
                  <span className={`selection-pill text-xs ${String(appt.status) === 'cancelled' ? 'warning' : ''}`}>{String(appt.status)}</span>
                </div>
                <p className="text-xs text-zinc-500">{formatDateTime(String(appt.starts_at))}</p>
              </div>
            ))}
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}
