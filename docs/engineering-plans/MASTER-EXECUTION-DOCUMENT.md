# TERP Operator — Mercury UX Retrofit: Master Execution Document

**Version:** 1.0 — Everything needed to build. Self-contained.
**Date:** 2026-06-15
**Scope:** 91 tasks, 20 weeks sequential / 17 days parallel AI dispatch
**Source:** Synthesized from 19 planning documents + 6 deep-reconnaissance audits + 3-model adversarial review

---

## 0. Quick Start — How to Use This Document

### If You're an AI Agent Picking Up a Task:
1. Find your task ID in the **Task Registry** (§1)
2. Read the component spec referenced in the task's **Inputs** field (§3-5)
3. Your task packet tells you: exact files, exact API, every state, keyboard behavior, AC checklist
4. Build. Run `pnpm typecheck && pnpm vitest run <test-file>`. Report pass/fail.
5. Do NOT read the whole document. Just your task + its referenced spec.

### If You're a Human Team Lead:
1. Read §0 (this), §1 (task summary), §2 (design philosophy)
2. Reference §3-5 for component specs, §6 for view specs
3. §7 is the placement rubric — every view must pass this
4. §8 is the execution strategy — how to dispatch agents for speed
5. §9 is the design constraint checklist — what must be preserved
6. §10 is the risk map + rollback plan

---


## 17. Phase -1 — Wireframe First (Before Any Code)

**Principle:** No agent builds anything until the wireframe for that component/view is created, reviewed by human, reviewed by AI, and approved. Wireframes are the visual contract. Code implements the wireframe exactly.

### 17.1 What Gets Wireframed

| Artifact | Quantity | Detail Level |
|----------|----------|-------------|
| View layouts | 27 views | Full-page wireframe with all sections labeled |
| Component states | Per component, every state | State-by-state wireframe (empty, focused, open, error, etc.) |
| Interaction flows | ~10 key flows | Step-by-step: click → opens → selects → saves → confirmation |
| Detail slide-over tabs | Per entity type | Tab bar + each tab's content layout |
| Filter toolbar popovers | Per filter type | Date popover, keyword popover, amount popover, group/sort popover |
| Bulk action bar states | 6 states | Hidden, visible, executing, partial, success, error |
| Dashboard layout | 1 layout | Full dashboard with all sections |

### 17.2 Wireframe Format Standard

Every wireframe uses this format:

```markdown
## Wireframe: [View/Component Name] — [State/Flow]

### Layout (ASCII)
[ASCII art diagram showing exact layout, dimensions, and element placement]

### Dimensions
- Component width/height
- Spacing between elements
- Font sizes and weights
- Colors (semantic class names, not hex values)

### Interactive Elements
- [Element name]: [behavior on click/hover/focus]
- [Element name]: [keyboard shortcut if applicable]

### States Shown
- [State 1]: [when it appears]
- [State 2]: [when it appears]

### ARIA Annotations
- [Element]: role="x", aria-label="y"

### Edge Cases Handled
- [Case]: [behavior]
```

### 17.3 Wireframe Creation Process

**Step 1: ASCII Wireframes (PM + fast-build agents)**
- PM writes wireframes for all 27 views + 10 component state sets
- Each wireframe is an ASCII diagram with exact dimensions and labels
- Saved to `docs/engineering-plans/wireframes/`

**Step 2: Visual Wireframes (Excalidraw/tldraw MCP)**
- From ASCII wireframes, generate visual wireframes using Excalidraw or tldraw MCP
- These are rough "hand-drawn" style for quick visual feedback
- Saved as images in `docs/engineering-plans/wireframes/images/`

**Step 3: Human Review (Evan)**
- All wireframes presented for review
- Evan approves, rejects, or requests changes
- Changes applied, re-reviewed
- Approved wireframes marked `[APPROVED]`

**Step 4: AI Review (Claude/GPT)**
- Approved wireframes reviewed by qa-reviewer and cross-reviewer
- AI reviewers check: accessibility, consistency, edge case coverage, Mercury pattern fidelity
- Findings addressed
- Final wireframes marked `[APPROVED-FINAL]`

**Step 5: Wireframes → Specs**
- Approved wireframes linked from component/view spec sheets
- Specs reference wireframe IDs (e.g., "See wireframe WF-COMBOBOX-03 for open state")
- Build agents use wireframes + specs as the complete contract

### 17.4 Wireframe Inventory (What Must Be Wireframed)

#### Views (27 wireframes)

| ID | View | Layout Type |
|----|------|-------------|
| WF-V-PO | PurchaseOrdersView | GridView |
| WF-V-SALES | SalesView | GridView + inline sections |
| WF-V-INTAKE | IntakeView | MasterDetailView |
| WF-V-DASH | DashboardView | DashboardView |
| WF-V-ORDERS | OrdersView | GridView |
| WF-V-PAYMENTS | PaymentsView | GridView |
| WF-V-INVENTORY | InventoryView | GridView |
| WF-V-CLIENTS | ClientsView | GridView |
| WF-V-VENDORS | VendorsView | GridView |
| WF-V-FULFILLMENT | FulfillmentView | GridView |
| WF-V-VPAYABLES | VendorPayablesView | GridView |
| WF-V-CONNECTORS | ConnectorsView | GridView |
| WF-V-PRECEIPTS | PurchaseReceiptsView | GridView |
| WF-V-DISPUTES | InvoiceDisputesView | GridView |
| WF-V-CLOSEOUT | CloseoutView | GridView |
| WF-V-RECOVERY | RecoveryView | GridView |
| WF-V-MATCH | MatchmakingView | GridView + tabs |
| WF-V-PICK | PickView | WizardView |
| WF-V-CREDIT | CreditReviewView | GridView |
| WF-V-MEDIA | MediaView | GridView |
| WF-V-REFEREES | RefereesView | GridView |
| WF-V-PROCESSORS | ProcessorsView | GridView |
| WF-V-ITEMS | ItemsView | GridView |
| WF-V-CONTACTS | ContactsView | GridView |
| WF-V-CPROFILE | ContactProfileView | Tabbed |
| WF-V-SETTINGS | SettingsView | Tabbed |
| WF-V-MERGE | MergeCandidatesView | Custom |

#### Component States (per component, every state)

| ID | Component | States |
|----|-----------|--------|
| WF-C-COMBOBOX | ComboboxCellEditor | 10 states (empty, focused, open, hovered, selected, saving, saved, error, typeahead, disabled) |
| WF-C-SLIDEOVER | DetailSlideover | 4 states (closed, peek, standard, wide) + full-page route |
| WF-C-FILTER | FilterToolbar | 3 states (default, chip open, complex active) + popovers (date, keyword, amount, group, sort, export) |
| WF-C-BULK | BulkActionBar | 6 states (hidden, visible, executing, partial, success, error) + bespoke input |
| WF-C-TABBAR | ViewTabBar | 2 states (normal, overflow) |
| WF-C-SUMMARY | GridSummaryStrip | 3 states (loading, loaded, error) |
| WF-C-GRIDVIEW | GridView template | 1 layout (all sections labeled) |
| WF-C-MASTERDETAIL | MasterDetailView template | 1 layout |
| WF-C-DASHBOARD | DashboardView template | 1 layout |
| WF-C-WIZARD | WizardView template | 1 layout |

#### Interaction Flows (10 key flows)

| ID | Flow | Steps |
|----|------|-------|
| WF-F-PO-CREATE | Create PO | Click "New PO" → authoring slide-over → add lines → save draft → finalize |
| WF-F-PO-RECEIVE | Receive PO | Select PO → BulkActionBar → receive qty → confirm → receipt preview |
| WF-F-SALE-CREATE | Create Sale | Select customer → context header → add lines → price → confirm |
| WF-F-SALE-EDIT | Inline Edit | Double-click status cell → dropdown → typeahead → select → save → green flash |
| WF-F-INTAKE-VERIFY | Verify Intake | Expand PO → review batches → verify all → confirm |
| WF-F-FILTER-ADVANCED | Filter Flow | FilterToolbar filter → click Advanced → pre-populated → complex filter → apply |
| WF-F-DETAIL-NAVIGATE | Detail Navigation | Click row → peek → open → standard → switch tabs → open full view |
| WF-F-BULK-ACTION | Bulk Action | Select rows → BulkActionBar → primary action → execute → success |
| WF-F-ERROR-RECOVER | Error Recovery | Cell edit fails → error state → retry → success |
| WF-F-DASHBOARD | Dashboard Flow | View KPIs → click work queue → navigate to filtered view |

### 17.5 Wireframe Example (ComboboxCellEditor — Open State)

