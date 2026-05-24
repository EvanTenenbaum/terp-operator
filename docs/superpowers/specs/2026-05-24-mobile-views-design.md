# TERP Operator — Mobile Views Design Spec

**Date:** 2026-05-24  
**Status:** Approved (Variant C selected from 3-way wireframe review)  
**Prototype reference:** `.superpowers/brainstorm/42043-1779596771/content/mobile-prototype-gpt.html`

---

## Product Intent

Five new mobile-first views served under `/mobile/*` routes. Primary user: the **owner/operator on the go** — checking business health, triaging attention items, scanning inventory, managing buyer-facing catalog readiness, recording payments, and reaching contacts from their phone.

This is a **serious wholesale ERP companion**, not a consumer cannabis app. Design language: calm, businesslike, dense enough for an operator, touch-friendly, visually polished enough that screenshots look like a real product concept.

---

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Routing | Separate `/mobile/*` routes | Zero risk to existing desktop views |
| Shell | Bottom tab nav (5 tabs) | One-tap switching; owner switches views frequently |
| Primary user | Owner/operator on the go | Warehouse workers already served by `/pick` |
| Payment scope | Both directions (receive + pay vendor) | Owner needs full money picture on mobile |
| "Profile" view | Entity/contact profiles (CAP-033) | Vendors, buyers, contractors — not user profile |
| Design direction | Variant C — high polish | iOS-native patterns, generous whitespace, real product feel |

---

## Design System

Use plain CSS custom properties (no Tailwind CDN in mobile-specific views):

```css
--ink:         #18211f;   /* primary text */
--panel:       #f7f8f5;   /* screen background */
--field:       #ffffff;   /* cards, inputs */
--line:        #d8ded6;   /* borders, dividers */
--accent:      #216e4e;   /* primary actions */
--accent-soft: #e7f1ec;   /* accent tint for icon buttons */
--accent-deep: #1a5840;   /* pressed/gradient end */
--amber:       #b06915;   /* warnings */
--amber-soft:  #fff4df;
--danger:      #b42318;   /* destructive */
--danger-soft: #fde7e4;
--success-soft:#e8f4ee;
--muted:       #6b7280;
--muted-2:     #9ca3af;
```

### Visual Style (Variant C character)
- **Card border-radius:** 16px (generous — iOS native feel)
- **Card shadow:** `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`
- **Section headers:** 11px, uppercase, letter-spacing 0.08em, weight 700, `--muted-2`
- **Numbers/values:** 22–26px, weight 700, tabular-nums
- **Search inputs:** 44px, border-radius 12px, `#f1f3ee` background (no visible border), magnifier SVG icon
- **Filter chips:** 32px, border-radius 16px; active = `--accent` bg white text; inactive = white bg `--line` border
- **Primary buttons:** 56px min-height, border-radius 14px, weight 600, `--accent` background
- **No weed imagery, no dispensary aesthetic**

### Status Badges (always pill — never bare colored text on white)

| Status | Background | Text |
|---|---|---|
| Ready / Open / Published | #dcefe5 | #1f5a3f |
| Low Stock / Partial / Watch | #fdebd0 | #b06915 |
| Needs Review / Overdue | #fde3e1 | #b42318 |
| Consignment / No Photos | #e6eaef | #314158 |
| Draft | #fdebd0 | #b06915 |

### Sizing Rules
| Element | Value |
|---|---|
| Primary button | min-height 56px |
| Secondary tap target | min-height 44px |
| KPI grid cell | min-height 88px |
| List row | min-height 56–72px |
| Bottom nav | 64px + `env(safe-area-inset-bottom)` |
| Top header | 64px |

### Icons
Inline SVG only. 20×20, stroke-width 1.5, currentColor, round linecaps. Define once, reference via `<use>` or functions. Nav icons: house / box / photo-rectangle / credit-card / person.

---

## App Shell

### Routes (new — no changes to existing desktop routes)
```
/mobile/dashboard   → MobileDashboardView
/mobile/inventory   → MobileInventoryView
/mobile/catalog     → MobileCatalogView
/mobile/payments    → MobilePaymentsView
/mobile/contacts    → MobileContactsView
/mobile/contacts/:id → MobileContactProfileView
```

