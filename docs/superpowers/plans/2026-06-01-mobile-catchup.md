# Mobile Catch-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch the mobile shell up to current desktop features: implement real Contacts + Contact Profile views, add My Drafts to Dashboard, and add casePack/draftReservedQty display + wired action commands to Inventory.

**Architecture:** Option B from the design spec — new `MobileContactCard` shared component drives both Contacts views; all four existing mobile view files receive surgical patches; no changes to MobileShell, MobileCatalogView, MobilePaymentsView, or any desktop file.

**Tech Stack:** React 18, TypeScript, tRPC, Vitest + React Testing Library, Tailwind + mobile CSS tokens (`--m-*`), react-router-dom v6

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `src/client/components/mobile/MobileContactCard.tsx` | Reusable contact list-row (name, role badges, balance) |
| **Create** | `src/client/components/mobile/MobileContactCard.test.tsx` | Unit tests for MobileContactCard |
| **Replace** | `src/client/views/mobile/MobileContactsView.tsx` | Real contact list with search + role filter |
| **Create** | `src/client/views/mobile/MobileContactsView.test.tsx` | Tests for contact list |
| **Replace** | `src/client/views/mobile/MobileContactProfileView.tsx` | Lightweight profile: facts + balance + history |
| **Create** | `src/client/views/mobile/MobileContactProfileView.test.tsx` | Tests for contact profile |
| **Patch** | `src/client/views/mobile/MobileDashboardView.tsx` | Add My Drafts section |
| **Patch** | `src/client/views/mobile/MobileDashboardView.test.tsx` | Add My Drafts tests |
| **Patch** | `src/client/views/mobile/MobileInventoryView.tsx` | casePack + draftReservedQty display + wired actions |
| **Patch** | `src/client/views/mobile/MobileInventoryView.test.tsx` | Tests for new fields + actions |

---

## Task 1: MobileContactCard component

**Files:**
- Create: `src/client/components/mobile/MobileContactCard.tsx`
- Create: `src/client/components/mobile/MobileContactCard.test.tsx`

### Step 1.1: Write the failing test

Create `src/client/components/mobile/MobileContactCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileContactCard } from './MobileContactCard';

const BASE = {
  id: 'c1',
  name: 'Acme Corp',
  displayName: null,
  companyName: 'Acme Corp Ltd',
  isCustomer: true,
  isVendor: false,
  isReferee: false,
  isProcessor: false,
  isContractor: false,
  isEmployee: false,
  customerBalance: 14500,
  vendorOpenBills: null,
};

describe('MobileContactCard', () => {
  it('renders name', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders company name', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByText('Acme Corp Ltd')).toBeInTheDocument();
  });

  it('shows Customer badge when isCustomer', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('shows positive customer balance in accent color', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByText(/balance.*\$14,500/i)).toBeInTheDocument();
  });

  it('does not show balance when customerBalance is 0', () => {
    render(<MobileContactCard contact={{ ...BASE, customerBalance: 0 }} onClick={() => {}} />);
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument();
  });

  it('shows vendor open bills in amber when > 0', () => {
    const contact = { ...BASE, isCustomer: false, isVendor: true, customerBalance: null, vendorOpenBills: 5000 };
    render(<MobileContactCard contact={contact} onClick={() => {}} />);
    expect(screen.getByText('Vendor')).toBeInTheDocument();
    expect(screen.getByText(/owes.*\$5,000/i)).toBeInTheDocument();
  });

  it('shows up to 3 role badges', () => {
    const contact = {
      ...BASE,
      isCustomer: true, isVendor: true, isReferee: true,
      isContractor: true, isEmployee: false, isProcessor: false,
    };
    render(<MobileContactCard contact={contact} onClick={() => {}} />);
    // Max 3 badges shown
    const badges = screen.getAllByText(/Customer|Vendor|Referee|Contractor/);
    expect(badges.length).toBeLessThanOrEqual(3);
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<MobileContactCard contact={BASE} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is accessible — button has aria-label with contact name', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /acme corp/i })).toBeInTheDocument();
  });
});
```

- [ ] Create the test file with the content above.

### Step 1.2: Run the test — expect failures

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/components/mobile/MobileContactCard.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: Errors about `MobileContactCard` not found.

- [ ] Run and confirm failures.

### Step 1.3: Implement MobileContactCard

Create `src/client/components/mobile/MobileContactCard.tsx`:

```tsx
interface Contact {
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

interface MobileContactCardProps {
  contact: Contact;
  onClick: () => void;
}

const ROLE_PRIORITY: Array<{ key: keyof Contact; label: string }> = [
  { key: 'isCustomer',   label: 'Customer'   },
  { key: 'isVendor',     label: 'Vendor'     },
  { key: 'isReferee',    label: 'Referee'    },
  { key: 'isContractor', label: 'Contractor' },
  { key: 'isEmployee',   label: 'Employee'   },
  { key: 'isProcessor',  label: 'Processor'  },
];

function formatMoney(n: number): string {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function MobileContactCard({ contact, onClick }: MobileContactCardProps) {
  const roles = ROLE_PRIORITY.filter(r => contact[r.key]).slice(0, 3);
  const customerBalance = Number(contact.customerBalance ?? 0);
  const vendorOpenBills = Number(contact.vendorOpenBills ?? 0);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={contact.name}
      className="flex w-full min-h-[64px] flex-col gap-1 py-4 text-left"
    >
      {/* Top row: name + role badges */}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold" style={{ color: 'var(--m-ink)' }}>
          {contact.name}
        </span>
        <div className="flex shrink-0 gap-1">
          {roles.map(r => (
            <span key={r.label} className="m-badge m-badge-neutral">{r.label}</span>
          ))}
        </div>
      </div>

      {/* Middle row: company + balance */}
      <div className="flex items-center justify-between text-xs gap-2" style={{ color: 'var(--m-muted-2)' }}>
        <span className="truncate">{contact.companyName ?? ''}</span>
        <span className="shrink-0">
          {customerBalance > 0 && (
            <span style={{ color: 'var(--m-accent)' }}>
              Balance: {formatMoney(customerBalance)}
            </span>
          )}
          {vendorOpenBills > 0 && (
            <span style={{ color: 'var(--m-amber)' }}>
              Owes: {formatMoney(vendorOpenBills)}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
```

- [ ] Create the implementation file.

### Step 1.4: Run tests — expect pass

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/components/mobile/MobileContactCard.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: All 8 tests PASS.

- [ ] Run and confirm all pass.

### Step 1.5: Commit

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
git add src/client/components/mobile/MobileContactCard.tsx src/client/components/mobile/MobileContactCard.test.tsx
git commit -m "feat(mobile): MobileContactCard reusable contact list-row component"
```

- [ ] Commit.

---

## Task 2: MobileContactsView (replace stub)

**Files:**
- Replace: `src/client/views/mobile/MobileContactsView.tsx`
- Create: `src/client/views/mobile/MobileContactsView.test.tsx`

### Step 2.1: Write the failing test

Create `src/client/views/mobile/MobileContactsView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      contactDirectory: { useQuery: vi.fn() },
    },
  },
}));

import { trpc } from '../../api/trpc';
import { MobileContactsView } from './MobileContactsView';

const mockDir = trpc.queries.contactDirectory.useQuery as ReturnType<typeof vi.fn>;

const CONTACTS = [
  { id: 'c1', name: 'Acme Corp', displayName: null, companyName: 'Acme Corp Ltd', isCustomer: true, isVendor: false, isReferee: false, isProcessor: false, isContractor: false, isEmployee: false, customerBalance: 14500, vendorOpenBills: 0 },
  { id: 'c2', name: 'Blue River Farm', displayName: null, companyName: null, isCustomer: false, isVendor: true, isReferee: false, isProcessor: false, isContractor: false, isEmployee: false, customerBalance: 0, vendorOpenBills: 3200 },
  { id: 'c3', name: 'Carl Employee', displayName: null, companyName: null, isCustomer: false, isVendor: false, isReferee: false, isProcessor: false, isContractor: false, isEmployee: true, customerBalance: 0, vendorOpenBills: 0 },
];

beforeEach(() => {
  navigateMock.mockClear();
  mockDir.mockReturnValue({ data: { rows: CONTACTS, nextCursor: null }, isLoading: false });
});

function renderView() {
  return render(<MemoryRouter><MobileContactsView /></MemoryRouter>);
}

describe('MobileContactsView', () => {
  it('renders all contact names', () => {
    renderView();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Blue River Farm')).toBeInTheDocument();
    expect(screen.getByText('Carl Employee')).toBeInTheDocument();
  });

  it('filters contacts by search text', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Blue' } });
    expect(screen.getByText('Blue River Farm')).toBeInTheDocument();
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });

  it('filters contacts by Customer role chip', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('Blue River Farm')).not.toBeInTheDocument();
  });

  it('filters contacts by Vendor role chip', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Vendor' }));
    expect(screen.getByText('Blue River Farm')).toBeInTheDocument();
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });

  it('shows empty state when no contacts match', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzznomatch' } });
    expect(screen.getByText(/no contacts match/i)).toBeInTheDocument();
  });

  it('navigates to profile when a contact card is clicked', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /acme corp/i }));
    expect(navigateMock).toHaveBeenCalledWith('/mobile/contacts/c1');
  });

  it('shows loading skeletons while data loads', () => {
    mockDir.mockReturnValue({ data: undefined, isLoading: true });
    renderView();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('shows count line', () => {
    renderView();
    expect(screen.getByText(/showing 3 contacts/i)).toBeInTheDocument();
  });
});
```

- [ ] Create the test file.

### Step 2.2: Run test — expect failures

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileContactsView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: Errors — stub view has no real content.

- [ ] Run and confirm failures.

### Step 2.3: Replace MobileContactsView

Replace the full content of `src/client/views/mobile/MobileContactsView.tsx`:

```tsx
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
  const [search, setSearch]       = useState('');
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
```

- [ ] Replace the file content.

### Step 2.4: Run tests — expect pass

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileContactsView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: All 8 tests PASS.

- [ ] Run and confirm all pass.

### Step 2.5: Commit

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
git add src/client/views/mobile/MobileContactsView.tsx src/client/views/mobile/MobileContactsView.test.tsx
git commit -m "feat(mobile): real MobileContactsView — search, role filter, contact list (replaces stub)"
```

- [ ] Commit.

---

## Task 3: MobileContactProfileView (replace stub)

**Files:**
- Replace: `src/client/views/mobile/MobileContactProfileView.tsx`
- Create: `src/client/views/mobile/MobileContactProfileView.test.tsx`