```
## Wireframe: WF-C-COMBOBOX-03 — ComboboxCellEditor Open State

### Layout (ASCII)
┌─────────────────────────┐
│ Select...            ▾  │  ← input (280px wide, 32px tall)
│─────────────────────────│  ← dropdown border (1px, #e4e4e7)
│  Legal Fees              │  ← option (32px tall, 13px font)
│  Travel - Accommodation  │  ← option
│▐ Travel - Vehicles      ▌│  ← hovered option (bg-zinc-100)
│  Venue Rental            │  ← option
│  Employee Gifts          │  ← option
│  Software                │  ← option
│  Investments             │  ← option
│─────────────────────────│
│ + Create "New Category"  │  ← if allowCreate (32px, green text)
└─────────────────────────┘
 ↑ dropdown: max-height 280px, scrollable, 200px min-width
 ↑ cell: 280px wide, position relative

### Dimensions
- Cell: 280px × 32px (matches AG Grid row height)
- Dropdown: min-width 200px, max-height 280px
- Option: 32px tall, padding 8px 12px
- Font: Inter 13px, line-height 1.4
- Border: 1px solid border-accent (#216e4e)
- Shadow: 0 4px 12px rgba(0,0,0,0.1)
- Z-index: 50

### Interactive Elements
- Input: click → opens dropdown. type → filters options. Enter → selects hovered. Escape → closes.
- Option: hover → bg-zinc-100. click → selects. ARIA: role="option", aria-selected.
- Create new: hover → bg-green-50. click → onCommit("[typed text]"). ARIA: role="option".
- Scrollbar: appears when options > 8. Custom scrollbar (6px, rounded).

### States Shown
- Open: dropdown visible below cell. Input shows placeholder or typed text.
- Hovered: option bg changes. ARIA activedescendant updates.

### ARIA Annotations
- Input: role="combobox", aria-haspopup="listbox", aria-autocomplete="list", aria-expanded="true"
- Dropdown: role="listbox", aria-label="Category options"
- Options: role="option", aria-selected="true"/"false"
- Active: aria-activedescendant="option-3" (points to hovered option)

### Edge Cases Handled
- Near viewport bottom: dropdown opens ABOVE cell instead of below
- No options: "No options available" shown
- Single option: auto-selected on open
- Many options (50+): scrollable with typeahead for fast access
- Async loading: spinner while onSearch resolves
```

### 17.6 Wireframe Review Gates

| Gate | Reviewer | Criteria |
|------|----------|----------|
| **Gate W1: Human review** | Evan | Wireframes match Mercury patterns? Layouts make operational sense? Information density appropriate? Flows discoverable? |
| **Gate W2: AI UX review** | qa-reviewer | Accessibility (ARIA roles, focus management, keyboard nav)? Consistency across views? Edge cases covered? Mercury pattern fidelity? |
| **Gate W3: AI cross-model review** | cross-reviewer | Alternative interpretations? Missing patterns? Over-engineering? Terra-brokerage domain fit? |
| **Gate W4: Approval** | Evan + AI consensus | Wireframes approved → specs generated → agents build |

### 17.7 Wireframe → Spec → Build Pipeline

```
Wireframe (visual contract)
    ↓ approved
Spec sheet (API + states + AC)
    ↓ referenced
Task packet (spec + wireframe ID + scaffold)
    ↓ dispatched
Build agent (implements exactly from wireframe + spec)
    ↓ verified
QA agent (compares built result to wireframe)
```

**Rule:** If the built result doesn't match the approved wireframe, the build agent failed. Not a design discussion — a build error. Fix it.

### 17.8 Phase -1 Timeline

| Step | Time |
|------|------|
| Create all ASCII wireframes (PM + agents) | 2 days (parallel: 27 view wireframes + 10 component state sets + 10 interaction flows) |
| Generate visual wireframes (Excalidraw MCP) | 1 day (from ASCII wireframes) |
| Human review round 1 | 1 day (Evan reviews, provides feedback) |
| Apply feedback | 1 day |
| AI review (qa + cross-reviewer) | 1 day (parallel) |
| Apply AI feedback | 1 day |
| Final human approval | 1 day |
| **Total Phase -1** | **~5-7 days** |


## 18. Backend & Database Audit — Gap Analysis

**Audit Date:** 2026-06-15  
**Source:** Cross-reference of MASTER-EXECUTION-DOCUMENT.md against `src/server/schema.ts` (1383 lines, 48 tables, 4 views), `src/server/routers/queries.ts` (~1400 lines, ~60 procedures), `src/shared/commandCatalog.ts` (707 lines, 130+ commands), `src/server/services/commandBus.ts` (8063 lines), tRPC router index.

**Finding:** The plan is ~95% frontend. The 1121-line master document mentions the backend exactly **zero times** in any actionable capacity. Below are 15 critical backend gaps that must be planned before any agent can build the full system.

---

### GAP 1: Entity Schema → Database Column Mapping (Blocker)

**What the plan says (§4.1):**
```typescript
function entitySchema(fields: Record<string, EntityField>): EntitySchema;
// "Auto-generated from schema"
```

**What's missing:** The mapping from `EntityField` to actual database columns does not exist. The plan defines `EntityField` as a frontend concept (`header`, `width`, `type`, `editor`, `enum`) — but these must map to actual PostgreSQL columns in `schema.ts`. 

**Questions not answered:**
- Does `entitySchema('purchaseOrder')` read the Drizzle `purchaseOrders` table definition? At build time? At runtime?
- How does `header: "PO #"` know it maps to `purchaseOrders.poNo`? Manual mapping? Convention?
- What happens when a column is added to `schema.ts` but not to the entity schema? What about columns that exist in the DB but should NOT appear in the grid?
- The plan says "Auto-generated from schema" but schema has 48 tables — which columns per table are grid columns? Which are FK-only? Which are internal?

**Required:** A concrete mapping specification. Either:
- **Option A:** A colocated config mapping frontend field names → DB column names  
- **Option B:** Convention-based (camelCase header → snake_case column) with override map
- **Option C:** Drizzle introspection at build time (Zod schema from Drizzle columns)

---

### GAP 2: Entity State Machines → DB Status Enum Sync (Blocker)

**What the plan says (§4.2):**
> "Must use REAL status values from `schema.ts` + `commandBus.ts` — never from spec §10."

**What's missing:** Schema status columns are `varchar(32)` — not enums. There is no single source of truth for valid status values per entity. They are defined ad hoc in:
- `schema.ts` column defaults (e.g., `default('draft')`)
- `commandBus.ts` command handlers (checking `row.status === 'draft'`)
- Frontend StatusActionTable components
- Frontend ViewTabBar filters

**The plan's state machine (§4.2) adds a 5th location.** If `purchaseOrders.status` allowed values change (e.g., `'ordered'` → `'sent'`), five places need updating. The plan provides no mechanism to keep them in sync.

**Required:**
1. Define a status enumeration file: `src/shared/statuses.ts` — one canonical list per entity
2. Generate Drizzle check constraints from it (or use PostgreSQL enums)
3. Generate TypeScript union types from it
4. State machine config references the canonical list, enforced at compile time
5. Add a test that verifies all `commandBus` status checks reference canonical values

---

### GAP 3: ComboboxCellEditor — No Option Fetch Endpoint (Blocker)

**What the plan says (§3.1):**
```typescript
onSearch?: (query: string) => Promise<ComboboxOption[]>;
```

**What's missing:** There is no tRPC endpoint that serves combobox option lists. The plan assumes options just "appear" but never specifies:

- **Where do options come from?** The current code uses `trpc.queries.reference.useQuery()` which returns a single large blob of customers, vendors, items, tags, transaction types. A combobox needs filtered, typeahead-capable option lists.
- **New endpoint needed:** `trpc.queries.comboboxOptions` taking `{ entityType: string, query?: string, limit?: number }` → `ComboboxOption[]`
- **Per-entity option sources:**
  | Entity | Source | Columns → Option |
  |--------|--------|------------------|
  | PurchaseOrder.status | Static list (from canonical statuses) | label=status, value=status |
  | PurchaseOrder.vendorId | `vendors` table | label=name, value=id |
  | SalesOrder.customerId | `customers` table | label=name, value=id |
  | Batch.category | `batches` table DISTINCT | label=category, value=category |
  | Batch.itemId | `items` table | label=name, value=id |
  | Payment.method | Static list | label=method, value=method |
  | Tag application | `tagCatalog` table | label=label, value=slug |
  | TransactionType | `transactionTypes` table | label=label, value=slug |
  | Status columns (all) | `src/shared/statuses.ts` | label=status, value=status |

---

### GAP 4: ComboboxCellEditor — No "Create New" Mutation Endpoint (Blocker)

**What the plan says (§3.1):**
> "When `allowCreate: true` and typed text has no match: Click or Enter → `onCommit('[typed text]')` called → Backend creates the new entity"

**What's missing:** `onCommit` is a generic callback. The plan provides no backend endpoint for creating entities from typed text. 

**Current `commands.run` can't handle this generically** — `commands.run` expects a specific `commandName` (e.g., `createItem`, `createVendor`, `applyTags`). The ComboboxCellEditor doesn't know which command to dispatch because it's a generic component parameterized by entity type.

**Required design decision:**
- **Option A:** ComboboxCellEditor receives a `createCommand?: { name: CommandName, payloadBuilder: (text: string) => any }` — makes it command-aware
- **Option B:** Generic `trpc.commands.quickCreate` endpoint that accepts `{ entityType, value, context }` and dispatches internally
- **Option C:** Disallow "create new" for generic combobox. Only allow it in entity-specific contexts (e.g., tag application, item creation). Each view wires its own creation logic.

**Recommendation: Option C** — generic create is too risky. Limit `allowCreate` to specific entity types where creation makes sense (tags, items, categories). Each view that needs it wires a specific `useCommandRunner` mutation.

---

### GAP 5: DetailSlideover Tabs — No Per-Tab Query Contract

**What the plan says (§3.2):**
```typescript
interface DetailTab {
  key: string; label: string; icon?: string;
  component: React.ComponentType<{entityId: string; entityType: string}>;
}
```

**What's missing:** Tab components need data. The plan doesn't specify what tRPC queries each tab calls. Example — PurchaseOrder detail tabs:

