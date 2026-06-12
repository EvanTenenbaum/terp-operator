import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import type { ContactProfileData } from './types';
import { formatMoney } from '../../utils/format';
import { AddContactRoleForm, LinkContactToUserForm } from './ContactSettingsActions';

interface Props { data: ContactProfileData; }

export function ContactSettingsPanel({ data }: Props) {
  const contact = data.contact as Record<string, unknown>;
  const referee = data.referee as Record<string, unknown> | null;
  const processor = data.processor as Record<string, unknown> | null;
  const linkedUser = data.user as Record<string, unknown> | null;
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const contactId = String(contact.id ?? '');

  return (
    <div className="space-y-4">
      {Boolean(contact.is_referee) && referee && (
        <WorkspacePanel panelId="contact-settings-referee" title="Referee Settings">
          <div className="context-drawer-card p-3 space-y-1 text-sm">
            <label className="field-inline"><span className="text-zinc-500">Balance</span><span>{formatMoney(Number(referee.balance ?? 0))}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Lifetime earned</span><span>{formatMoney(Number(referee.lifetime_earned ?? 0))}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Payment method</span><span>{String(referee.payment_method ?? '—')}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Payment details</span><span>{String(referee.payment_details ?? '—')}</span></label>
          </div>
        </WorkspacePanel>
      )}

      {Boolean(contact.is_processor) && processor && (
        <WorkspacePanel panelId="contact-settings-processor" title="Processor Settings">
          <div className="context-drawer-card p-3 space-y-1 text-sm">
            <label className="field-inline"><span className="text-zinc-500">Type</span><span>{String(processor.processor_type ?? '—')}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Fee type</span><span>{String(processor.fee_type ?? '—')}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Fee %</span><span>{String(processor.fee_percentage ?? '—')}</span></label>
            <label className="field-inline"><span className="text-zinc-500">Fixed fee</span><span>{processor.fee_fixed_amount ? formatMoney(Number(processor.fee_fixed_amount)) : '—'}</span></label>
            <label className="field-inline"><span className="text-zinc-500">User split</span><span>{String(processor.default_user_split ?? '—')}%</span></label>
          </div>
        </WorkspacePanel>
      )}

      {Boolean(contact.is_employee) && (
        <WorkspacePanel panelId="contact-settings-employee" title="Employee Settings">
          <div className="context-drawer-card p-3 space-y-1 text-sm">
            {linkedUser ? (
              <>
                <label className="field-inline"><span className="text-zinc-500">Account email</span><span>{String(linkedUser.email)}</span></label>
                <label className="field-inline"><span className="text-zinc-500">Role</span><span>{String(linkedUser.role)}</span></label>
                <label className="field-inline"><span className="text-zinc-500">Work loop</span><span>{String(linkedUser.workLoop ?? 'Auto-detected')}</span></label>
              </>
            ) : (
              <p className="text-sm text-zinc-400">No system account linked.</p>
            )}
          </div>
        </WorkspacePanel>
      )}

      {/* UX-Q04: Add role + link-to-user forms — writer-only */}
      {canWrite && (
        <>
          <AddContactRoleForm contactId={contactId} />
          <LinkContactToUserForm
            contactId={contactId}
            currentUserId={linkedUser ? String(linkedUser.id ?? '') : null}
          />
        </>
      )}
    </div>
  );
}
