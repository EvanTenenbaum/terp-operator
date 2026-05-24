import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { ContactCreateModal } from '../components/ContactCreateModal';
import type { GridRow } from '../../shared/types';

const ROLE_FILTERS = ['customer', 'vendor', 'referee', 'contractor', 'employee', 'processor'] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

export function ContactsView() {
  const navigate = useNavigate();
  const [roleFilter, setRoleFilter] = useState<RoleFilter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isError, refetch } = trpc.queries.contactDirectory.useQuery({
    limit: 50,
    roleFilter: roleFilter.length ? roleFilter : undefined,
    query: searchQuery || undefined,
  });

  // TODO: Contact merge UI — when implemented, expose a deduplicate workflow here.
  // The backend mergeCandidateCount query exists but the merge action has no UI yet.
  // Track implementation in the Recovery view or a dedicated contact merge modal.

  const columnDefs: ColDef<GridRow>[] = [
    {
      field: 'name',
      headerName: 'Name',
      flex: 2,
      cellRenderer: (params: { data: GridRow; value: string }) => (
        <button
          className="text-button font-medium text-left"
          onClick={() => navigate(`/contacts/${String(params.data.id)}`)}
          type="button"
        >
          {params.value}
        </button>
      ),
    },
    {
      field: 'roles',
      headerName: 'Roles',
      flex: 2,
      valueGetter: (params) => {
        const d = params.data as Record<string, unknown>;
        if (!d) return '';
        const roles: string[] = [];
        if (d.isCustomer)   roles.push('Customer');
        if (d.isVendor)     roles.push('Vendor');
        if (d.isReferee)    roles.push('Referee');
        if (d.isContractor) roles.push('Contractor');
        if (d.isEmployee)   roles.push('Employee');
        if (d.isProcessor)  roles.push('Processor');
        return roles.join(', ');
      },
    },
    { field: 'companyName', headerName: 'Company',  flex: 2 },
    { field: 'phone',       headerName: 'Phone',    flex: 1 },
    { field: 'email',       headerName: 'Email',    flex: 2 },
    {
      field: 'customerBalance',
      headerName: 'Balance',
      flex: 1,
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '—',
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Control band — search + role filter toggles + new contact action */}
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 flex-wrap">
        <h1 className="text-lg font-semibold text-zinc-900 mr-2">
          Contacts
          {data ? (
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {data.rows.length} contacts
            </span>
          ) : null}
        </h1>
        <input
          className="h-8 rounded border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-primary w-48"
          placeholder="Search by name or email…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search contacts"
        />
        {ROLE_FILTERS.map((role) => (
          <button
            key={role}
            type="button"
            className={`secondary-button compact-action ${roleFilter.includes(role) ? 'font-semibold ring-1 ring-primary' : ''}`}
            onClick={() =>
              setRoleFilter((prev) =>
                prev.includes(role)
                  ? prev.filter((r) => r !== role)
                  : [...prev, role]
              )
            }
            aria-pressed={roleFilter.includes(role)}
          >
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </button>
        ))}
        <div className="ml-auto">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
            onClick={() => setShowCreate(true)}
          >
            New Contact
          </button>
        </div>
      </div>

      <div className="flex-1">
        <OperatorGrid
          view="contacts"
          title="All Contacts"
          rows={data?.rows ?? []}
          columns={columnDefs}
          loading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No contacts yet"
          emptyChildren={
            <p className="text-sm text-zinc-500">
              Create your first contact with the button above.
            </p>
          }
        />
      </div>

      {showCreate && <ContactCreateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