| Tab | Data Needed | Current Query | New Query Needed? |
|-----|-------------|---------------|--------------------|
| Lines | `purchaseOrderLines` | `trpc.queries.purchaseOrderLines({ purchaseOrderId })` | No — exists |
| Linked Intake | `batches` where `purchaseOrderId = X` | Embedded in `intakeQueue` query | **Yes — needs dedicated query or filter** |
| Vendor | Vendor detail + open bills + prior POs | `trpc.queries.relationshipSummary({ vendorId })` | No — exists |
| History | `commandJournal` filtered by PO ID | `trpc.queries.relatedCommands({ entityId })` | No — exists |

For entities WITHOUT existing detail queries (Referees, Processors, Contacts, Media, Matchmaking), new queries must be written. The plan provides zero specification for these.

**Required for each entity type:** A tab query matrix listing every tab, its data source, and whether the query exists or needs to be created.

---

### GAP 6: FilterToolbar — No Backend Query Integration

**What the plan says (§3.3):**
> FilterToolbar renders chips + has Advanced button. `simpleToAdvanced()` / `advancedToSimple()` bridge functions.

**What's missing:** These bridge functions translate between UI filter states. But what happens when the user clicks "Apply"? The plan never connects the filter state to the database query.

**Current architecture:** `trpc.queries.grid({ view: 'purchaseOrders' })` calls `gridSql('purchaseOrders')` which builds a WHERE clause from... what? The grid SQL currently uses hardcoded WHERE conditions or view-specific logic. FilterToolbar's filter state must serialize into something the backend can turn into SQL.

**Required:**
1. **Filter serialization format:** JSON payload sent to backend. E.g.:
```typescript
interface GridFilter {
  field: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: any;
}
interface GridQueryInput {
  view: ViewKey;
  filters?: GridFilter[];  // AND logic
  complexFilter?: FilterGroupInput;  // From AdvancedFilterBuilder (AND/OR)
  sort?: { field: string; dir: 'asc' | 'desc' }[];
  groupBy?: string[];
  page?: number; pageSize?: number;
}
```
2. **Backend filter → SQL WHERE builder:** Accept `GridQueryInput` and build parameterized WHERE clauses. Must prevent SQL injection.
3. **Updated grid procedure:** `trpc.queries.grid` already exists but needs to accept filter/sort/group params — currently it only accepts `view`.

---

### GAP 7: useViewData Hook — No Centralized Query Endpoint

**What the plan says (§5.3):**
```typescript
function useViewData(viewKey: ViewKey, filters: FilterState): ViewData;
// Returns: { main, aggregates, reference, ... }
// "Centralized query registry. Replaces 2-10 separate trpc.*.useQuery() calls per view."
```

**What's missing:** `useViewData` is described as a frontend hook, but its data must come from the backend. The plan never specifies the backend API that serves this:

- Is there ONE new tRPC endpoint `trpc.queries.viewData({ viewKey, filters })` that returns everything?
- Does it compose existing queries server-side?
- Does the frontend still make multiple tRPC calls but wrapped in one hook?

**Current architecture:** Each view makes 2-10 independent `trpc.*.useQuery()` calls. Some are shared (reference), some are view-specific (grid, workQueue, intakeQueue).

**Recommended approach:** Keep multiple tRPC calls but wrap them in `useViewData` for ergonomics. Do NOT build a monolithic viewData endpoint — that reintroduces coupling the plan is trying to remove.

**Required:** A query composition table for each view:
| View | Queries | New? |
|------|---------|------|
| PurchaseOrdersView | `grid('purchaseOrders')` + `reference` (vendors) + `summaryQuery` (counts/totals) | `summaryQuery` needs new endpoint |
| SalesView | `grid('salesOrders')` + `reference` (customers/items) + `customerWorkspace(customerId)` + `salesOrderLines(orderId)` + `customerPurchaseHistory(customerId)` + `salesSuggestions` | None new — all exist |
| IntakeView | `intakeQueue()` + `reference` (vendors/items) | None new |
| DashboardView | `dashboard()` + `workQueue()` + `creditWatchlist()` | None new |

---

### GAP 8: GridSummaryStrip — No Aggregation Query Spec

**What the plan says (§3.6):**
```typescript
interface GridSummaryStripProps {
  metrics: { label: string; value: string; delta?: { ... } }[];
}
```

**What's missing:** Where do `metrics` come from? The plan doesn't specify a backend endpoint for per-view aggregate queries. 

**Current state:** The `trpc.queries.dashboard` procedure returns some KPIs. The `trpc.queries.grid` procedure returns rows but no aggregates. Individual views may compute aggregates client-side from row data.

**Mercury's pattern:** Mercury shows "Net change this month: $X | Money in: $Y | Money out: $Z" above every table. These are server-computed aggregates.

**Required:**
- **New endpoint:** `trpc.queries.gridSummary({ view: ViewKey, filters?: GridFilter[] })` → `{ metrics: Metric[] }`
- Per-view metric definitions:
  | View | Metrics |
  |------|---------|
  | PurchaseOrdersView | Count by status, total value, pending receipt count |
  | SalesView | Count by status, total value, unconfirmed count |
  | InventoryView | Total batches, total QTY, total value |
  | PaymentsView | Unapplied total, count pending |
  | IntakeView | POs pending, batches pending, total value |

---

### GAP 9: BulkActionBar — No Bulk Command Dispatch (Blocker)

**What the plan says (§3.4):**
```typescript
interface BulkAction {
  onAction: (inputValue?: string) => Promise<void>;
}
```

**What's missing:** The current command bus (`commands.run`) dispatches ONE command per call. For bulk actions (e.g., "Confirm 5 sales orders"), the frontend currently calls `useCommandRunner` once per row. 

The plan's `BulkActionBar` implies a single `onAction` call for multiple rows. But:

- Do we call `commands.run` in a loop (N HTTP requests)?
- Do we need a new `trpc.commands.runBulk` endpoint (1 HTTP request, N commands)?
- How does partial failure work? ("2 confirmed · 1 failed [View failures]")
- What about idempotency for bulk operations?

**Required:**
1. **New endpoint:** `trpc.commands.runBulk({ commands: { name: CommandName, payload: any, entityId: string }[] })` → `{ results: { entityId: string, ok: boolean, error?: string }[] }`
2. **Transaction strategy:** Each command in its own transaction (partial success allowed) or all-or-nothing? Per the plan's "partial" state, each must be independent.
3. **Frontend behavior:** `BulkActionBar.onAction` calls `runBulk` and aggregates results.

---

### GAP 10: ViewTabBar Status Counts — No Backend Query

**What the plan says (§3.5):**
```typescript
interface ViewTabBarProps {
  tabs: { key: string; label: string; count?: number }[];
}
```

**What's missing:** Where do tab `count` values come from? Mercury shows "All (45) | Draft (3) | Confirmed (12)". These are status counts for the current filter context.

**Required:** The `gridSummary` query (see GAP 8) should include per-status counts. Or a separate lightweight query: `trpc.queries.statusCounts({ view: ViewKey, filters?: GridFilter[] })` → `{ status: string, count: number }[]`.

---

### GAP 11: Feature Flags — Backend Enforcement

**What the plan says (§11):**
> `FEATURE_GRID_VIEW_TEMPLATE`, `FEATURE_FILTER_TOOLBAR`, etc. — frontend flags.

**What's missing:** Feature flags are frontend-only. If `FEATURE_INLINE_COMBOBOX` is OFF but a malicious client sends a combobox-style edit, there's no backend protection. 

**Not a blocker for Phase 0-3** (operator console is internal tool, not public). But must be noted as a tech debt item.

**Required (Phase 4):** Backend validates feature flags for mutation endpoints. Reject commands that require features not enabled for the current view.

---

### GAP 12: Backend Test Plan — Completely Absent

**What the plan says:** Task registry includes frontend test fixes (T-0-T1..T6) but ZERO backend test tasks.

**What exists:** `src/server/services/commandBus.*.test.ts` — extensive test suites. `src/shared/commandCatalog.*.test.ts` — command catalog tests. Various router-level tests.

**What's needed but unplanned:**
1. New `trpc.queries.gridSummary` → needs tests
2. New `trpc.queries.comboboxOptions` → needs tests
3. New `trpc.queries.statusCounts` → needs tests
4. New `trpc.commands.runBulk` → needs tests (idempotency, partial failure, rollback)
5. Updated `trpc.queries.grid` (filter params) → needs updated tests
6. Entity state machine tests (verify all status transitions match commandBus validation)
7. Status synchronization test (verify canonical status list matches schema defaults)

**Required:** Add ~15 backend test tasks to Phase 0 and Phase 1.

---

### GAP 13: Cache Invalidation — Not Addressed

**What the plan does:** Replaces multiple `trpc.*.useQuery()` calls with `useViewData(viewKey, filters)`.

**What's missing:** tRPC cache invalidation currently works because each view manually invalidates specific query keys after command completion (via Socket.IO events). When views use `useViewData`, the invalidation logic must change.

**Required:**
1. Define query key structure for `useViewData` (based on `viewKey` + serialized `filters`)
2. After ANY command that affects an entity type, invalidate all viewData queries for views containing that entity
3. Socket.IO command-completion events must broadcast affected entity types, not just affected IDs
4. Test that stale data doesn't persist after a mutation

---

### GAP 14: Migration Plan — Completely Absent

**What the plan says:** Nothing about database migrations.