### Shell Component (`MobileShell`)
- Fixed top header (64px): TERP wordmark left (15px/700 `--accent`), view title center (17px/600), per-screen icon right (no-op in v1)
- Fixed bottom nav (64px + safe-area): 5 tabs, SVG icons + 10px labels
- Scroll area between header and nav: `overflow-y: auto`, `-webkit-overflow-scrolling: touch`
- `BrowserRouter` sub-routes under `/mobile`; `SideNav` and `Keel` must NOT render on mobile routes

### Global Patterns (implement once in shared mobile components)
1. **Toast:** fixed above bottom nav, white card, border-radius 14px, shadow `0 4px 20px rgba(0,0,0,0.15)`, SVG icon + title/subtitle, slides up 150ms, auto-dismiss 3s
2. **Confirm sheet:** bottom sheet for financial mutations ≥$20k or amount ≠ invoice total; summary + "Confirm" (56px accent) + "Cancel" (44px)
3. **Empty state:** centered SVG, 16px/600 headline, 13px `--muted` body, optional CTA
4. **Skeleton loader:** `--row-hover` animate-pulse blocks, 400ms minimum

---

## Screen 1 — Dashboard (`/mobile/dashboard`)

**Data:** `trpc.queries.dashboard.useQuery` — existing `DashboardData` shape.

### Layout
1. **Hero card** (accent gradient `#216e4e → #1a5840`, white text, mx-4, border-radius 20px, padding 20px): "Good morning" + date + "{n} items need attention" summary + small alert badge
2. **KPI 2×2 grid** (gap 10px, padding 16px, cards 88px min):
   - Cash on Hand · Receivables · Payables · Margin
   - Each: 11px uppercase label, 24px/700 value, 12px severity-colored sub-line (delta/context), 8px severity dot top-right
   - Tappable: no-op in v1, wire to drilldown in v2
3. **Work Queue** (section header + list rows 56px min): each row shows lane label + one-line preview of top item + count badge. Tap = navigate to desktop route (open in same browser tab)
4. **Recent Activity** (section header + "See all" link + 3 rows in card): actor avatar circle, action title, detail, relative time
5. **Health strip** (green card): ✓ + "All systems healthy" or amber warning

**tRPC:** `queries.dashboard`, `queries.workQueue` (reuse existing queries).

---

## Screen 2 — Inventory (`/mobile/inventory`)

**Data:** `trpc.queries.grid.useQuery({ view: 'inventory' })` — existing GridRow shape.

### Layout
1. **Sticky search bar** (56px, iOS-style `#f1f3ee` bg, SVG magnifier, clear × button): filters on batchCode, name, vendor client-side
2. **Two filter chip rows** (horizontal scroll, single-select per row):
   - Row 1 (status): All · Ready · Low Stock · Needs Review · Consignment
   - Row 2 (category): All · Flower · Concentrate · Edible
3. **Sort + count strip:** "{n} batches" + "Sort ↓" (sheet stub v1)
4. **Batch cards** (white, 16px radius, shadow, mx-4, 72px min collapsed):
   - Top: batch code (mono 11px) · strain name (15px/600) · status badge right
   - Middle: vendor 12px `--muted-2` · qty+price 13px right
   - Bottom: ⚠ amber expiry badge if ≤30 days
5. **Accordion expand** (one open at a time, 200ms): cost/price, location, media count, tags + 3 quick-action buttons (Adjust qty · Mark needs review · Call vendor → toast stubs v1)
6. **Empty state:** 📦 "No batches match. Clear filters."

**tRPC:** `queries.grid` view=inventory. Client-side filter/search (no new backend needed).

---

## Screen 3 — Visual Catalog (`/mobile/catalog`)

**Data:** `trpc.queries.grid.useQuery({ view: 'photography' })` — existing MediaView data shape.

