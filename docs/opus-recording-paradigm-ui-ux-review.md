# TERP Agro UI/UX Review — Second Pass

**Reviewer:** Claude Opus, acting as skeptical senior product architect / operator-workflow UX reviewer
**Date:** 2026-05-11
**Scope:** Documentation-only review. Pushes back on the Codex first-pass audit where evidence allows, agrees where it earns it, and prioritizes the smallest viable changes.

---

## 1. Inferred Current-System Paradigm

Stripping the documentation down past Codex's framing, the operator paradigm is narrower and more behavioral than "spreadsheet-native":

**a. Row as durable working memory.** A row is not a record — it is a scratch space that *ages into* a record. An intake row can be entered before the product physically arrives. A sale line can be drafted before the buyer confirms. A `C` marker can sit in a cell for weeks before its meaning is resolved. The system tolerates undetermined state in a visible cell. **TERP Agro currently does not — it forces commitment at command time.**

**b. Location-as-context, not navigation-as-context.** The operator does not "go to the Sales module." They land on a *client's sheet* (Rich Star, Others) and the sheet *is* the workflow. Inventory lookups happen via Cmd+F across the workbook, not via a global filter. Context is spatial and named, not modal.

**c. Two-finger typing, not keyboard wizardry.** Despite the Codex audit's enthusiasm for "keyboard-first," the recording evidence shows operators using shorthand entry, paste, fill-down, and visual scanning — not Vim-style hotkey chains. The speed comes from *fewer steps*, not from *faster steps*.

**d. Math is proof, not output.** Subtotal cells, ticket × quantity, available count — these visible computations are how the operator *trusts* the row. The number isn't a result of the row; it's part of what makes the row legible.

**e. Markers are vocabulary, not state machines.** `C`, `Iv`, `P`, `M`, `OFC`, `FT`, `25 flex` — these are operator language. Their meaning is contextual, sometimes provisional, and sometimes never confirmed. The operator does not need them normalized. They need them *visible and preserved*.

**f. Receipts and outputs are byproducts of selection.** A vendor receipt is not a separate document workflow. It is "I selected these rows; show me the total." The Codex audit gets this right but underweights it.

**g. The customer sheet is the unit of trust.** Rich Star's sheet contains everything about Rich Star — orders, packed state, payment state, notes. Operators do not reconcile across modules; they reconcile within the customer's named workspace.

---

## 2. Biggest Mismatches Between Paradigm and Current TERP Agro

I'll be direct: the Codex first-pass audit produced 55 recommendations, which is itself a mismatch signal — but the underlying analysis identifies the right *symptoms* while sometimes misdiagnosing the *cause*. The real mismatches are fewer and deeper:

### M1. **Commitment vs. tolerance for undetermined state**
TERP Agro's command bus is its strength *and* its mismatch. Every write is a typed command with validation. The recording paradigm depends on rows that can sit half-determined. A `C` marker, an unconfirmed arrival, a sale line with no resolved inventory source — these are *operationally normal* states in Numbers, but they don't have a home in a command-validated system. **This is the structural mismatch underneath several Codex findings (UI-009, UI-010, UI-012, UI-024–UI-026).**

### M2. **Navigation-as-context vs. location-as-context**
The Quick Start bar is a navigation device dressed as an action device. "New Sale" creates a record and routes to a module. The paradigm is the inverse: the operator is already at a place (a customer) and adds to it. **Codex UI-001, UI-003, UI-004 point at this but split it across three recommendations.**

### M3. **Search as filter vs. search as Cmd+F across everything**
InventoryFinderPanel is structured filtering. Operators use unstructured search — they type `m15`, `rich`, `25 flex`, `ofc` and expect hits across notes, codes, markers, and item aliases. Faceted filters serve a different operator than the one in the videos. **Codex UI-014 calls this out but treats it as a feature add rather than a search-model change.**

### M4. **Closeout as lifecycle status vs. closeout as three visible checks**
TERP Agro's `Draft → Confirmed → Posted → Fulfilled` lifecycle is correct for an audited ERP. The operator paradigm uses **three independent boolean cells**: packed, inventory updated, payment/follow-up. They are not phases of one status; they are three separate workstreams that close on different schedules. **Codex UI-011 gets this right; weight it higher.**