**What might need migrations:**
- New PostgreSQL functions for filter→SQL translation? (Unlikely — TypeScript is fine)
- New database views for aggregation queries? (Materialized views for performance)
- New columns for feature flags? (No — frontend flags)
- New indices for filter queries? (If filters introduce new query patterns)
- Status column check constraints? (If canonical status enum is enforced at DB level)

**Assessment:** Likely ZERO migrations needed. Schema is stable. But this should be explicitly verified as a Phase 0 task, not assumed.

**Required:** Add task: "Verify no schema migrations needed for Mercury retrofit" (Phase 0, terminal agent).

---

### GAP 15: Performance — Command Bus Overhead for Inline Editing

**What the plan says:** ComboboxCellEditor calls `onCommit` on every cell edit.

**Current architecture:** Every `onCommit` → `useCommandRunner` → `trpc.commands.run` → full command bus pipeline (validate, idempotency lock, DB transaction, document snapshots, journal write, socket broadcast). This is ~50-100ms per edit. If an operator edits 20 cells quickly, that's 20 sequential transactions.

**Mercury's pattern:** Mercury's combobox is fast because it's likely a simple UPDATE behind the scenes, not a full command bus pipeline.

**Risk:** Perceived slowness. Operators expect instant cell edits.

**Mitigation options:**
- **Optimistic update:** Update UI immediately, dispatch command in background, rollback on failure
- **Batch edits:** Accumulate cell edits and flush when focus leaves the row
- **Lightweight update path:** Some edits (status change, category tag) could use a lighter mutation that skips document snapshots and full journaling
- **Do nothing for Phase 1:** Measure actual latency before optimizing

**Recommendation:** Add optimistic update support to ComboboxCellEditor. Show State 4 (value selected) immediately, async-save in background, transition to State 6 (saved) or State 7 (error) when command completes.

---

### Summary: New Backend Work Required

| ID | Backend Task | Phase | Priority |
|----|-------------|-------|----------|
| T-B-01 | Create `src/shared/statuses.ts` — canonical status enumerations per entity | 0 | **Blocker** |
| T-B-02 | Create `trpc.queries.comboboxOptions` endpoint | 0 | **Blocker** |
| T-B-03 | Create `trpc.queries.gridSummary` endpoint | 0 | High |
| T-B-04 | Create `trpc.queries.statusCounts` endpoint | 0 | High |
| T-B-05 | Update `trpc.queries.grid` to accept filter/sort/group params | 0 | **Blocker** |
| T-B-06 | Create `trpc.commands.runBulk` endpoint | 1 | **Blocker** |
| T-B-07 | Create entity→DB column mapping config | 0 | **Blocker** |
| T-B-08 | Add per-entity tab query matrix to specs | 0 | High |
| T-B-09 | Add new detail queries for entities lacking them | 0 | Medium |
| T-B-10 | Write canonical status sync test | 0 | High |
| T-B-11 | Write entity state machine validation test | 1 | High |
| T-B-12 | Write comboboxOptions tests | 0 | High |
| T-B-13 | Write gridSummary tests | 0 | High |
| T-B-14 | Write runBulk tests (idempotency, partial failure) | 1 | High |
| T-B-15 | Write updated grid procedure tests | 0 | High |
| T-B-16 | Verify no schema migrations needed | 0 | Medium |
| T-B-17 | Add cache invalidation strategy for useViewData | 1 | Medium |
| T-B-18 | Optimistic update in ComboboxCellEditor | build | §18 GAP 15 | `src/client/components/editors/ComboboxCellEditor.tsx` |
| T-B-18 | Add optimistic update support to ComboboxCellEditor | 1 | Medium |

---

### Backend Files That Will Be Created or Modified

```
src/
├── shared/
│   └── statuses.ts                    ← NEW: Canonical status enums per entity
├── server/
│   ├── schema.ts                      ← MODIFIED: Optional check constraints
│   ├── routers/
│   │   ├── queries.ts                 ← MODIFIED: grid() accepts filter params;
│   │   │                                  NEW procedures: comboboxOptions, gridSummary, statusCounts
│   │   └── commands.ts               ← MODIFIED: NEW runBulk procedure
│   └── services/
│       └── commandBus.ts              ← MODIFIED: Bulk execution with partial failure
├── client/
│   └── config/
│       └── entity-column-map.ts       ← NEW: Frontend field → DB column mapping
```

**Total new backend code: ~800-1200 lines. Total modified: ~200-400 lines.**

---

### Risk Reassessment

Add to §13 Risk Map:

| Risk | Severity | Trigger | Mitigation |
|------|----------|---------|------------|
| Command bus latency for inline edits | Medium | Operators report slow cell editing | Optimistic update (already planned). Measure before optimizing. |
| Bulk command partial failure confusion | Medium | Operator runs bulk action, some fail | runBulk returns per-entity results. BulkActionBar shows "2 confirmed · 1 failed". |
| Filter SQL injection | High | Malformed filter JSON | Parameterized queries only. Zod validation on input. |
| Stale cache after mutation | Medium | Grid doesn't refresh after edit | Socket.IO broadcasts entity type. useViewData invalidates by entity type. |
| Status drift across 5 locations | High | Status value added to schema but not state machine | Canonical `statuses.ts`. Compile-time type check. Test gate. |
## 1. Task Registry Summary

### Phase 0 — Foundation (27 tasks, 3 days parallel)
**Gate:** All components built + tested. Zero views touched.

| ID | Task | Agent | Input | Output |
|----|------|-------|-------|--------|
| T-0-01 | ComboboxCellEditor basic dropdown | build | §3.1 | `editors/ComboboxCellEditor.tsx` |
| T-0-02 | Combobox typeahead + async save | build | §3.1 | Same file |
| T-0-03 | Combobox a11y + edge cases | build | §3.1 | Same file |
| T-0-04 | Combobox integration test | terminal | §3.1 | Test file |
| T-0-05 | DetailSlideover shell | build | §3.2 | `DetailSlideover.tsx` |
| T-0-06 | Tab registry | build | §3.2 | `tabs/registry.ts` |
| T-0-07 | FilterToolbar | build | §3.3 | `FilterToolbar.tsx` |
| T-0-08 | Filter bridge | build | §3.3 | `utils/filterBridge.ts` |
| T-0-09 | BulkActionBar | build | §3.4 | `BulkActionBar.tsx` |
| T-0-10 | ViewTabBar | fast-build | §3.5 | `ViewTabBar.tsx` |
| T-0-11 | GridSummaryStrip | fast-build | §3.6 | `GridSummaryStrip.tsx` |
| T-0-12 | GridJourney entity schemas | fast-build | §4.1 | `config/entity-schemas.ts` |
| T-0-13 | GridJourney state machines | fast-build | §4.2 | `config/entity-actions.ts` |
| T-0-14 | useEntityActions hook | fast-build | §5.1 | `hooks/useEntityActions.ts` |
| T-0-15 | useColumnDefs hook | fast-build | §5.2 | `hooks/useColumnDefs.ts` |
| T-0-16 | View registry | fast-build | §4.3 | `config/view-registry.ts` |
| T-0-C1 | Fix PickView stubs | fast-build | §1.1 | PickView components |
| T-0-C2 | Fix SalesCommandHistoryTab | fast-build | §1.1 | Tab component |
| T-0-C3 | Fix RefereeCreditsList | fast-build | §1.1 | Credits list |
| T-0-C4 | Remove dead procedures | fast-build | §1.1 | 4 server routers |
| T-0-C5 | Fix merge-candidates counter | fast-build | §1.1 | Dashboard component |
| T-0-T1 | Replace CSS assertions | fast-build | §1.2 | 4 test files |
| T-0-T2 | Replace DOM coupling | fast-build | §1.2 | 5 test files |
| T-0-T3 | Replace magic numbers | fast-build | §1.2 | 6 test files |
| T-0-T4 | Fix Drizzle ORM mocks | build | §1.2 | 1 test file |
| T-0-T5 | Fix E2E seed-data skips | build | §1.2 | 5 E2E files |
| T-0-T6 | Fix skipped unit tests | fast-build | §1.2 | 1 test file |

 
#### Phase 0 Backend Tasks (11 tasks)

| ID | Task | Agent | Input | Output |
|----|------|-------|-------|--------|
| T-B-01 | Canonical status enumerations | build | §18 GAP 2 | `src/shared/statuses.ts` |
| T-B-02 | Combobox options endpoint | build | §18 GAP 3 | `src/server/routers/queries.ts` |
| T-B-03 | Grid summary endpoint | build | §18 GAP 8 | `src/server/routers/queries.ts` |
| T-B-04 | Status counts endpoint | fast-build | §18 GAP 10 | `src/server/routers/queries.ts` |
| T-B-05 | Update grid query for filter/sort/group | build | §18 GAP 6 | `src/server/routers/queries.ts` |
| T-B-07 | Entity→DB column mapping config | build | §18 GAP 1 | `src/client/config/entity-column-map.ts` |
| T-B-10 | Canonical status sync test | terminal | §18 GAP 2 | Test file |
| T-B-12 | Combobox options test | terminal | §18 GAP 3 | Test file |
| T-B-13 | Grid summary test | terminal | §18 GAP 8 | Test file |
| T-B-15 | Updated grid query tests | terminal | §18 GAP 6 | Test file |
| T-B-16 | Verify no schema migrations needed | terminal | §18 GAP 14 | Audit report |