### Layout
1. **Sticky search + filter chips** (All · Needs Photo · Has Photo · Published · Draft)
2. **Result count + "Upload photos →" link** (switches to batch photo flow)
3. **2-column card grid** (gap 12px, mx-4):
   - Photo area (1:1): CSS gradient placeholder (strain-color palette, see below) + centered white initials + media status badge overlaid bottom-right
   - Info area: strain name 13px/600 · batch code 11px mono · qty + price 11px
4. **Tap → bottom sheet** (slides up 200ms, 40% backdrop, ~70% screen):
   - Drag handle, large swatch, strain name, full metadata
   - **"Add Photo"** CTA (56px accent) → links to existing `/photography/mobile/:batchId` flow
   - **"View in Inventory"** → navigates to `/mobile/inventory`, scrolls to + expands that batch
5. **FAB** (floating camera button, bottom-right above nav): routes to photo upload flow

**Strain gradient palette:**

| Strain | From | To |
|---|---|---|
| Blue Dream | #87ceeb | #c8b8db |
| OG Kush | #b88a4a | #6b4a2b |
| Gelato | #7c5cbf | #2d1b5f |
| Wedding Cake | #f5ecd4 | #d9c89c |
| Gorilla Glue | #2d6e4e | #0e2a20 |
| Purple Punch | #7b4fa6 | #3a2454 |
| Runtz | #d68fcf | #6d3b86 |
| Zkittlez | #2a8fbd | #f0a560 |

For unlisted strains: derive from first char of strain name (hash to one of 8 palette entries).

**tRPC:** `queries.grid` view=photography (existing).

---

## Screen 4 — Payments (`/mobile/payments`)

**Data:** `trpc.queries.grid.useQuery({ view: 'payments' })` for receivables; `trpc.queries.grid.useQuery({ view: 'vendors' })` for payables.

**Commands:** `logPayment` (customer receipt), `recordVendorPayment` (vendor bill). Route through `useCommandRunner`.

### Layout
1. **Summary strip** (sticky, 48px, border-bottom): "Open: ${receivables} receivable · ${payables} payable"
2. **Segmented control** (pill design, animated sliding thumb, 150ms): Receive Payment | Pay Vendor
3. **Invoice/bill list** (cards, mx-4, 72px min, sorted by urgency — most overdue first):
   - Customer/vendor name (15px/600) + amount (20px/700) right
   - Invoice/bill ref (12px mono) + status badge
   - Severity indicator: "+{n} days overdue" in `--danger`, "due in {n}" in `--amber`, "due today" in `--amber`
4. **Accordion expand** (one at a time):
   - Live summary line (italic 13px `--muted`, updates as inputs change): "Recording ${amount} from {entity} via {method}"
   - Amount input: `type="number"` `inputmode="decimal"`, pre-filled, 56px, 20px/700, border-radius 12px
   - Method segmented (5 options, 44px): Cash · Check · Wire · ACH · Other
   - Reference text input: "Reference / memo"
   - **"Record Receipt" / "Record Payment"** (56px, `--accent`, full-width)
   - For amounts ≥$20k OR amount ≠ invoice total: confirm sheet before running command
   - On success: row slides out (200ms), success toast
   - On error: border turns `--danger`, shake animation, inline error text
   - Cancel: collapses form, no changes
5. **Empty state** (all recorded): 🎉 "All caught up."

**Financial safety:** confirm sheet is mandatory for all vendor payments and for customer receipts ≥$20k or partial amounts.

---

## Screen 5 — Contacts (`/mobile/contacts` + `/mobile/contacts/:id`)

**Data:** CAP-033 / TER-1564 Contact type. Backend queries already landed.

### View A — Directory (`/mobile/contacts`)
1. **Sticky search** (live filter on name, companyName, phone)
2. **Filter chips:** All · Customers · Vendors · Referees · Contractors
3. **Alphabetical sections** with sticky-within-scroll letter headers (var(--panel) bg)
4. **Contact rows** (white cards, 16px radius, 68px min, mx-4, gap 8px):
   - 40px avatar circle (`--accent` bg, white initials)
   - Name 14px/600 + role badges (max 2, precedence: Vendor > Customer > Referee > Contractor > Employee)
   - Phone/email 12px `--muted-2`
   - Balance hint: "Owes ${n}" in `--danger` or "We owe ${n}" in `--amber` (derived from ledger)
   - Chevron SVG right
