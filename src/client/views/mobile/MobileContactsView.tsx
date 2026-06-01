import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../../api/trpc';
import { MobileContactCard } from '../../components/mobile/MobileContactCard';
import { MobileSearchInput } from '../../components/mobile/MobileSearchInput';
import { MobileFilterChips } from '../../components/mobile/MobileFilterChips';
import { MobileEmptyState } from '../../components/mobile/MobileEmptyState';

const ROLE_OPTIONS = ['All', 'Customer', 'Vendor', 'Employee', 'Referee'] as const;
type RoleOption = (typeof ROLE_OPTIONS)[number];

const ROLE_FLAG_MAP: Record<Exclude<RoleOption, 'All'>, string> = {
  Customer: 'isCustomer',
  Vendor:   'isVendor',
  Employee: 'isEmployee',
  Referee:  'isReferee',
};

interface ContactRow {
  id: string;
  name: string;
  displayName?: string | null;
  companyName?: string | null;
  isCustomer: boolean;
  isVendor: boolean;
  isReferee: boolean;
  isProcessor: boolean;
  isContractor: boolean;
  isEmployee: boolean;
  customerBalance?: number | null;
  vendorOpenBills?: number | null;
}

function Skeleton() {
  return (
    <div
      data-testid="skeleton"
      className="h-16 animate-pulse rounded-md"
      style={{ background: 'var(--m-line)' }}
    />
  );
}

export function MobileContactsView() {
  const navigate = useNavigate();
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleOption>('All');

  const directory = trpc.queries.contactDirectory.useQuery(
    { limit: 50 },
    { refetchInterval: 60_000 }
  );

  const rows = ((directory.data as { rows?: ContactRow[] } | undefined)?.rows ?? []) as ContactRow[];

  const filtered = rows.filter(c => {
    const haystack = `${c.name} ${c.companyName ?? ''}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (roleFilter !== 'All') {
      const flag = ROLE_FLAG_MAP[roleFilter];
      if (!c[flag as keyof ContactRow]) return false;
    }
    return true;
  });

  function clearFilters() {
    setSearch('');
    setRoleFilter('All');
  }

  return (
    <div>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 border-b px-4 pb-2 pt-3"
        style={{ background: 'var(--m-field)', borderColor: 'var(--m-line)' }}
      >
        <MobileSearchInput value={search} onChange={setSearch} placeholder="Search contacts…" />
        <MobileFilterChips
          className="mt-2"
          options={ROLE_OPTIONS as unknown as string[]}
          value={roleFilter}
          onChange={v => setRoleFilter(v as RoleOption)}
        />
        <p className="mt-2 text-xs" style={{ color: 'var(--m-muted-2)' }}>
          Showing {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* List */}
      {directory.isLoading ? (
        <div className="flex flex-col gap-3 px-4 py-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <MobileEmptyState
          icon="👤"
          headline="No contacts match"
          body="Clear filters to see all contacts."
          ctaLabel="Clear filters"
          onCta={clearFilters}
        />
      ) : (
        <div className="divide-y px-4" style={{ borderColor: 'var(--m-line)' }}>
          {filtered.map(c => (
            <MobileContactCard
              key={c.id}
              contact={c}
              onClick={() => navigate(`/mobile/contacts/${c.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
