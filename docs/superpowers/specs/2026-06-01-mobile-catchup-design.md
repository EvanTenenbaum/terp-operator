# Mobile Catch-Up Design

**Date:** 2026-06-01  
**Author:** Claude Sonnet 4.6 / Evan  
**Scope:** Catch mobile views up to current desktop features and design

---

## Problem

The mobile shell (`/mobile/*`) was built in PR #270 with five views. Since then:

1. **Contacts + Contact Profile** are complete stubs — backend queries (`contactDirectory`, `contactProfile`, `relatedCommands`) shipped in PR #209 but the mobile views were never implemented.
2. **Dashboard** is missing the "My Drafts" section added in TER-1632.
3. **Inventory** is missing `casePack` (TER-1618) and `draftReservedQty` (TER-1634) fields; the quick-action buttons in expanded rows are non-functional stubs.

Catalog and Payments are current. Pick view uses its own mobile-first layout inside the desktop route.

---

## Goals

- Implement real Contacts list and Contact Profile (lighter than desktop: no tabs, but includes balance + history)
- Add My Drafts to mobile Dashboard
- Surface casePack and draftReservedQty in mobile Inventory; wire action buttons to real commands

---

## Out of Scope

- Full desktop feature parity for Contacts (no 7-tab profile)
- Tap-to-call / mailto links (operator preference)
- Catalog, Payments, Pick view (no changes needed)
- New mobile views for desktop-only features (Intake, Sales, POs, etc.)

---

## Architecture

**New files:**
- `src/client/components/mobile/MobileContactCard.tsx` — reusable contact list-row

**Modified files:**
- `src/client/views/mobile/MobileContactsView.tsx` — replace stub with real list
- `src/client/views/mobile/MobileContactProfileView.tsx` — replace stub with lightweight profile
- `src/client/views/mobile/MobileDashboardView.tsx` — add My Drafts section
- `src/client/views/mobile/MobileInventoryView.tsx` — new fields + wired action commands

No changes to: MobileShell, MobileCatalogView, MobilePaymentsView, styles-mobile.css, any desktop files.

---

## Section 1: MobileContactCard (new component)

File: `src/client/components/mobile/MobileContactCard.tsx`

**Props:**
```ts
interface MobileContactCardProps {
  contact: {
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
  };
  onClick: () => void;
}
```

**Layout (list row):**
- Row: min-height 64px, full-width button
- Top line: name (font-semibold, truncate) + up to 3 role badges right-aligned
- Middle line: companyName (muted-2) + balance (right: customer balance in accent if > 0; vendor open bills in amber if > 0)
- Role badge priority order: Customer, Vendor, Referee, Contractor, Employee, Processor (show max 3)
- Balance display: if customerBalance > 0 → `Balance: $X` in accent; if vendorOpenBills > 0 → `Owes: $X` in amber; both can show

---

## Section 2: MobileContactsView (replace stub)

File: `src/client/views/mobile/MobileContactsView.tsx`

**Data:** `trpc.queries.contactDirectory.useQuery({ query, roleFilter, limit: 50 })`

**UI:**
1. Sticky header bar:
   - `MobileSearchInput` (value=`search`, onChange=`setSearch`)
   - `MobileFilterChips` with options: `['All', 'Customer', 'Vendor', 'Employee', 'Referee']`
   - Count line: "Showing N contacts"
2. List of `MobileContactCard` rows (client-side filtered by search + role)
3. `MobileEmptyState` when filtered list is empty (icon=👤, headline="No contacts match", CTA="Clear filters")
4. Loading state: 4 skeleton rows

**Role chip → roleFilter mapping:**
- All → undefined
- Customer → `['customer']`
- Vendor → `['vendor']`
- Employee → `['employee']`
- Referee → `['referee']`

**Navigation:** tapping a card navigates to `/mobile/contacts/:id`

---

## Section 3: MobileContactProfileView (replace stub)

File: `src/client/views/mobile/MobileContactProfileView.tsx`

**Data:**
- `trpc.queries.contactProfile.useQuery({ contactId })` → contact, customer, vendor rows
- `trpc.queries.relatedCommands.useQuery({ contactId })` → history

**Layout (single scroll, no tabs):**

1. **Back button** — `navigate(-1)` with ← arrow, top-left

2. **Header card** (`m-card`):
   - Name (xl, bold) + displayName below (muted-2, if different from name)
   - Company name (sm, muted)
   - Role badges row (Customer, Vendor, Referee, etc. from boolean flags)

3. **Contact facts** (2-col grid in `m-card`):
   - Phone (plain text, no link)
   - Email (plain text, no link)
   - Address (if present)
   - Notes (full width, if present, italic muted)