### M5. **Receipts as a document workflow vs. receipts as "what did I just select?"**
Codex UI-021 / UI-022 are correct but should be one change, not two: any selection of rows should be able to *show its total and produce a receipt artifact*. This is a generic operator capability, not a feature of Intake.

### M6. **Money as commands vs. money as a quick ledger row**
The four Quick Start money buttons (Receive Money, Pay Vendor, etc.) are individual command launchers. The paradigm wants a **typed grid you append to**. Cash logging, crypto logging, referral payouts — these are categorically similar entries that share columns and want fast row-after-row entry. **Codex UI-007 and UI-029–UI-032 are the same recommendation refracted four times.**

### M7. **Markers normalized too aggressively**
`OwnershipStatus = C | OFC | UNKNOWN` is the cleanest example: a three-value enum was extracted from what is actually a free-text marker column with at least 6 observed values and unknown semantics. Codex UI-009/UI-010 correctly call this out. This is a *data model* mismatch, not just UI — the schema needs a `legacy_marker text` column preserved alongside any inferred status.

### M8. **The customer workspace doesn't exist**
There is a Sales view with a customer selector. There is no "Rich Star's page." The mental model where a customer *has* a workspace containing draft order + packed state + payment state + notes + history is not represented in the IA. **This is more structural than Codex's UI-001/UI-003 suggest — it's an information architecture question, not a "default view" question.**

---

## 3. Prioritized Atomic Recommendations

I am deliberately consolidating Codex's 55 items into ~18 prioritized atomics. The first-pass audit conflated frequency with priority; many items (UI-040 through UI-055) are reasonable but not on the critical path for paradigm fit.

**Priority scale:** P0 = paradigm-critical; P1 = comfort-critical; P2 = polish.
**Gap type:** Visibility | Workflow | Output | Trust/Control | Structural.

---

### P0 — Paradigm-Critical (do these first)

#### R1. Add `legacy_marker` as a first-class preserved field
- **Operator moment:** Reviewing imported or operator-entered inventory rows.
- **Current failure:** Normalization to `C | OFC | UNKNOWN` discards operator vocabulary and forces commitment to an interpretation that may be wrong.
- **Smallest viable change:** Add `legacy_marker text` column to inventory rows (and order lines for `P`, `Iv`, `C`, `M`). Display it as a raw, narrow column with a hover-only legend. *Do not* change command logic yet — let it coexist with the existing enum.
- **Acceptance:** Importing rows with `C`, `ofc`, `Ofc`, `CV`, `T`, blank preserves all six. Operator can edit the raw value. The narrow column is always visible.
- **Gap type:** Structural + Visibility.

#### R2. Decouple ownership, arrival, and consignment-due into three independent fields
- **Operator moment:** Resolving why a payable is due, or confirming a row physically arrived.
- **Current failure:** A single `OwnershipStatus` enum tries to encode three orthogonal facts. Consignment-due is derived from inventory depletion, not ownership.
- **Smallest viable change:** Split into `ownership_status` (office | consigned | terms | unknown), `arrival_status` (pending | arrived | canceled), and keep consignment-due as a *computed* signal on the vendor bill row, not a marker on inventory. Migrate existing values conservatively (default `unknown` where ambiguous).
- **Acceptance:** Operator can see an inventory row that is `arrived + unknown ownership`. Vendor payable explains "due because consigned lot depleted" inline.
- **Gap type:** Structural + Trust/Control.

#### R3. Make `New Sale` open a customer workspace, not route to Sales
- **Operator moment:** Starting work for a specific customer.
- **Current failure:** Quick Start creates an order record and lands on a global Sales grid. The customer becomes a filter, not a place.
- **Smallest viable change:** After customer selection, render a `/customers/:id` workspace that shows, in one viewport: customer header (balance, recent activity), an editable draft order grid focused on row 1, and the Inventory Finder side panel pre-scoped to the customer's recent buying patterns. The order grid is the primary surface; metadata is collapsible.
- **Acceptance:** From any module, `Cmd+K → "new sale" → customer name → Enter` lands focus in an editable first sale line with finder open. Total elapsed: < 3 seconds, < 4 keystrokes after customer name.
- **Gap type:** Workflow + Structural.