5. **Role badge colors:** Customer #dcefe5/#1f5a3f · Vendor #e6eaef/#314158 · Referee #fdebd0/amber · Contractor #f1e6fa/#5b3a9e · Employee #fde3e1/danger

### View B — Profile (`/mobile/contacts/:id`)
Push-right transition (translateX(100%)→0, 200ms). Back button in header.

1. **Hero block** (accent gradient bg, white text, border-radius bottom 24px, padding 20px):
   - 56px avatar circle (white bg, accent text initials)
   - Name 20px/700, role badges (white-translucent bg), active status + tenure
2. **Contact action strip** (3 equal cards, mx-4, -mt-6 relative, 56px min):
   - 📞 Call → `href="tel:{phone}"`
   - 💬 Text → `href="sms:{phone}"`
   - ✉ Email → `href="mailto:{email}"`
3. **Info card** (mx-4): preferred method, phone, alt phone, email, address, payment terms, notes (2-line clamp + "Show more")
4. **Tags row** (mx-4, chips)
5. **Stats card** (mx-4, 3 equal columns): Total Orders · Balance · Last Activity
6. **Recent Ledger** (mx-4, 4 entries): date + kind left, amount + running balance right. Credits `#10b981`, debits `--danger`.
7. **Upcoming Appointments** (mx-4): from `Appointment` type, or empty state

**tRPC:** New queries needed — `queries.contactDirectory` (paginated list), `queries.contactProfile(id)` (single contact with ledger + appointments). These land as part of CAP-033 Phase 4+ or can be added alongside this work.

---

## Implementation Notes

### New files needed
```
src/client/views/mobile/
  MobileDashboardView.tsx
  MobileInventoryView.tsx
  MobileCatalogView.tsx
  MobilePaymentsView.tsx
  MobileContactsView.tsx
  MobileContactProfileView.tsx

src/client/components/mobile/
  MobileShell.tsx          # bottom nav + top header + scroll area
  MobileToast.tsx          # toast/snackbar
  MobileConfirmSheet.tsx   # bottom sheet for financial confirms
  MobileFilterChips.tsx    # reusable chip row
  MobileSearchInput.tsx    # iOS-style search input
  MobileEmptyState.tsx     # reusable empty state

src/client/styles-mobile.css  # mobile CSS custom properties + base classes
```

### Routing addition to App.tsx
```tsx
// Mobile shell — no SideNav, no Keel
<Route path="/mobile/*" element={<MobileShell />}>
  <Route path="dashboard" element={<MobileDashboardView />} />
  <Route path="inventory" element={<MobileInventoryView />} />
  <Route path="catalog" element={<MobileCatalogView />} />
  <Route path="payments" element={<MobilePaymentsView />} />
  <Route path="contacts" element={<MobileContactsView />} />
  <Route path="contacts/:id" element={<MobileContactProfileView />} />
  <Route index element={<Navigate to="dashboard" replace />} />
</Route>
```

### State management
- Server state: existing tRPC queries (reuse wherever view keys match)
- Client filter/search state: local `useState` per view (not persisted to `useUiStore` — mobile views are ephemeral sessions)
- Toast/sheet state: dedicated `useMobileUiStore` slice or simple React context

### Access control
Mobile routes must respect existing `accessPolicy.ts`. Wrap `MobileShell` with the same auth guard used by `AppContent`.

### Design decisions to log
When landing this work, append to `docs/design-system/decisions-log.md`:
- Mobile-only CSS custom properties in `styles-mobile.css` (not in `styles.css` to avoid desktop bloat)
- No AG Grid on any mobile view
- `useCommandRunner` is used for all mutations (same as desktop)
- `tel:` / `sms:` / `mailto:` links for contact actions (native handoff)

---

## Out of Scope (v1)

- Offline support / PWA manifest
- Push notifications
- Dark mode
- Pull-to-refresh (visual stub only, no real refetch)
- Contact edit from mobile profile
- Full ledger pagination (show last 4 entries only)
- Batch quick-action commands from mobile inventory (show toast stub)
- Global mobile search across all entity types