### Phase 1 — Pilot (9 tasks, 2 days)
**View:** PurchaseOrdersView. **Gate:** First fully retrofitted view.

| ID | Task | Input |
|----|------|-------|
| T-1-01 | Adopt GridView template | §6.1 |
| T-1-02 | FilterToolbar wiring | §6.1 |
| T-1-03 | SummaryStrip + ViewTabBar | §6.1 |
| T-1-04 | BulkActionBar wiring | §6.1 |
| T-1-05 | DetailSlideover + tabs | §6.1 |
| T-1-06 | ComboboxCellEditor wiring | §6.1 |
| T-1-07 | PO authoring in slide-over | §6.1 |
| T-1-08 | Register PO entity tabs | §6.1 |
| T-1-09 | Validate PurchaseOrdersView | — |

 
#### Phase 1 Backend Tasks (6 tasks)

| ID | Task | Agent | Input | Output |
|----|------|-------|-------|--------|
| T-B-06 | Bulk command dispatch endpoint | build | §18 GAP 9 | `src/server/routers/commands.ts` |
| T-B-08 | Per-entity tab query matrix | build | §18 GAP 5 | Spec doc + missing queries |
| T-B-09 | New detail queries for entities lacking them | build | T-B-08 output | `src/server/routers/queries.ts` |
| T-B-11 | Entity state machine validation test | terminal | §18 GAP 2 | Test file |
| T-B-14 | Bulk dispatch tests | terminal | §18 GAP 9 | Test file |
| T-B-17 | Cache invalidation strategy for useViewData | build | §18 GAP 13 | `src/client/hooks/useViewData.ts` |
| T-B-18 | Optimistic update in ComboboxCellEditor | build | §18 GAP 15 | `src/client/components/editors/ComboboxCellEditor.tsx` |

### Phase 2 — GridJourney Views (8 tasks, 2 days)
**Views:** Orders, Payments, Inventory, Clients, Vendors, Fulfillment, VendorPayables, Connectors, PurchaseReceipts, InvoiceDisputes, Closeout

| ID | Task |
|----|------|
| T-2-01 | Complete entity schemas |
| T-2-02 | Complete state machines |
| T-2-03 | useViewData hook |
| T-2-04 | OrdersView |
| T-2-05 | First wave (5 views) |
| T-2-06 | Second wave (5 views) |
| T-2-07 | Register all entity tabs |
| T-2-08 | Validate GridJourney views |

### Phase 3A — SalesView Refactoring (12 tasks, 3 days)
**HARD GATE:** All 5 SalesView test suites pass before any new component touches it.

| ID | Task |
|----|------|
| T-3A-01 | Extract DisplayNameCell |
| T-3A-02 | Extract BatchCodeCell |
| T-3A-03 | Extract MarkupCell |
| T-3A-04 | Extract DerivedCogsCell |
| T-3A-05 | Extract PickStatusCell |
| T-3A-06 | Extract WhyShownCell |
| T-3A-07 | Extract LandedCostExceptionCell |
| T-3A-08 | Stabilize fulfillmentActionsColumn |
| T-3A-09 | useSalesLineRows hook |
| T-3A-10 | useSalePrePostChecks hook |
| T-3A-11 | buildConfirmPayload |
| T-3A-12 | Validate refactoring |

### Phase 3B — SalesView Migration (10 tasks, 2 days)

| ID | Task |
|----|------|
| T-3B-01 | GridView template base |
| T-3B-02 | SalesOrder schema + state machine |
| T-3B-03 | FilterToolbar |
| T-3B-04 | SummaryStrip |
| T-3B-05 | BulkActionBar |
| T-3B-06 | DetailSlideover |
| T-3B-07 | ComboboxCellEditor wiring |
| T-3B-08 | Customer workspace header |
| T-3B-09 | Register SalesOrder + Customer tabs |
| T-3B-10 | Validate SalesView |

### Phase 3C — Intake + Dashboard (6 tasks, 1 day)

| ID | Task |
|----|------|
| T-3C-01 | IntakeView: MasterDetailView template |
| T-3C-02 | DashboardView: DashboardView template |
| T-3C-03 | DashboardView: KPI strip + quick actions |

### Phase 3D — Remaining Complex (10 tasks, 2 days)

| ID | Views |
|----|-------|
| T-3D-01 | MatchmakingView (tabbed GridView) |
| T-3D-02 | PickView (WizardView template) |
| T-3D-03 | RecoveryView |
| T-3D-04 | CloseoutView |
| T-3D-05 | CreditReviewView |
| T-3D-06 | MediaView |
| T-3D-07 | RefereesView |
| T-3D-08 | ProcessorsView |
| T-3D-09 | ItemsView |
| T-3D-10 | ContactsView |

### Phase 4 — Polish (9 tasks, 2 days)

| ID | Task |
|----|------|
| T-4-01 | Mobile adaptations (7 views) |
| T-4-02 | Accessibility audit |
| T-4-03 | Performance check |
| T-4-04 | Documentation update |
| T-4-05 | Persona flow QA |
| T-4-06 | Cleanup dead code |
| T-4-07 | Final test suite |
| T-4-08 | Decision log update |
| T-4-09 | Remove feature flags (flatten) |

---

### 1.1 Stub Cleanup Details

| Stub | File | Fix |
|------|------|-----|
| CAP-030 PickView hardcoded data | QueueScreen, PickLineScreen, PickListScreen | Extract to `pickMockData.ts` with "TODO: wire to trpc.queries.pickQueue when CAP-030 merges (TER-1498)" |
| "Command history coming soon" | SalesCommandHistoryTab.tsx:87 | Replace with "No commands recorded for this order yet" — no "coming soon" |
| Disabled payout button | RefereeCreditsList.tsx:94,99 | Hide button until CAP-039 lands |
| `applyBatchFilters` dead | filters.ts:22 | Remove or wire to consumer |
| `runCleanup` dead | media.ts:13 | Remove or wire |
| `heartbeat` dead | subscriptions.ts:21 | Remove or wire |
| `customerLastOrderedQty` singular dead | queries.ts:2749 | Remove (bulk version used) |
| Merge-candidates shows 0 | Dashboard component | Hide until BE-014 |

### 1.2 Test Resilience Details

| Issue | Files | Fix Pattern |
|-------|-------|-------------|
| CSS class assertions (`.toHaveClass('primary-button')`) | 4 files | Replace with `getByRole('button', { name: 'Confirm' })` |
| DOM coupling (`container.firstChild`) | 5 files | Replace with `screen.queryByRole`, `screen.queryByText` |
| Magic numbers (`1850`, `999001`, `11`, `34`) | 6 files | Derive from inputs or use relative assertions |
| Drizzle ORM chain mocking | 1 file | Mock at service layer, not ORM layer |
| E2E `test.skip(true, ...)` | 5 files | Create test data via tRPC mutations in `beforeEach` |
| Skipped unit test | 1 file | Implement or delete with comment |

---

## 2. Design Philosophy

### 2.1 Principles
1. **Composition over framework.** Templates are opt-in components. Views bypass templates for bespoke sections.
2. **Progressive disclosure.** Main view is one clean surface. Context is one click away. No permanent panels.
3. **Ship tranches, prove at gates.** Every phase produces a working increment. Phase 3A is the hard gate.
4. **Templates where they help, bespoke where they don't.** 95% template coverage for simple views, 70-80% for complex views.

### 2.2 Domain Fit
Mercury is banking (8 columns, simple relationships). TERP is wholesale brokerage (15+ columns, multi-stage entity workflows). Adaptations:
- 8-column native table → 15+ column AG Grid (kept for density)
- Category dropdown (8 options) → ComboboxCellEditor with typeahead (50+ options)
- Single entity detail → DetailSlideover + full-page route for complex entities
- Final transactions → Multi-stage status workflows via ViewTabBar

---

## 3. Component Specifications

### 3.1 ComboboxCellEditor

**File:** `src/client/components/editors/ComboboxCellEditor.tsx`
**Interface:** AG Grid `ICellEditor`

**API:**
```typescript
interface ComboboxCellEditorProps {
  value: string | null; options: ComboboxOption[];
  placeholder?: string; allowCreate?: boolean;
  onCommit: (value: string | null) => Promise<void>;
  disabled?: boolean; maxOptions?: number;  // default 500
  onSearch?: (query: string) => Promise<ComboboxOption[]>;
}
interface ComboboxOption { label: string; value: string; description?: string; group?: string; disabled?: boolean; }
```

**States:**
1. **Empty:** "Select... ▾" placeholder, grey text
2. **Focused:** Blue focus ring, placeholder visible
3. **Open:** Dropdown below cell (max-height: 280px, option height: 32px). `position: absolute; z-index: 50`. Hovered option: `bg-zinc-100`. ArrowDown/Up navigate. Enter selects. Escape closes.
4. **Value selected:** Dark text + "×" clear button + "▾" chevron. Click × → clears. Click cell → re-opens.
5. **Saving:** Spinner instead of chevron. Cell border grey. Non-interactive. Until `onCommit` resolves.
6. **Saved:** Green checkmark flash (200ms), then fades to State 5.
7. **Error:** Red border + "⚠" icon + tooltip on hover. Click to retry. × to discard.
8. **Typeahead:** Type → options filter (case-insensitive substring). "No results" if empty. `allowCreate` shows "Create '[value]'" at bottom. Async via `onSearch` for lists >500.
9. **Disabled:** Grey text, no chevron, no clear, no interaction.