#### R4. Add three closeout columns to sales/order rows: `Packed`, `Inv Posted`, `Pay/F-up`
- **Operator moment:** Closing out a sale across multiple async events (packing, inventory write, payment).
- **Current failure:** Lifecycle status conflates three independent workstreams. Operator cannot see at a glance which orders still need packing vs. payment.
- **Smallest viable change:** Add three boolean columns to the order line grid, each independently toggleable, each writing a typed command. Preserve any imported raw marker as a fourth narrow column. Lifecycle status stays but moves to secondary.
- **Acceptance:** Operator can sort/filter by any of the three closeouts. Toggling one writes an auditable command. Imported `P`, `Iv`, `C`, `M` values display unchanged in the raw marker column.
- **Gap type:** Visibility + Workflow.

#### R5. Universalize "selection produces a receipt total"
- **Operator moment:** Confirming what was received from a vendor, or what's about to be invoiced.
- **Current failure:** Receipt generation is bundled into Intake's posting flow. Selection-totaling is not a generic capability.
- **Smallest viable change:** Any AG Grid selection in Intake (and Sales, Payments) shows a sticky footer with `count | sum(quantity) | sum(subtotal)`. Add a "Generate receipt from selection" button that previews the receipt before posting. No PO required.
- **Acceptance:** Operator selects 4 intake rows, sees totals live, clicks generate receipt, previews vendor + date + line totals matching selection, then posts. Mixed vendor/date selection shows which rows conflict and requires explicit override.
- **Gap type:** Workflow + Output.

#### R6. Replace the four money quick-start buttons with a Quick Ledger grid
- **Operator moment:** Logging 5 mixed cash/crypto entries between two customer conversations.
- **Current failure:** Each entry requires a separate command launch. Cash bucket and category are not visible until you commit.
- **Smallest viable change:** On the Payments view, put a 5-row "draft ledger" grid at the top with columns: `Date | Method | Bucket | Category | Counterparty | Amount | Reference | Notes`. Each row commits independently on Enter. Buyer-credit / down-payment auto-labels when amount < 0. Quick Start money buttons become row-presets that pre-fill the grid.
- **Acceptance:** Trained operator logs 5 mixed entries in < 30 seconds with no modal. Negative amounts immediately show "buyer credit" label and balance impact. Office vs. accounting cash is always visible.
- **Gap type:** Workflow + Visibility.

---

### P1 — Comfort-Critical (do these next)

#### R7. Upgrade the finder to a full-text resolver, not just faceted filters
- **Operator moment:** Operator types `m15` or `25 flex` to find an inventory row.
- **Current failure:** Filters require knowing which facet a value belongs to. Operators search by *whatever string they remember*.
- **Smallest viable change:** Add a single search box that tokenizes across source code, intake date/code, vendor, item, notes, price range, legacy marker, and item aliases simultaneously. Keep facet chips as a refinement layer, not a primary input.
- **Acceptance:** `m15` returns rows where any field contains that substring. `25 flex` finds the note-bearing row. Faceted chips can additionally narrow the result.
- **Gap type:** Workflow + Visibility.

#### R8. Show source-row identity and ambiguity in finder + order lines
- **Operator moment:** Adding inventory to an order; later confirming what was committed.
- **Current failure:** Order lines reference inventory by code alone; ambiguity is not surfaced.
- **Smallest viable change:** Each finder result shows compactly: `code/date · source · item · avail/intake · ticket · marker`. When an order line maps to >1 inventory row, the line shows an amber badge and posting refuses until disambiguated. Already-added rows show "in order" badge.
- **Acceptance:** Posting an order with an ambiguous match fails with a row-level message naming the candidate rows. No silent matches.
- **Gap type:** Trust/Control + Visibility.

