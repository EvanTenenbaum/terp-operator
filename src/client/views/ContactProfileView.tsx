import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { ContactProfileData } from '../components/profile/types';
import { EntityProfileTabs } from '../components/profile/EntityProfileTabs';
import { ContactProfileHeader } from '../components/profile/ContactProfileHeader';
import { ContactOverviewPanel } from '../components/profile/ContactOverviewPanel';
import { ContactHistoryPanel } from '../components/profile/ContactHistoryPanel';
import { ContactCustomerPanel } from '../components/profile/ContactCustomerPanel';
import { ContactVendorPanel } from '../components/profile/ContactVendorPanel';
import { ContactMoneyPanel } from '../components/profile/ContactMoneyPanel';
import { ContactAppointmentsPanel } from '../components/profile/ContactAppointmentsPanel';
import { ContactSettingsPanel } from '../components/profile/ContactSettingsPanel';

export function ContactProfileView() {
  const { id: contactId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const { data, isLoading } = trpc.queries.contactProfile.useQuery(
    { contactId: contactId ?? '' },
    { enabled: Boolean(contactId) }
  );

  if (isLoading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  if (!data) return <div className="p-8 text-sm text-zinc-500">Contact not found.</div>;

  // Cast tRPC data to explicit shape — server returns Record<string, unknown> rows
  // from pool.query, so we define the type explicitly in profile/types.ts.
  const profileData = data as unknown as ContactProfileData;
  const { contact } = profileData;
  const c = contact as Record<string, unknown>;

  const tabs = [
    { key: 'overview',     label: 'Overview',     show: true },
    { key: 'customer',     label: 'Customer',     show: Boolean(c.is_customer) },
    { key: 'vendor',       label: 'Vendor',       show: Boolean(c.is_vendor) },
    { key: 'money',        label: 'Money',        show: Boolean(c.is_customer || c.is_vendor || c.is_referee || c.is_contractor || c.is_employee) },
    { key: 'appointments', label: 'Appointments', show: true },
    // UX-Q04: show Settings for all contacts — it now hosts Add Role + Link User
    // actions in addition to the existing referee/processor/employee config panels.
    { key: 'settings',     label: 'Settings',     show: true },
    { key: 'history',      label: 'History',      show: true },
  ];

  const validTab = tabs.find((t) => t.show && t.key === activeTab) ? activeTab : 'overview';

  return (
    <div className="view-stack">
      <div className="flex items-center gap-2 px-1">
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="Go back">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-zinc-500">Back</span>
      </div>

      <ContactProfileHeader data={profileData} />
      <EntityProfileTabs tabs={tabs} activeTab={validTab} onTabChange={setActiveTab} />

      <div className="mt-4">
        {validTab === 'overview'     && <ContactOverviewPanel data={profileData} />}
        {validTab === 'customer'     && <ContactCustomerPanel data={profileData} />}
        {validTab === 'vendor'       && <ContactVendorPanel data={profileData} />}
        {validTab === 'money'        && <ContactMoneyPanel data={profileData} />}
        {validTab === 'appointments' && <ContactAppointmentsPanel contactId={contactId!} />}
        {validTab === 'settings'     && <ContactSettingsPanel data={profileData} />}
        {validTab === 'history'      && <ContactHistoryPanel contactId={contactId!} />}
      </div>
    </div>
  );
}