**Keyboard:** Enter (open/select), Escape (close dropdown), ArrowDown/Up (navigate), Tab (commit + next cell), Shift+Tab (commit + prev), A-Z (typeahead).
**A11y:** `role="combobox"`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-activedescendant`, `role="listbox"` on dropdown, `role="option"` + `aria-selected` on options.
**Edge cases:** Empty options → "No options available". Single option → auto-select. Stale value (not in options) → show value + "Current: [value]" header.

**Create New Flow:** When `allowCreate: true` and typed text has no match:
1. "Create '[typed text]'" option appears at bottom of dropdown (with "+" icon)
2. Click or Enter → `onCommit("[typed text]")` called
3. Backend creates the new entity → Combobox shows State 5 (saving) → State 6 (saved)
4. On success: new option added to options list for future opens
5. On failure: State 7 (error) — "Could not create category"

---

### 3.2 DetailSlideover

**File:** `src/client/components/DetailSlideover.tsx`
**Replaces:** ContextDrawer

**API:**
```typescript
interface DetailSlideoverProps {
  entityType: string; entityId: string;
  state: 'closed' | 'peek' | 'standard' | 'wide';
  onStateChange: (s: SlideoverState) => void;
  onClose: () => void;
  onOpenFullView?: () => void;
}
```

**Tab Registry:**
```typescript
registerTabs(entityType: string, tabs: DetailTab[]): void;
getTabs(entityType: string, userRole?: string): DetailTab[];

interface DetailTab {
  key: string; label: string; icon?: string;
  component: React.ComponentType<{entityId: string; entityType: string}>;
  badge?: number; requiresRole?: string;
}
```

**States:**
1. **Closed:** Not rendered. Main content full width.
2. **Peek (280px):** Row click. Entity summary + 2-3 key actions. Main content interactive. Table not obscured. Dismiss: ×, Escape, click outside.
3. **Standard (420px):** Double-click or "Open" in peek. Header + actions + tab bar + tab content. Main shifts left. Focus trapped.
4. **Wide (60%):** Drag left edge past 420px or "Expand" button. Snaps to: 280px, 420px, 60%. Below 200px → close. Max 70%.
5. **Full View:** "Open in full view" → navigates to `/entity-type/:id`. Same tabs in full-page layout. Tab registry reused.

**Transitions:** CSS `transition: width 300ms cubic-bezier(0.2,0.8,0.4,1)`. Main content `margin-right` transitions. Peek → closed: 200ms ease-in.

**Full-Page Route Reuse:**
The same tab registry used in the slide-over is used in the full-page route. The full-page route component wraps registered tabs in a page layout:
```typescript
// src/client/views/EntityDetailPage.tsx
function EntityDetailPage({ entityType, entityId }) {
  const tabs = getTabs(entityType);
  return <PageLayout><EntityHeader /><TabBar tabs={tabs} /><TabContent /></PageLayout>;
}
// Route: <Route path="/:entityType/:entityId" element={<EntityDetailPage />} />
```
PoLinesTab, VendorDetailTab, etc. render identically in slide-over and full-page — they receive the same `{entityId, entityType}` props.

---

### 3.3 FilterToolbar

**File:** `src/client/components/FilterToolbar.tsx`
**Coexists with:** AdvancedFilterBuilder (behind "Advanced" button)

**API:**
```typescript
interface FilterToolbarProps {
  view: ViewKey;
  presets?: FilterPreset[]; quickFilters?: ('date'|'keyword'|'amount')[];
  dataViews?: DataView[]; groupByFields?: string[];
  sortFields?: string[]; exportFormats?: ('csv'|'excel'|'pdf')[];
  onAdvancedClick: () => void; hasComplexFilter?: boolean;
}
```

**Layout:** `[▾ Data views] | Date ▾ | Keyword ▾ | Amount ▾ | Group ▾ | Sort ▾ | ⚙ | ⬇ Export`
Active filter pills below: `[✕ status:draft] [✕ amount:gte:100]`
Complex filter pill: `[⚙ Complex filter active]` (amber)

**Filter Bridge:**
- `simpleToAdvanced(filters): FilterGroupInput` — serialize chips to AND group
- `advancedToSimple(filter): { simple, hasComplex }` — extract chips, detect complex
- Round-trip preserves all values. Clear all clears both systems.
- Preset click with complex active: warns "This will clear your complex filters."

**Group/Sort Popover:** Compact popover with field selector dropdown + direction toggle. Applies AG Grid groupBy/sort settings.
**Export:** Dropdown: CSV, Excel, PDF. Calls `gridApi.exportDataAsCsv()` or similar. Shows progress for large exports.

---

### 3.4 BulkActionBar

**File:** `src/client/components/BulkActionBar.tsx`

**API:**
```typescript
interface BulkActionBarProps {
  selectedCount: number; selectedTotal?: string; entityLabel?: string;
  actions: BulkAction[]; onClear: () => void;
}
interface BulkAction {
  key: string; label: string; primary?: boolean;
  variant?: 'primary'|'secondary'|'danger'|'warning';
  disabled?: boolean; disabledReason?: string;
  requiresInput?: { field: string; placeholder: string; type?: 'text'|'number' };
  onAction: (inputValue?: string) => Promise<void>;
}
```

**States:**
1. **Hidden:** selectedCount === 0. Not rendered.
2. **Visible:** Animates up: `translateY(0)`, 200ms. Shows: "3 orders selected · $24,500 [Confirm] [Post] [More ▾]"
3. **Executing:** Active button spinner. Others disabled.
4. **Partial:** "2 confirmed · 1 failed [View failures]"
5. **Success:** Green flash 500ms → hides.
6. **Error:** "Failed: [message] [Retry]"

**Bespoke Input Rendering:** When `action.requiresInput` is set:
```
┌────────────────────────────────────────────────────────────┐
│ 1 request selected                                         │
│ Route to: [____________] [Route]                           │
└────────────────────────────────────────────────────────────┘
```
Input renders inline next to action button. Enter triggers action. Input auto-focuses.

---

### 3.5 ViewTabBar

**File:** `src/client/components/ViewTabBar.tsx`

**API:**
```typescript
interface ViewTabBarProps {
  tabs: { key: string; label: string; count?: number }[];
  activeKey: string; onChange: (key: string) => void;
}
// Auto-generation helper:
generateStatusTabs(entityEnum: string[], allLabel?: string): TabDef[]
```

**Layout:** `[All] [Draft (3)] [Confirmed (12)] [Posted (45)]` — horizontal tabs with count badges.
**Overflow:** Scrollable with arrow buttons if tabs exceed viewport width.
**Active:** Bottom border indicator. Rendered with semantic classes.

---

### 3.6 GridSummaryStrip

**File:** `src/client/components/GridSummaryStrip.tsx`

**API:**
```typescript
interface GridSummaryStripProps {
  metrics: { label: string; value: string; delta?: { value: string; direction: 'up'|'down'|'neutral' } }[];
}
```

**Layout:** 3-5 metric cards in horizontal strip. Each: label (small, muted), value (large, dark), optional delta (green/red arrow + value). Responsive: wraps to 2 rows on narrow viewports.

---

### 3.7 View Templates

#### GridView Template
**File:** `src/client/templates/GridView.tsx`
**Used by:** ~15 views
**Props:** `viewKey: ViewKey` + optional slots: `headerContent`, `preGridContent`, `postGridContent`
**Layout:** FilterToolbar → SummaryStrip → ViewTabBar → OperatorGrid → BulkActionBar → DetailSlideover
**Data flow:** Reads `getViewConfig(viewKey)` → renders components from config + data from `useViewData(viewKey)`

#### MasterDetailView Template
**File:** `src/client/templates/MasterDetailView.tsx`
**Used by:** IntakeView, PO selected lines
**Layout:** Same as GridView, but OperatorGrid uses AG Grid master/detail (expandable rows). Detail grid config is per-view.
**Props:** `viewKey`, `detailGridConfig: { columns: ColDef[], rows: GridRow[] }`

#### DashboardView Template
**File:** `src/client/templates/DashboardView.tsx`
**Used by:** DashboardView
**Layout:** Welcome header + Quick Actions → KPI Strip (horizontal cards) → Section A/B (2-column) → Activity Feed
**Props:** `kpiMetrics`, `quickActions`, `sections: { left: ReactNode, right: ReactNode }`, `activityFeed: ReactNode`

#### WizardView Template
**File:** `src/client/templates/WizardView.tsx`
**Used by:** PickView
**Layout:** Step indicator → Current step content. Steps configurable.
**Props:** `steps: { key: string; label: string; content: ReactNode }[]`, `activeStep: number`

---

## 4. Configuration Specifications

### 4.1 Entity Schemas

**File:** `src/config/entity-schemas.ts`

```typescript
type FieldType = 'string' | 'number' | 'money' | 'date' | 'boolean' | 'enum';

interface EntityField {
  header: string; width?: number; minWidth?: number;
  pinned?: 'left' | 'right'; hide?: boolean;
  type?: FieldType; editor?: 'combobox' | 'text' | 'numeric' | 'datePicker' | 'checkbox';
  enum?: string[];  // For combobox options
  cellRenderer?: React.ComponentType<any>;
  valueGetter?: (data: any) => any;
  cellStyle?: (params: any) => CSSProperties;
}