#### R9. Visibly lock `Intake` quantity post-posting; show `Available` as derived
- **Operator moment:** Looking at a posted intake row weeks later.
- **Current failure:** Manual edits to `Available` happen silently. Intake quantity drift is invisible.
- **Smallest viable change:** Render the `Intake` cell with a lock icon and read-only style once posted. `Available` cell is read-only and shows a small "derived" indicator; manual changes route through an adjustment command that creates a visible audit row.
- **Acceptance:** Trying to edit posted `Intake` shows "use adjustment". Editing `Available` opens an adjustment draft with reason field; the original computed value remains visible alongside.
- **Gap type:** Trust/Control + Visibility.

#### R10. Add per-row command history + reversal preview affordance
- **Operator moment:** "What did I just do to this row?"
- **Current failure:** Recovery is keyed by command ID; the operator who sees a problematic row has no path from row → command.
- **Smallest viable change:** Add a small clock icon in each posted row's first cell. Click opens a drawer showing the last 5 commands touching the row, with actor, time, before/after diff, and a "preview reversal" button.
- **Acceptance:** From any posted inventory/sale/payment row, operator reaches command history in 1 click and previews reversal impact before committing.
- **Gap type:** Trust/Control.

#### R11. Add inline KPI definitions + source-row drilldown
- **Operator moment:** Owner sees `Available Files` and asks "where does this number come from?"
- **Current failure:** KPI cards exist with drilldowns, but business definitions (`Files = cash`, `Available = on hand − scheduled payables`, office vs. accounting buckets) are not inline.
- **Smallest viable change:** Each KPI card gains a small `?` icon showing the formula in plain language, and a click opens the underlying row grid filtered to the contributing rows. Add a "buckets" sub-card breaking office vs. accounting where applicable.
- **Acceptance:** Hovering `?` on `Available Files` shows "Files on Hand − Payables Scheduled = $X − $Y". Clicking drills to the rows. Discrepancy banner appears when unknown ownership or unallocated payments affect the number.
- **Gap type:** Visibility + Trust/Control.

#### R12. Distinguish Due vs. Scheduled in payable surfaces
- **Operator moment:** Reviewing what to pay this week.
- **Current failure:** Codex audit notes the backend distinguishes scheduled vs. due, but the UI does not always show *why* something is due.
- **Smallest viable change:** Payable row gains a `due_reason` text column: "consigned depleted" | "net terms reached" | "scheduled appointment" | "down payment remaining". Scheduled rows show the event time.
- **Acceptance:** Every due/scheduled payable row explains itself in a single visible cell.
- **Gap type:** Visibility.

#### R13. Accept shorthand at entry; normalize only on review
- **Operator moment:** Typing `Ins/candy` into Category.
- **Current failure:** Tightly typed enums reject operator vocabulary at entry.
- **Smallest viable change:** Category, source, and similar fields accept free-text. A nightly (or on-demand) "vocabulary review" view groups unmapped values, shows counts and examples, and lets an admin map them to canonical forms — without rewriting historical rows.
- **Acceptance:** Operator can enter `Ins/candy`, `Ins`, `Smalls`, `Deps` freely. Admin sees an unmapped-vocabulary queue and can approve aliases.
- **Gap type:** Workflow + Structural.

#### R14. Support TSV paste and fill-down on operational grids
- **Operator moment:** Pasting 20 intake lines from a phone note or text message.
- **Current failure:** Grid edits are single-cell or single-row.
- **Smallest viable change:** Enable AG Grid clipboard paste with column-mapping confirmation and fill-down on selected cells. Tests should cover 500-row paste.
- **Acceptance:** Pasting 50 TSV rows from clipboard creates 50 draft rows with a single column-mapping confirmation.
- **Gap type:** Workflow.

---

### P2 — Polish (defer until P0/P1 land)