### Step 3.1: Write the failing test

Create `src/client/views/mobile/MobileContactProfileView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      contactProfile:  { useQuery: vi.fn() },
      relatedCommands: { useQuery: vi.fn() },
    },
  },
}));

import { trpc } from '../../api/trpc';
import { MobileContactProfileView } from './MobileContactProfileView';

const mockProfile  = trpc.queries.contactProfile.useQuery  as ReturnType<typeof vi.fn>;
const mockCommands = trpc.queries.relatedCommands.useQuery as ReturnType<typeof vi.fn>;

const PROFILE = {
  contact: {
    id: 'c1', name: 'Acme Corp', display_name: null,
    company_name: 'Acme Corp Ltd', phone: '555-1234', email: 'acme@example.com',
    address: '123 Main St', notes: 'Long-term customer',
    is_customer: true, is_vendor: false, is_referee: false,
    is_processor: false, is_contractor: false, is_employee: false,
    tags: null,
  },
  customer: { id: 'cu1', balance: 14500, credit_limit: 25000 },
  vendor: null, referee: null, processor: null, user: null,
  upcomingAppointmentCount: 0,
};

const COMMANDS = [
  { id: 'cmd1', commandName: 'logPayment', actorName: 'Maya R.', createdAt: new Date('2026-05-30').toISOString(), toast: 'Payment received $5,200' },
];

beforeEach(() => {
  mockProfile.mockReturnValue({ data: PROFILE, isLoading: false });
  mockCommands.mockReturnValue({ data: COMMANDS });
});

function renderView(id = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/mobile/contacts/${id}`]}>
      <Routes>
        <Route path="/mobile/contacts/:id" element={<MobileContactProfileView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MobileContactProfileView', () => {
  it('renders contact name', () => {
    renderView();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders company name', () => {
    renderView();
    expect(screen.getByText('Acme Corp Ltd')).toBeInTheDocument();
  });

  it('renders phone and email as plain text (no links)', () => {
    renderView();
    expect(screen.getByText('555-1234')).toBeInTheDocument();
    expect(screen.getByText('acme@example.com')).toBeInTheDocument();
    // No tel: or mailto: links
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows Customer badge', () => {
    renderView();
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('shows customer balance and credit limit', () => {
    renderView();
    expect(screen.getByText(/\$14,500/)).toBeInTheDocument();
    expect(screen.getByText(/\$25,000/)).toBeInTheDocument();
  });

  it('shows command history entries', () => {
    renderView();
    expect(screen.getByText('logPayment')).toBeInTheDocument();
    expect(screen.getByText('Maya R.')).toBeInTheDocument();
    expect(screen.getByText(/payment received/i)).toBeInTheDocument();
  });

  it('shows empty history state when no commands', () => {
    mockCommands.mockReturnValue({ data: [] });
    renderView();
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockProfile.mockReturnValue({ data: undefined, isLoading: true });
    renderView();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows not found state when no profile data', () => {
    mockProfile.mockReturnValue({ data: null, isLoading: false });
    renderView();
    expect(screen.getByText(/contact not found/i)).toBeInTheDocument();
  });
});
```

- [ ] Create the test file.

### Step 3.2: Run test — expect failures

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileContactProfileView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: Failures — stub view has no real content.

- [ ] Run and confirm failures.

### Step 3.3: Implement MobileContactProfileView

Replace the full content of `src/client/views/mobile/MobileContactProfileView.tsx`:

```tsx
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../../api/trpc';
import { MobileEmptyState } from '../../components/mobile/MobileEmptyState';

const ROLE_FLAGS: Array<{ key: string; label: string }> = [
  { key: 'is_customer',   label: 'Customer'   },
  { key: 'is_vendor',     label: 'Vendor'     },
  { key: 'is_referee',    label: 'Referee'    },
  { key: 'is_contractor', label: 'Contractor' },
  { key: 'is_employee',   label: 'Employee'   },
  { key: 'is_processor',  label: 'Processor'  },
];

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="m-section-header">{children}</p>;
}