function entitySchema(fields: Record<string, EntityField>): EntitySchema;
```

**Entities to define (GridJourney):** PurchaseOrder, Order, Payment, Inventory/Lot, Client, Vendor, Fulfillment/Pick, Connector, PurchaseReceipt, InvoiceDispute, CloseoutPeriod, RecoveryCommand

**Auto-generated from schema:** AG Grid ColDef array (editor mapping: enum→ComboboxCellEditor, money→NumericEditor, boolean→CheckboxEditor, date→DatePickerEditor), column types, value formatters (currency for money), filter types (set filter for enum).

### 4.2 Entity State Machines

**File:** `src/config/entity-actions.ts`

```typescript
interface StateMachine {
  entity: string;
  states: Record<string, {
    actions: string[];      // Allowed action keys
    primary: string | null; // Primary action (or null)
    requires?: Record<string, { role?: string; condition?: (rows) => boolean }>;
  }>;
}

function defineStateMachine(config: StateMachine): StateMachine;
```

**Entities to define:** PurchaseOrder, Order, Payment, Connector, CloseoutPeriod, RecoveryCommand, FulfillmentPick, VendorBill, SalesOrder

**Derived from:** Current StatusActionTable entries in each view file. Must use REAL status values from `schema.ts` + `commandBus.ts` — never from spec §10.

### 4.3 View Registry

**File:** `src/config/view-registry.ts`

```typescript
interface ViewConfig {
  key: ViewKey;
  template: 'gridView' | 'masterDetail' | 'dashboard' | 'wizard';
  title: string;
  entity: EntitySchema;
  stateMachine: StateMachine;
  summaryQuery: (viewKey: ViewKey) => UseQueryResult;
  detailTabs?: DetailTab[];
  filterPresets?: FilterPreset[];
}

function registerView(config: ViewConfig): void;
function getViewConfig(viewKey: ViewKey): ViewConfig;
```

---

## 5. Hook Specifications

### 5.1 useEntityActions

**File:** `src/client/hooks/useEntityActions.ts`

```typescript
function useEntityActions(
  entityType: string,
  selectedRows: GridRow[],
  userRole?: string
): BulkAction[];
```

**Behavior:** Reads entity state machine. Returns actions filtered by: current status (all selected rows compatible), multi-row constraints, role gates. Mixed statuses → only actions common to all statuses. Primary action first.

### 5.2 useColumnDefs

**File:** `src/client/hooks/useColumnDefs.ts`

```typescript
function useColumnDefs(
  entityType: string,
  overrides?: Partial<ColDef>[]
): ColDef[];
```

**Behavior:** Generates AG Grid ColDef from entity schema. Merges with column prefs (visibility/width/pin). Maps field types to editors/formatters. Respects `hide: true`. Overrides for per-view customizations.

### 5.3 useViewData

**File:** `src/client/hooks/useViewData.ts`

```typescript
function useViewData(viewKey: ViewKey, filters: FilterState): ViewData;
```

**Behavior:** Centralized query registry. Returns: `{ main, aggregates, reference, ... }`. Each view's queries defined in a map. `enabled` flags prevent over-fetching. Replaces 2-10 separate `trpc.*.useQuery()` calls per view.

---

## 6. View Retrofit Specifications

### 6.1 PurchaseOrdersView
**Template:** GridView | **Current:** 987 lines | **Target:** ~300 lines

```
┌─FilterToolbar: Presets(Active|Ordered|Finalized) Date Vendor────┐
├─GridSummaryStrip: 15 POs · $124,500 · 4 Draft · 3 Ordered───────┤
├─ViewTabBar: All | Draft | Ordered | Received | Finalized────────┤
├─PO Table────────────────────────────────────────────────────────┤
├─BulkActionBar: Draft→Finalize, Ordered→Receive──────────────────┤
└─────────────────────────────────────────────────────────────────┘
 [+ New PO] → opens authoring slide-over

DetailSlideover (PO row click):
  Peek: PO #, vendor, status, total, [Draft Intake] [Unfinalize]
  Standard: Lines | Linked Intake | Vendor | History tabs
  Vendor tab: name, terms, open bills, prior POs, quick add (inline)
  Full view: /purchase-orders/:id

ComboboxCellEditor: status, paymentTerms
```

**Action placements verified per rubric §7:**
- R1: "New PO" in header CTA slot ✓
- R4: `cancelPurchaseOrder` wrapped in `useConfirm()` with `tone: 'danger'` ✓
- R4: `removePurchaseOrderLine` wrapped in `useConfirm()` with `tone: 'danger'` ✓
- R3: Row expansion ≤4 buttons ✓
- R5: Danger styling unified ✓

### 6.2 SalesView
**Template:** GridView + inline sections | **Current:** 1986 lines | **Target:** ~400 lines

```
┌─FilterToolbar: All Open|Confirmed|Posted | Date Customer────────┐
├─GridSummaryStrip: 48 orders · $342,000─────────────────────────┤
├─ViewTabBar: All | Draft | Confirmed | Posted | Fulfilled───────┤
├─[Customer: Acme Corp · Balance: $12k · Credit: ✓ · Pre-post]───┤  ← context header
├─Sales Orders Table─────────────────────────────────────────────┤
├─[Draft Lines Grid] (when customer selected)────────────────────┤
│  [+ Add Line] → opens InventoryFinder (slide-over)             │
├─[Suggestions Grid] (collapsible section)───────────────────────┤
├─[Customer Purchase History] (inline, collapsible)──────────────┤  ← preserved inline
├─BulkActionBar──────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────┘

DetailSlideover (order click):
  Tabs: Lines | Pricing | Fulfillment | History
  Full view: /sales/orders/:id
```

**Action placements:** R1: "New Sale" in header when no customer ✓. R4: `cancelSalesOrder` with confirmation ✓. R2: `Confirm order` in BulkActionBar only, not expansion ✓. R3: line expansion ≤4 buttons ✓.

### 6.3 IntakeView
**Template:** MasterDetailView | **Current:** 833 lines | **Target:** ~300 lines

```
┌─FilterToolbar: Ready | In Progress | Verified──────────────────┐
├─GridSummaryStrip: 8 POs pending · 142 batches · $67,400────────┤
├─Master Grid (POs, expandable)──────────────────────────────────┤
│  ▾ PO #1004 · Acme · 12/15 received                            │
│    ┌─Batch rows (inline)────────────────────────────────────┐  │
│    │ Verify | Reject | ••• (Add note, Delete, History)      │  │
│    └────────────────────────────────────────────────────────┘  │
├─BulkActionBar──────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────┘

DetailSlideover (batch click): Movement | Sales | Photos tabs
```

**Action placements:** R3: 6 inline buttons → 2 primary + "More ▾" ✓. R5: Delete uses `tone: 'danger'` ✓. R6: selection totals near grid ✓.

### 6.4 DashboardView
**Template:** DashboardView | **Current:** ~500 lines | **Target:** ~200 lines

```
┌─Welcome, Jane ─────────────────────────────────────────────────┐
│ [New Sale] [New PO] [Intake] [Payment]                         │
├─KPI Strip: Active Orders:12 | Pending Intake:8 | ...──────────┤
├─Today Focus ───────────┬─Work Queues───────────────────────────┤
│ • 5 orders confirmed   │ Intake Ready: 8                       │
│ • 3 POs ordered        │ Payments Pending: 3                   │
├─Activity Feed ─────────────────────────────────────────────────┤
│ My Drafts · Recent Activity · Credit Watch                     │
└─────────────────────────────────────────────────────────────────┘
```

### 6.5 Remaining Views (Template-Based)

All 23 remaining views follow the GridView template with entity-specific configuration. View spec sheets can be generated from the `_TEMPLATE.md` template by filling in: template type, entity schema, state machine, filter presets, summary metrics, detail tabs.

---

## 7. Action Placement Rubric (Must Verify for Every View)

**R1 — Zero-Selection Primary:** Every view has ONE visible primary action when nothing selected. Place in header CTA slot.
**R2 — Selection → BulkActionBar Only:** Commands not duplicated in expansion + toolbar.
**R3 — Row Expansion ≤4 Buttons:** Overflow in "More ▾" dropdown.
**R4 — Destructive Always Confirmed:** `useConfirm()` with `tone: 'danger'` for all delete/cancel/void/reject.
**R5 — Danger Styling Unified:** `tone: 'danger'` → `btn-danger`. No inline `style={{ color: '#b42318' }}`.
**R6 — Contextual Near Target:** Per-row actions visible near row. No distant panels.
**R7 — Discoverable:** Power features have visible affordances.

---

## 8. AI Execution Strategy

### 8.1 Spec-First Workflow
1. PM writes ALL component specs, view specs, test scaffolds BEFORE dispatching any agent.
2. Each agent receives a complete task packet: spec + scaffold + AC + exact file paths.
3. Agent builds from spec. Never designs. Never reads the full codebase.

### 8.2 Parallel Dispatch
Independent tasks run simultaneously on the fast runner (16 vCPUs, 8+ parallel agents). Same-file tasks run sequentially. Cross-view tasks run fully parallel.

### 8.3 Fast Verification
```bash
# Per task (fast):
pnpm typecheck && pnpm vitest run <task-test-file>