#### R15. Persist panel layout per user/route; add minimize keyboard
- **Operator moment:** Wanting more room for the grid.
- **Current failure:** Panel state resets across sessions.
- **Smallest viable change:** Persist collapsed/focused state in user preferences. Add `Cmd+\` to minimize secondary panels; `Esc` restores.
- **Acceptance:** Layout survives reload. Keyboard works.
- **Gap type:** Workflow.

#### R16. Command palette aliases for legacy vocabulary
- **Operator moment:** Operator types `files` or `ofc` in command palette.
- **Current failure:** Modern command names don't match operator vocabulary.
- **Smallest viable change:** Add an aliases table: `files → cash`, `ofc → office-owned`, `iv → inventory posted`, `ticket → unit cost`, `sub → subtotal`. Used by command palette search only; no schema change.
- **Acceptance:** `Cmd+K → "files" → Available Files KPI` works.
- **Gap type:** Visibility.

#### R17. Split `New PO / Intake` into `New PO` and `Receive Inventory`
- **Operator moment:** Operator either plans a purchase (PO ahead) or just received a package (ad hoc intake).
- **Current failure:** One button bundles two distinct intents.
- **Smallest viable change:** Two Quick Start buttons sharing the same backend command path. Different default states: `New PO` opens with vendor + planned-only; `Receive Inventory` opens with vendor + arrived + ready to enter rows.
- **Acceptance:** Operator picks the right starting point in one click. Backend audit shows which entry was used.
- **Gap type:** Workflow.

#### R18. Customer-facing catalog export + internal sales sheet preview
- **Operator moment:** Sending product list to a customer; reviewing margin internally.
- **Current failure:** Codex audit suggests catalog export exists but is not surfaced as a paradigm-level capability.
- **Smallest viable change:** Two named export buttons on the customer workspace: "Send catalog" (hides cost/margin) and "Preview internal sheet" (shows margin and rule reason). Both copy to clipboard and download.
- **Acceptance:** Both exports produce correctly redacted/expanded output without manual cleanup.
- **Gap type:** Output.

---

## Where I Disagree With the Codex First-Pass Audit

To earn the "skeptical" label honestly:

1. **55 recommendations is too many.** Several of Codex's items (UI-019 saved filter chips, UI-020 compare strip, UI-043 resizable panels, UI-048–UI-055 output and naming items) are reasonable in isolation but dilute the priority signal. They belong on a backlog, not in a paradigm-fit review.

2. **UI-002 / UI-041 keyboard hotkeys are overweighted.** The recording evidence does not show power-user hotkey behavior. It shows paste, fill-down, and Cmd+F. Optimize for those, not for Vim.

3. **UI-005 splitting PO and receiving is correct but P2, not P0.** The bigger win is the customer workspace and the closeout columns.

4. **UI-052 renaming `Batch`** — agree it's worth doing but it's P2 vocabulary work, not paradigm work.

5. **Codex underweights the structural mismatch in M1 (commitment vs. undetermined state).** The recommendations for legacy markers (UI-009/UI-010) treat this as a UI display problem. It's a data model problem with UI consequences. R1 and R13 above reframe it.

6. **Codex's "client workspace" framing in UI-001/UI-003/UI-004 is split across three items.** It should be one structural recommendation (R3), not three UI tweaks.

---

## Acceptance Bar for "Paradigm Fit" Pass

The next pass is done when a trained operator can demonstrate, without modal wizards and without leaving the keyboard for routine work:

1. Land on a customer workspace from anywhere in < 3 seconds, with finder pre-scoped and first sale line focused. (R3)
2. Resolve inventory by typing fragments operators actually use — `m15`, `25 flex`, `rich`, `ofc`. (R7)
3. See and toggle the three closeout cells independently of lifecycle status. (R4)
4. Log 5 mixed money entries in a ledger grid in under 30 seconds with correct buckets. (R6)
5. Generate a vendor receipt from selected intake rows without a PO, with totals matching selection live. (R5)
6. View any posted row's last command and preview reversal in one click. (R10)
7. See imported markers like `C`, `ofc`, `P`, `Iv`, `M` preserved verbatim on every relevant row. (R1)
8. Read inline why a payable is due or scheduled, and what each KPI means. (R11, R12)

If those eight work cleanly, the paradigm fits — and the remaining items can wait.