export function MobileContactProfileView() {
  const { id: contactId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const profileQuery  = trpc.queries.contactProfile.useQuery(
    { contactId: contactId ?? '' },
    { enabled: Boolean(contactId) }
  );
  const commandsQuery = trpc.queries.relatedCommands.useQuery(
    { contactId: contactId ?? '' },
    { enabled: Boolean(contactId) }
  );

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm" style={{ color: 'var(--m-muted)' }}>
        Loading…
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm" style={{ color: 'var(--m-muted)' }}>
        Contact not found.
      </div>
    );
  }

  const { contact, customer, vendor } = profileQuery.data as {
    contact: Record<string, unknown>;
    customer: Record<string, unknown> | null;
    vendor: Record<string, unknown> | null;
    referee: Record<string, unknown> | null;
    processor: Record<string, unknown> | null;
    user: Record<string, unknown> | null;
    upcomingAppointmentCount: number;
  };

  const c = contact as Record<string, unknown>;
  const roles = ROLE_FLAGS.filter(r => Boolean(c[r.key]));
  const commands = (commandsQuery.data ?? []) as Array<Record<string, unknown>>;
  const hasFinancials = Boolean(c.is_customer || c.is_vendor);

  return (
    <div className="pb-8">
      {/* Back */}
      <div className="flex items-center gap-2 px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: 'var(--m-panel)', color: 'var(--m-accent)' }}
          aria-label="Go back"
        >
          ←
        </button>
        <span className="text-xs" style={{ color: 'var(--m-muted-2)' }}>Back</span>
      </div>

      {/* Header card */}
      <div className="mx-4 mt-3 m-card p-4">
        <p className="text-xl font-bold" style={{ color: 'var(--m-ink)' }}>
          {String(c.name ?? '')}
        </p>
        {c.display_name && c.display_name !== c.name && (
          <p className="text-sm" style={{ color: 'var(--m-muted-2)' }}>{String(c.display_name)}</p>
        )}
        {c.company_name && (
          <p className="text-sm" style={{ color: 'var(--m-muted)' }}>{String(c.company_name)}</p>
        )}
        {roles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {roles.map(r => (
              <span key={r.label} className="m-badge m-badge-neutral">{r.label}</span>
            ))}
          </div>
        )}
      </div>

      {/* Contact facts */}
      <SectionLabel>Contact</SectionLabel>
      <div className="mx-4 m-card p-4">
        <div className="grid grid-cols-2 gap-y-3 text-sm">
          {c.phone ? (
            <div>
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Phone</p>
              <p style={{ color: 'var(--m-ink)' }}>{String(c.phone)}</p>
            </div>
          ) : null}
          {c.email ? (
            <div>
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Email</p>
              <p style={{ color: 'var(--m-ink)' }}>{String(c.email)}</p>
            </div>
          ) : null}
          {c.address ? (
            <div className="col-span-2">
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Address</p>
              <p style={{ color: 'var(--m-ink)' }}>{String(c.address)}</p>
            </div>
          ) : null}
        </div>
        {c.notes && (
          <p className="mt-3 text-xs italic" style={{ color: 'var(--m-muted)' }}>{String(c.notes)}</p>
        )}
      </div>

      {/* Balance section — shown only for customers and vendors */}
      {hasFinancials && (
        <>
          <SectionLabel>Financials</SectionLabel>
          <div className="mx-4 m-card p-4">
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              {customer && (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Balance</p>
                    <p style={{ color: 'var(--m-accent)' }}>{formatMoney(customer.balance as number)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Credit Limit</p>
                    <p style={{ color: 'var(--m-ink)' }}>{formatMoney(customer.credit_limit as number)}</p>
                  </div>
                </>
              )}
              {vendor && Number((vendor as Record<string, unknown>).open_bills_amount ?? 0) > 0 && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Open Bills</p>
                  <p style={{ color: 'var(--m-amber)' }}>{formatMoney((vendor as Record<string, unknown>).open_bills_amount as number)}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* History */}
      <SectionLabel>History</SectionLabel>
      {commands.length === 0 ? (
        <div className="mx-4">
          <MobileEmptyState icon="📋" headline="No history yet" />
        </div>
      ) : (
        <div className="mx-4 m-card overflow-hidden p-0">
          {commands.slice(0, 10).map((cmd, i) => (
            <div
              key={String(cmd.id)}
              className="flex flex-col gap-0.5 px-4 py-3"
              style={{ borderBottom: i < commands.slice(0, 10).length - 1 ? '1px solid var(--m-line)' : 'none' }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium" style={{ color: 'var(--m-ink)' }}>
                  {String(cmd.commandName ?? '—')}
                </p>
                <p className="shrink-0 text-xs" style={{ color: 'var(--m-muted-2)' }}>
                  {new Date(String(cmd.createdAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <p className="text-xs" style={{ color: 'var(--m-muted-2)' }}>
                {String(cmd.actorName ?? '—')}
              </p>
              {cmd.toast && (
                <p className="text-xs" style={{ color: 'var(--m-muted)' }}>{String(cmd.toast)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] Replace the file content.

### Step 3.4: Run tests — expect pass

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileContactProfileView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: All 8 tests PASS.

- [ ] Run and confirm all pass.

### Step 3.5: Commit

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
git add src/client/views/mobile/MobileContactProfileView.tsx src/client/views/mobile/MobileContactProfileView.test.tsx
git commit -m "feat(mobile): real MobileContactProfileView — facts, balance, command history (replaces stub)"
```

- [ ] Commit.

---

## Task 4: Dashboard My Drafts section

**Files:**
- Patch: `src/client/views/mobile/MobileDashboardView.tsx`
- Patch: `src/client/views/mobile/MobileDashboardView.test.tsx`

### Step 4.1: Add My Drafts tests to existing test file

Open `src/client/views/mobile/MobileDashboardView.test.tsx`.

**Step A — Add `myDrafts` to the trpc mock** (modify the `vi.mock('../../api/trpc', ...)` block):

```ts
vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: {
      dashboard: { useQuery: vi.fn() },
      workQueue:  { useQuery: vi.fn() },
      myDrafts:   { useQuery: vi.fn() },   // ← add this line
    },
  },
}));
```

**Step B — Add the mock variable** (after existing mock variable declarations):

```ts
const mockMyDrafts = trpc.queries.myDrafts.useQuery as ReturnType<typeof vi.fn>;
```

**Step C — Add default return to `beforeEach`**:

```ts
mockMyDrafts.mockReturnValue({ data: [], isLoading: false });
```

**Step D — Add three new test cases** (at the end of the `describe('MobileDashboardView')` block):

```ts
it('hides My Drafts section when no drafts', () => {
  mockMyDrafts.mockReturnValue({ data: [], isLoading: false });
  renderView();
  expect(screen.queryByText(/my drafts/i)).not.toBeInTheDocument();
});

it('shows My Drafts section when drafts exist', () => {
  mockMyDrafts.mockReturnValue({
    data: [
      { id: 'd1', lane: 'Sales', title: 'SO-2001', route: 'sales', status: 'draft' },
      { id: 'd2', lane: 'Purchase Order', title: 'PO-1002', route: 'purchaseOrders', status: 'draft' },
    ],
    isLoading: false,
  });
  renderView();
  expect(screen.getByText(/my drafts/i)).toBeInTheDocument();
  expect(screen.getByText(/sales.*SO-2001/i)).toBeInTheDocument();
  expect(screen.getByText(/purchase order.*PO-1002/i)).toBeInTheDocument();
});

it('navigates to desktop route and sets prefer-desktop flag when a draft is clicked', () => {
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  mockMyDrafts.mockReturnValue({
    data: [{ id: 'd1', lane: 'Sales', title: 'SO-2001', route: 'sales', status: 'draft' }],
    isLoading: false,
  });
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /sales.*SO-2001/i }));
  expect(setItemSpy).toHaveBeenCalledWith('terp-prefer-desktop', 'true');
  expect(navigateMock).toHaveBeenCalledWith('/sales');
  setItemSpy.mockRestore();
});
```

- [ ] Apply these four changes to the test file.

### Step 4.2: Run new tests — expect failures

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileDashboardView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: The three new tests fail (myDrafts not implemented yet).

- [ ] Run and confirm the 3 new tests fail while existing tests still pass.

### Step 4.3: Patch MobileDashboardView

Open `src/client/views/mobile/MobileDashboardView.tsx`.

**Step A — Add myDrafts query** (after the `workQueue` query declaration, around line 4-5 of the function body):

```tsx
const myDrafts = trpc.queries.myDrafts.useQuery(undefined, { refetchInterval: 30_000 });
const draftRows = (myDrafts.data ?? []) as Array<{ id: string; lane: string; title: string; route: string }>;
```

**Step B — Add import if not already present** (the trpc import is already at the top; `useNavigate` is already imported).

**Step C — Insert My Drafts section** between the Work Queue `</div>` and the `{/* Recent activity */}` comment. The exact insertion:

```tsx
{/* My Drafts */}
{draftRows.length > 0 && (
  <>
    <p className="m-section-header">My Drafts</p>
    <div className="px-4">
      {draftRows.map(draft => (
        <button
          key={draft.id}
          type="button"
          onClick={() => {
            localStorage.setItem('terp-prefer-desktop', 'true');
            navigate('/' + draft.route);
          }}
          aria-label={`${draft.lane}: ${draft.title}`}
          className="flex min-h-14 w-full items-center justify-between border-b py-4 text-left last:border-0"
          style={{ borderColor: 'var(--m-line)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--m-ink)' }}>
            {draft.lane}: {draft.title}
          </span>
          <span className="text-xs" style={{ color: 'var(--m-muted-2)' }}>→</span>
        </button>
      ))}
    </div>
  </>
)}
```

**Step D — Verify `navigate` is used in the component** (it already is for the work queue). If for some reason it's not imported, the current code already uses `useNavigate`.

- [ ] Apply the three patches to MobileDashboardView.tsx.

### Step 4.4: Run tests — expect all pass

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileDashboardView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: All tests (original 6 + 3 new = 9) PASS.

- [ ] Run and confirm all pass.

### Step 4.5: Commit

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
git add src/client/views/mobile/MobileDashboardView.tsx src/client/views/mobile/MobileDashboardView.test.tsx
git commit -m "feat(mobile): add My Drafts section to mobile Dashboard (TER-1632)"
```

- [ ] Commit.

---

## Task 5: Inventory — new fields (casePack + draftReservedQty)

**Files:**
- Patch: `src/client/views/mobile/MobileInventoryView.tsx`
- Patch: `src/client/views/mobile/MobileInventoryView.test.tsx`

### Step 5.1: Add field tests to existing inventory test

Open `src/client/views/mobile/MobileInventoryView.test.tsx`.

**Step A — Expand test data** to include casePack and draftReservedQty in the first ROWS entry:

```ts
const ROWS = [
  { id: '1', batchCode: 'BL-01', name: 'Blue Dream',   vendor: 'Green Valley', availableQty: 48, uom: 'lb', unitPrice: 1850, unitCost: 1620, status: 'ready',       category: 'flower', location: 'Vault A', tags: 'hybrid,fast-ship', expirationDate: null, casePack: 12, draftReservedQty: 5 },
  { id: '2', batchCode: 'OG-08', name: 'OG Kush',      vendor: 'Summit',       availableQty: 12, uom: 'lb', unitPrice: 2100, unitCost: 1900, status: 'low_stock',   category: 'flower', location: 'Vault B', tags: 'indica',        expirationDate: null, casePack: null, draftReservedQty: 0 },
  { id: '3', batchCode: 'GE-03', name: 'Gelato #33',   vendor: 'Pacific',      availableQty:  0, uom: 'lb', unitPrice: 2400, unitCost: 2100, status: 'consignment', category: 'flower', location: 'Vault C', tags: '',              expirationDate: null, casePack: null, draftReservedQty: 0 },
];
```

**Step B — Add three new test cases** (at the end of the describe block):

```ts
it('shows casePack in expanded detail when > 0', () => {
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
  expect(screen.getByText(/case pack.*12/i)).toBeInTheDocument();
});

it('shows draftReservedQty in expanded detail when > 0', () => {
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
  expect(screen.getByText(/draft reserved.*5/i)).toBeInTheDocument();
});

it('does not show casePack section when casePack is null or 0', () => {
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /og kush/i }));
  expect(screen.queryByText(/case pack/i)).not.toBeInTheDocument();
});
```

- [ ] Apply the two changes to the test file.

### Step 5.2: Run new tests — expect failures

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileInventoryView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: 3 new tests fail, existing tests still pass.

- [ ] Run and confirm expected failures.

### Step 5.3: Add casePack and draftReservedQty to the inventory expanded detail

Open `src/client/views/mobile/MobileInventoryView.tsx`.

**Step A — Extract the two new fields** in the `filtered.map` block (where `location`, `tags`, `expDate` etc. are extracted):

```ts
const casePack       = Number(row.casePack ?? 0);
const draftReserved  = Number(row.draftReservedQty ?? 0);
```

**Step B — Add to the 2-col detail grid** (inside the `{isExpanded && ...}` block, after the existing Cost/Price and Location cells):

```tsx
{casePack > 0 && (
  <div>
    <p className="font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Case Pack</p>
    <p style={{ color: 'var(--m-ink)' }}>{casePack} {uom} per case</p>
  </div>
)}
{draftReserved > 0 && (
  <div>
    <p className="font-semibold uppercase" style={{ color: 'var(--m-amber)', fontSize: 10, letterSpacing: '0.06em' }}>Draft Reserved</p>
    <p style={{ color: 'var(--m-amber)' }}>{draftReserved} {uom}</p>
  </div>
)}
```

**Step C — Update the available qty display line** in the collapsed row (the middle row showing qty and price). Find the line containing `{availableQty.toLocaleString()} {uom}` and replace it:

```tsx
<span style={{ color: 'var(--m-muted)' }}>
  {draftReserved > 0
    ? `${(availableQty - draftReserved).toLocaleString()} ${uom} free (${draftReserved} reserved)`
    : `${availableQty.toLocaleString()} ${uom}`}
  {' · '}${unitPrice.toLocaleString()}/lb
</span>
```

- [ ] Apply the three patches.

### Step 5.4: Run tests — expect all pass

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileInventoryView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: All tests (original 6 + 3 new = 9) PASS.

- [ ] Run and confirm all pass.

### Step 5.5: Commit

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
git add src/client/views/mobile/MobileInventoryView.tsx src/client/views/mobile/MobileInventoryView.test.tsx
git commit -m "feat(mobile): show casePack + draftReservedQty in inventory expanded detail (TER-1618, TER-1634)"
```

- [ ] Commit.

---

## Task 6: Inventory — wired action commands

**Files:**
- Patch: `src/client/views/mobile/MobileInventoryView.tsx`
- Patch: `src/client/views/mobile/MobileInventoryView.test.tsx`

### Step 6.1: Add action tests

Open `src/client/views/mobile/MobileInventoryView.test.tsx`.

**Step A — Add new mocks** at the top of the mock section:

```ts
vi.mock('../../api/trpc', () => ({
  trpc: {
    queries: { grid: { useQuery: vi.fn() } },
    auth: { me: { useQuery: vi.fn() } },      // ← add
  },
}));
```

Add the `useCommandRunner` mock (add after the trpc mock):

```ts
const runCommandMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../../components/useCommandRunner', () => ({
  useCommandRunner: () => ({ runCommand: runCommandMock, isRunning: false }),
}));
```

**Step B — Add mock variable for auth**:

```ts
const mockMe = trpc.auth.me.useQuery as ReturnType<typeof vi.fn>;
```

**Step C — Set default in `beforeEach`**:

```ts
mockMe.mockReturnValue({ data: { id: 'u1', role: 'manager' } });
runCommandMock.mockClear();
```

**Step D — Add action tests** at the end of the describe block:

```ts
it('shows Adjust qty and Flag for review buttons in expanded detail', () => {
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
  expect(screen.getByRole('button', { name: /adjust qty/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /flag for review/i })).toBeInTheDocument();
});

it('does not show Call vendor button', () => {
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
  expect(screen.queryByRole('button', { name: /call vendor/i })).not.toBeInTheDocument();
});

it('shows inline adjust form when Adjust qty is clicked', () => {
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
  fireEvent.click(screen.getByRole('button', { name: /adjust qty/i }));
  expect(screen.getByLabelText(/delta quantity/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
});

it('shows confirm sheet for Flag for review', () => {
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
  fireEvent.click(screen.getByRole('button', { name: /flag for review/i }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(/flag batch/i)).toBeInTheDocument();
});

it('Adjust qty is disabled for non-manager role', () => {
  mockMe.mockReturnValue({ data: { id: 'u1', role: 'viewer' } });
  renderView();
  fireEvent.click(screen.getByRole('button', { name: /blue dream/i }));
  expect(screen.getByRole('button', { name: /adjust qty/i })).toBeDisabled();
});
```

- [ ] Apply the five changes to the test file.

### Step 6.2: Run new tests — expect failures

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileInventoryView.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: 5 new tests fail (action buttons not wired yet).

- [ ] Run and confirm expected failures.

### Step 6.3: Wire up action commands in MobileInventoryView

Open `src/client/views/mobile/MobileInventoryView.tsx`.

**Step A — Add imports** at the top of the file (after existing imports):

```tsx
import { trpc } from '../../api/trpc';
import { useCommandRunner } from '../../components/useCommandRunner';
import { MobileConfirmSheet } from '../../components/mobile/MobileConfirmSheet';
import { useMobileToast } from '../../components/mobile/MobileToast';
```

**Step B — Add state + hooks** inside the `MobileInventoryView` function, near the top (after existing `useState` declarations):

```tsx
const [actionMode, setActionMode] = useState<null | 'adjust' | 'flag'>(null);
const [deltaQty, setDeltaQty]     = useState<string>('');
const [adjReason, setAdjReason]   = useState<string>('');
const [flagConfirmId, setFlagConfirmId] = useState<string | null>(null);
const [adjConfirmPayload, setAdjConfirmPayload] = useState<{ batchId: string; delta: number; reason: string } | null>(null);

const me = trpc.auth.me.useQuery();
const role: string = (me.data as { role?: string } | undefined)?.role ?? 'viewer';
const isManager = role === 'owner' || role === 'manager';

const { runCommand } = useCommandRunner();
const { addToast } = useMobileToast();
```

**Step C — Add a reset helper** (after the state declarations):

```tsx
function resetAction() {
  setActionMode(null);
  setDeltaQty('');
  setAdjReason('');
}
```

**Step D — Modify `toggleExpand`** to also reset action mode when collapsing:

```tsx
function toggleExpand(id: string) {
  setExpandedId(prev => {
    if (prev === id) { resetAction(); return null; }
    resetAction();
    return id;
  });
}
```

**Step E — Replace the action buttons section** inside the expanded detail block. Find:

```tsx
{/* Quick action stubs */}
<div className="mt-3 flex gap-2">
  {['Adjust qty', 'Mark needs review', 'Call vendor'].map(action => (
    <button
      key={action}
      type="button"
      className="m-btn-secondary flex-1"
      style={{ minHeight: 36, fontSize: 11, padding: '0 8px' }}
    >
      {action}
    </button>
  ))}
</div>
```

Replace with:

```tsx
{/* Actions */}
{actionMode === null && (
  <div className="mt-3 flex gap-2">
    <button
      type="button"
      disabled={!isManager}
      aria-label="Adjust qty"
      onClick={() => setActionMode('adjust')}
      className="m-btn-secondary flex-1"
      style={{ minHeight: 36, fontSize: 11, padding: '0 8px', opacity: isManager ? 1 : 0.45 }}
      title={!isManager ? 'Manager role required' : undefined}
    >
      Adjust qty
    </button>
    <button
      type="button"
      aria-label="Flag for review"
      onClick={() => setFlagConfirmId(id)}
      className="m-btn-secondary flex-1"
      style={{ minHeight: 36, fontSize: 11, padding: '0 8px' }}
    >
      Flag for review
    </button>
  </div>
)}

{/* Inline adjust form */}
{actionMode === 'adjust' && (
  <div className="mt-3 flex flex-col gap-2">
    <label>
      <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--m-muted)' }}>Delta quantity (+/-)</span>
      <input
        type="number"
        step="0.01"
        aria-label="Delta quantity"
        value={deltaQty}
        onChange={e => setDeltaQty(e.target.value)}
        style={{ width: '100%', height: 40, borderRadius: 12, border: '1px solid var(--m-line)', padding: '0 12px', background: 'var(--m-field)', color: 'var(--m-ink)', fontSize: 14 }}
      />
    </label>
    <label>
      <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--m-muted)' }}>Reason (required)</span>
      <input
        type="text"
        aria-label="Reason"
        value={adjReason}
        onChange={e => setAdjReason(e.target.value)}
        placeholder="e.g. recount, damage, correction…"
        style={{ width: '100%', height: 40, borderRadius: 12, border: '1px solid var(--m-line)', padding: '0 12px', background: 'var(--m-field)', color: 'var(--m-ink)', fontSize: 14 }}
      />
    </label>
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!deltaQty || !adjReason.trim()}
        className="m-btn-primary flex-1"
        style={{ minHeight: 40, fontSize: 13 }}
        onClick={() => {
          const delta = Number(deltaQty);
          const reason = adjReason.trim();
          if (!Number.isFinite(delta) || delta === 0 || !reason) return;
          if (Math.abs(delta) > 10) {
            setAdjConfirmPayload({ batchId: id, delta, reason });
          } else {
            void runCommand('adjustBatchQuantity', { batchId: id, deltaQty: delta, reason })
              .then(() => { addToast(`Adjusted ${name} by ${delta}`, 'success'); resetAction(); })
              .catch(() => {});
          }
        }}
      >
        Apply
      </button>
      <button
        type="button"
        onClick={resetAction}
        className="m-btn-secondary"
        style={{ minHeight: 40, fontSize: 13, width: 80 }}
      >
        Cancel
      </button>
    </div>
  </div>
)}
```

**Step F — Add confirm sheets** outside the `filtered.map` loop, just before the closing `</div>` of the component:

```tsx
{/* Adjust quantity confirm sheet (large deltas) */}
<MobileConfirmSheet
  open={adjConfirmPayload !== null}
  summary={adjConfirmPayload
    ? `Adjust ${adjConfirmPayload.delta > 0 ? '+' : ''}${adjConfirmPayload.delta} lb — ${adjConfirmPayload.reason}`
    : ''}
  confirmLabel="Apply Adjustment"
  onConfirm={async () => {
    const p = adjConfirmPayload;
    setAdjConfirmPayload(null);
    if (!p) return;
    try {
      await runCommand('adjustBatchQuantity', { batchId: p.batchId, deltaQty: p.delta, reason: p.reason });
      addToast(`Adjusted by ${p.delta}`, 'success');
      resetAction();
    } catch {}
  }}
  onCancel={() => setAdjConfirmPayload(null)}
/>

{/* Flag for review confirm sheet */}
<MobileConfirmSheet
  open={flagConfirmId !== null}
  summary={flagConfirmId
    ? `Flag batch for review?`
    : ''}
  confirmLabel="Flag Batch"
  onConfirm={async () => {
    const bId = flagConfirmId;
    setFlagConfirmId(null);
    if (!bId) return;
    try {
      await runCommand('flagBatch', { batchId: bId, reason: 'Flagged from mobile — needs review' });
      addToast('Batch flagged for review', 'success');
    } catch {}
  }}
  onCancel={() => setFlagConfirmId(null)}
/>
```

- [ ] Apply all six patches.

### Step 6.4: Run all inventory tests — expect all pass

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/views/mobile/MobileInventoryView.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All tests (original 6 + 3 from Task 5 + 5 new = 14) PASS.

- [ ] Run and confirm all pass.

### Step 6.5: Commit

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
git add src/client/views/mobile/MobileInventoryView.tsx src/client/views/mobile/MobileInventoryView.test.tsx
git commit -m "feat(mobile): wire inventory actions — adjustBatchQuantity, flagBatch; remove Call vendor stub"
```

- [ ] Commit.

---

## Task 7: Full test suite run

### Step 7.1: Run all mobile tests

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm exec vitest run src/client/components/mobile/ src/client/views/mobile/ --reporter=verbose 2>&1 | tail -40
```

Expected: All tests across all mobile files PASS. Zero failures.

- [ ] Run and confirm all pass.

### Step 7.2: Typecheck

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
pnpm typecheck 2>&1 | tail -30
```

Expected: Zero TypeScript errors in the changed files.

- [ ] Run and fix any type errors before proceeding.

### Step 7.3: Push branch

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
git push -u origin feat/mobile-catchup
```

- [ ] Push.

---

## Task 8: PR and tracker closeout

### Step 8.1: Open PR

```bash
cd /Users/evantenenbaum/work/terp-mobile-catchup
gh pr create \
  --title "feat(mobile): catch up to current features — Contacts, Dashboard drafts, Inventory actions" \
  --body "## Summary

Catches the mobile shell up to current desktop features and design.

### Changes
- **MobileContactCard** — new reusable contact list-row component
- **MobileContactsView** — replaces stub; real search + role filter + contact list
- **MobileContactProfileView** — replaces stub; name, company, roles, facts, balance, command history
- **MobileDashboardView** — adds My Drafts section (TER-1632)
- **MobileInventoryView** — casePack + draftReservedQty display (TER-1618, TER-1634); Adjust qty → \`adjustBatchQuantity\`; Flag for review → \`flagBatch\`; removes non-functional Call vendor stub

### What's not touched
MobileShell, MobileCatalogView, MobilePaymentsView, all desktop views — no changes.

### Testing
All mobile tests pass. TypeScript clean.

Spec: \`docs/superpowers/specs/2026-06-01-mobile-catchup-design.md\`" \
  --base main
```

- [ ] Open the PR and capture the URL.

### Step 8.2: Find the Linear issue and update it

Search Linear for an existing issue covering mobile catch-up. If none exists, note this for follow-up.

```bash
# Check if there's a relevant issue — search manually in Linear under TERP Operator project
# or check the TER-1632 issue (My Drafts) and TER-1618/TER-1634 (inventory fields)
```

- [ ] Update any matching Linear issues to In Review with a link to the PR.

---

## Self-Review Checklist

Before finishing: verify against spec `docs/superpowers/specs/2026-06-01-mobile-catchup-design.md`:

| Spec requirement | Task |
|-----------------|------|
| MobileContactCard with name, roles, balance | Task 1 |
| MobileContactsView — search + role filter | Task 2 |
| MobileContactProfileView — facts, balance, history | Task 3 |
| No tap-to-call links in profile | Task 3 (plain text only) |
| Dashboard My Drafts — hidden when empty | Task 4 |
| Dashboard My Drafts — sets prefer-desktop on click | Task 4 |
| Inventory casePack in expanded detail | Task 5 |
| Inventory draftReservedQty in expanded detail | Task 5 |
| Inventory "Adjust qty" → adjustBatchQuantity (manager) | Task 6 |
| Inventory "Flag for review" → flagBatch (any operator) | Task 6 |
| "Call vendor" removed | Task 6 |
| Full test suite green | Task 7 |
| TypeScript clean | Task 7 |