4. **Balance section** (`m-card`, shown only if customer or vendor):
   - Customer: "Customer Balance: $X" + "Credit Limit: $X"
   - Vendor: "Open Bills: $X" in amber if > 0
   
5. **History section** (`m-section-header` + list):
   - Calls `relatedCommands` with contactId
   - Shows last 10 entries as rows: date (xs, muted-2) + command name (sm, ink) + actor (xs, muted-2) + result (xs, truncate)
   - `MobileEmptyState` (icon=📋, headline="No history yet") when commands.length === 0

---

## Section 4: Dashboard My Drafts

File: `src/client/views/mobile/MobileDashboardView.tsx`

**Data:** `trpc.queries.myDrafts.useQuery(undefined, { refetchInterval: 30_000 })`

**Placement:** After Work Queue section, before Recent Activity.

**Behavior:**
- Hidden entirely when `drafts.data?.length === 0` or loading — no empty state, no skeleton
- When drafts exist: `m-section-header` "My Drafts" + list of draft rows
- Each draft row: full-width button, shows `{draft.lane}: {draft.title}`
- On tap: set `localStorage.setItem('terp-prefer-desktop', 'true')` then `navigate('/' + draft.route)` — navigates to the desktop view for that draft (since mobile doesn't have views for Sales/PO drafts)

---

## Section 5: Inventory Updates

File: `src/client/views/mobile/MobileInventoryView.tsx`

### 5a: New fields in expanded detail

In the 2-col detail grid, add:
- **Case Pack**: `{casePack} {uom}` per case — shown only when `casePack > 0`
- **Draft Reserved**: `{draftReservedQty} {uom}` in amber — shown only when `draftReservedQty > 0`

In the summary line (middle row of collapsed batch button), when `draftReservedQty > 0`:
- Change display from `{availableQty} {uom}` to `{(availableQty - draftReservedQty).toFixed(2)} {uom} free (${draftReservedQty} reserved)` in muted text

### 5b: Wired action buttons

Replace the current stub array `['Adjust qty', 'Mark needs review', 'Call vendor']` with two real actions.

**"Adjust qty"** (manager role required):
- Button click → sets per-row `actionMode` state to `'adjust'`
- Shows inline form within expanded detail:
  - Number input for delta qty (positive=increase, negative=decrease)  
  - Text input for reason (required)
  - "Submit Adjustment" button → `runCommand('adjustBatchQuantity', { batchId: id, deltaQty: delta, reason })`
  - Confirm via `MobileConfirmSheet` when `Math.abs(delta) > 10` (arbitrary threshold for caution on large adjustments)
  - Cancel button → resets `actionMode` to null
- If user role is not manager: button is disabled with tooltip "Manager role required"

**"Flag for review"** (operator role, any authenticated user):
- Button click → opens `MobileConfirmSheet` with:
  - Summary: "Flag {batchCode} for review?"
  - Confirm label: "Flag Batch"
  - On confirm: `runCommand('flagBatch', { batchId: id, reason: 'Flagged from mobile — needs review' })`
- Toast on success via `useMobileToast`

**Role gate:** Read `me.data?.role` (type-asserted as `{ role?: string }`). Manager gates on `role === 'owner' || role === 'manager'`.

---

## Data Dependencies

| Feature | tRPC Query | Already exists? |
|---------|-----------|----------------|
| Contacts list | `queries.contactDirectory` | ✅ Yes (PR #209) |
| Contact profile | `queries.contactProfile` | ✅ Yes (PR #209) |
| Contact history | `queries.relatedCommands` | ✅ Yes (PR #209) |
| My Drafts | `queries.myDrafts` | ✅ Yes (TER-1632) |
| Inventory fields | `queries.grid({ view: 'inventory' })` | ✅ casePack + draftReservedQty in GridRow |
| adjustBatchQuantity | command | ✅ Yes |
| flagBatch | command | ✅ Yes |

---

## QA Tier

**Deep QA** — changes touch operator-facing UI and wired commands (`adjustBatchQuantity`, `flagBatch`). AQA required before done claim. Payments view (money path) is unchanged so no money-path risk.

---

## Success Criteria

1. `/mobile/contacts` shows a real searchable contact list (no placeholder text)
2. Tapping a contact shows name, company, roles, facts, balance, and command history
3. `/mobile/dashboard` shows "My Drafts" section when the operator has in-progress drafts
4. `/mobile/inventory` shows `casePack` and `draftReservedQty` in expanded detail when > 0
5. "Adjust qty" form submits `adjustBatchQuantity` with deltaQty + reason (manager only)
6. "Flag for review" submits `flagBatch` with confirm sheet (all operators)
7. No regression in Catalog, Payments, Dashboard KPIs, or Inventory search/filter

