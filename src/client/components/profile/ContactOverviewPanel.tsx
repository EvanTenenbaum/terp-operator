import { WorkspacePanel } from '../WorkspacePanel';
import type { ContactProfileData } from './types';

interface Props { data: ContactProfileData; }

export function ContactOverviewPanel({ data }: Props) {
  const { contact } = data;
  const c = contact as Record<string, unknown>;

  const contactFields: Array<{ label: string; value: string | null | undefined }> = [
    { label: 'Phone',             value: c.phone as string | null | undefined },
    { label: 'Secondary phone',   value: c.secondary_phone as string | null | undefined },
    { label: 'Email',             value: c.email as string | null | undefined },
    { label: 'Address',           value: c.address as string | null | undefined },
    { label: 'Company',           value: c.company_name as string | null | undefined },
    { label: 'Kind',              value: c.contact_kind as string | null | undefined },
    { label: 'Preferred contact', value: c.preferred_contact_method as string | null | undefined },
  ];

  return (
    <div className="space-y-4">
      <WorkspacePanel panelId="contact-overview-info" title="Contact Info"
        actions={<button className="text-button text-sm">Edit</button>}>
        <div className="context-drawer-card space-y-1 p-3">
          {contactFields.map(({ label, value }) => (
            <label key={label} className="field-inline">
              <span className="text-zinc-500">{label}</span>
              <span>{value ?? '—'}</span>
            </label>
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel panelId="contact-overview-notes" title="Notes">
        <div className="context-drawer-card p-3">
          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{(c.notes as string | null | undefined) ?? 'No notes.'}</p>
        </div>
      </WorkspacePanel>
    </div>
  );
}