# Per phase gate (comprehensive):
pnpm typecheck && pnpm test && PLAYWRIGHT_SKIP_WEB_SERVER=1 pnpm exec playwright test tests/e2e/operator-console.spec.ts --project=chromium --workers=1
```

### 8.4 Task Dispatch Template
```
Build [component] at [file path]. API: [spec]. States: [list].
Read only: [spec], [test scaffold], [1 reference file]. Do NOT design.
Run: pnpm typecheck && pnpm vitest run [test file].
Report: files created, tests passed/failed.
```

### 8.5 Phase Timeline with Parallel AI
Phase 0: 3 days | Phase 1: 2 days | Phase 2: 2 days | Phase 3A: 3 days | Phase 3B: 2 days | Phase 3C: 1 day | Phase 3D: 2 days | Phase 4: 2 days | **Total: 17 days**

---

## 9. Design Constraint Checklist

These MUST be preserved. Agents MUST verify on every task.

| # | Constraint | Check |
|---|-----------|-------|
| C1 | Mutations via `useCommandRunner` only | ☐ |
| C2 | One Zustand store (`useUiStore`) | ☐ |
| C3 | Hybrid Tailwind + semantic CSS | ☐ |
| C4 | Green = interactive, Blue = status | ☐ |
| C5 | `APP_LOCALE` for all formatting | ☐ |
| C6 | Real status values from `schema.ts` | ☐ |
| C7 | `useConfirm()` for all confirmations | ☐ |
| C8 | `FormDialog` for one-shot, `WorkspacePanel` for repeated | ☐ |
| C9 | `audit:form-ids` passes on unlabeled controls | ☐ |
| C10 | Focus traps on all drawers/modals | ☐ |
| C11 | Entity UUIDs not in localStorage | ☐ |
| C12 | AG Grid desktop only, cards on mobile | ☐ |
| C13 | Booleans never as text | ☐ |
| C14 | Empty states name the producing verb | ☐ |
| C15 | Disabled controls carry `title` tooltip | ☐ |

---

## 10. Design Anti-Patterns REJECTED

These caused the current poor UX. Must not reappear.

| Anti-Pattern | Mercury Replacement |
|---|---|
| Multiple WorkspacePanels stacked | Template-based layout: one surface |
| Inline cell renderers in useMemo on view state | Stable components with cellRendererParams |
| Per-view ColDef arrays (2000+ lines) | Entity schemas → auto-generated |
| Per-view StatusActionTable (8+ duplicates) | Entity state machines |
| `style={{ color: '#b42318' }}` | Semantic CSS classes |
| `test.skip(true, ...)` | Self-creating test data or delete |
| "Coming soon" disabled buttons | Hidden until implemented |
| Dead backend procedures | Removed or wired |
| Counters for unimplemented features | Hidden until backend ships |

---

## 11. Feature Flag Coordination

### Available Flags
- `FEATURE_GRID_VIEW_TEMPLATE` — enables GridView template per view
- `FEATURE_FILTER_TOOLBAR` — FilterToolbar vs. AdvancedFilterBuilder
- `FEATURE_INLINE_COMBOBOX` — ComboboxCellEditor for editable columns
- `FEATURE_BULK_ACTION_BAR` — BulkActionBar vs. StatusActionBar
- `FEATURE_DETAIL_SLIDEOVER` — DetailSlideover vs. ContextDrawer

### Per-Phase Enablement
| Phase | Flags Enabled |
|-------|--------------|
| 0 | All flags OFF (components exist, not wired) |
| 1 | All flags ON for PurchaseOrdersView only |
| 2 | All flags ON for all GridJourney views |
| 3A | No flag changes (refactoring only) |
| 3B | All flags ON for SalesView |
| 3C | All flags ON for Intake + Dashboard |
| 3D | All flags ON for remaining views |
| 4 | All flags ON globally. Remove flag checks (flatten). |

### Rollback
Any phase: toggle flag OFF for problematic view. Instant. No git revert. No deploy.

---

## 12. Transition Plan — ContextDrawer → DetailSlideover

### Phase 0-2: Coexistence
- ContextDrawer remains active for views NOT yet migrated.
- DetailSlideover available for migrated views (PurchaseOrders, GridJourney views).
- Both components exist in codebase. Feature flag controls which renders.

### Phase 3A: Refactoring — No Change
- SalesView refactoring does not touch drawer system.

### Phase 3B: SalesView Migration
- SalesView switches from ContextDrawer to DetailSlideover.
- ContextDrawer still available for unmigrated views (Matchmaking, Pick, etc.).

### Phase 3D: Final Views
- All remaining views switch to DetailSlideover.
- ContextDrawer code still present (behind flag) but not rendered.

### Phase 4: Cleanup
- If all 27 views migrated and stable: remove ContextDrawer code.
- If issues found: toggle `FEATURE_DETAIL_SLIDEOVER` OFF for affected views, reverting to ContextDrawer.

---

## 13. Risk Map

| Risk | Severity | Trigger | Mitigation |
|------|----------|---------|-----------|
| ComboboxCellEditor too complex | High | Week 1 agent stuck on ICellEditor lifecycle | Fallback: use AG Grid Rich Select for 80% of needs. Custom only for typeahead/create-new. |
| Abstract creep | High | Agents build over-complicated shared components | Templates are opt-in. Views can bypass. Each template has extension slots for bespoke code. |
| SalesView breaks | Blocker | Phase 3A tests fail | HARD GATE: do not proceed to 3B. Reassess cell renderer extraction strategy. |
| Mixed-migration UX | Medium | Operators see both old and new UX | Phase 1 only. Thereafter, views fully migrated or not at all. |
| Filter bridge complexity | Medium | Round-trip loses filter values | Simple→Advanced→Simple round-trip test in T-0-08. Must pass. |
| 17-day AI timeline unrealistic | Medium | Agents need more iterations than estimated | Buffer in Phase 3D + Phase 4. Cut scope from long-tail views if needed. |
| Entity state machine status drift | Medium | Spec statuses don't match DB | State machines derived from `schema.ts` + `commandBus.ts`. Verified in T-0-13. |

---

## 14. Research Evidence Summary (Mercury Patterns)

### Combobox (from demo.mercury.com/transactions)
- Custom component: `role="combobox"`, `aria-autocomplete="list"`
- Immediate save on Enter — no "Save" button
- Clear button on value-set cells
- "Create new" option at dropdown bottom
- Typeahead: `readonly="false"` on input

### Detail Panel
- Right-side slide-over, 424px, z-index: 2
- URL updates on open (e.g., `/transactions/lineOfCreditTransaction-3`)
- "Close detail panel" button with X icon
- Content: amount, account, date, category picker, GL code, notes, attachments

### Filter Toolbar
- Horizontal menubar: Data views | Date | Keyword | Amount | Group | Sort | Export
- Chips open inline popovers
- Active filters shown as dismissible pills
- "Show graphs" toggles inline expansion above table

### KPI Summary
- Above every table: "Net change this month: $3,363,738.82 | Money in: $4,068,048.07 | Money out: −$704,309.25"

### Bulk Actions
- Checkboxes on rows
- Selection bar shows count + total + contextual actions
- "Select all" available

### Page Structure
- ~6 core pages: Dashboard, Accounts, Transactions, Cards, Payments, Invoicing
- Account detail: full-page navigation with tabs
- Sidebar: navigation + bookmarks + task count badge

---

## 15. Dependency Graph

```
Phase 0: All independent → can run fully parallel
  T-0-01→T-0-02→T-0-03→T-0-04 (Combobox chain)
  T-0-05→T-0-06 (Slideover chain)
  T-0-07→T-0-08 (Filter chain)
  T-0-09, T-0-10, T-0-11 (independent)
  T-0-12→T-0-15→T-0-16 (Schema chain)
  T-0-13→T-0-14→T-0-16 (State machine chain)
  T-0-C1..C5 (all independent)
  T-0-T1..T6 (all independent)

Phase 1: Sequential on PurchaseOrdersView (same file)
  T-1-01 → T-1-02..08 (depend on T-1-01) → T-1-09

Phase 2: Views are independent files → fully parallel
  T-2-01,02,03 (independent) → T-2-04..06 (parallel) → T-2-07 → T-2-08

Phase 3A: Renders are separate files → fully parallel
  T-3A-01..07 (parallel) → T-3A-08 → T-3A-09,10,11 (parallel) → T-3A-12

Phase 3B: Same file → sequential
Phase 3C-D: Different views → parallel
Phase 4: Different concerns → parallel
```

---

## 16. Post-Retrofit Codebase

```
src/
├── config/
│   ├── entity-schemas.ts       ← Entity field definitions
│   ├── entity-actions.ts       ← State machines
│   └── view-registry.ts        ← View declarations
├── templates/
│   ├── GridView.tsx            ← 15+ views
│   ├── MasterDetailView.tsx    ← Intake, PO lines
│   ├── DashboardView.tsx       ← Dashboard
│   └── WizardView.tsx          ← Pick
├── components/
│   ├── editors/ComboboxCellEditor.tsx
│   ├── FilterToolbar.tsx
│   ├── BulkActionBar.tsx
│   ├── DetailSlideover.tsx
│   ├── tabs/registry.ts
│   ├── ViewTabBar.tsx
│   └── GridSummaryStrip.tsx
├── hooks/
│   ├── useViewData.ts
│   ├── useEntityActions.ts
│   └── useColumnDefs.ts
└── views/
    ├── SalesView.tsx           ← ~400 lines (was 1986)
    ├── PurchaseOrdersView.tsx  ← ~300 lines (was 987)
    └── ...                     ← All shrunk 60-80%
```

---

*End of Master Execution Document. This is the single source of truth for building the Mercury UX retrofit.*

