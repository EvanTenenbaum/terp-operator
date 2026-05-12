# TERP Agro Master UI/UX Recommendations From Recording Paradigm Review

Date: 2026-05-11
Status: master synthesis after Codex first-pass audit plus Claude Opus second-pass review

## What This Is

This report audits the current TERP Agro web app against prior documentation produced from recent current-system screen recordings. It does not argue that TERP Agro should copy Apple Numbers. It identifies which parts of the current operator paradigm create comfort, speed, and trust, then turns those into specific UI/UX improvements for the web app.

Inputs used:

- Codex first-pass audit: `docs/recording-paradigm-codex-audit.md`
- Opus second-pass review: `docs/opus-recording-paradigm-ui-ux-review.md`
- Condensed recording evidence packet: `docs/recording-analysis-evidence-packet-for-opus.md`
- Existing implementation audits: `docs/frontend-interaction-surface-audit.md`, `docs/workflow-gap-audit.md`
- Prior recording-analysis artifacts under `../artifacts/video-feedback/` and `../terp-numbers-command-system/artifacts/video-feedback/`

## Master Verdict

TERP Agro has the correct safety architecture and much of the required feature coverage. The gap is not "missing ERP modules." The gap is that several surfaces still behave like an ERP console with grids, while the current operators work inside a spreadsheet where rows are durable working memory.

The product should move toward a row-native command console:

- Rows can start incomplete and become more certain over time.
- Raw shorthand and marker vocabulary stays visible until confidently mapped.
- A customer workspace feels like the modern version of a client sheet.
- Search behaves like "find whatever string I remember", not only as faceted filtering.
- Money entry behaves like appending ledger rows, not launching one command at a time.
- Receipt and closeout actions come from selected rows and visible status cells.
- Every automated consequence remains inspectable from the row that caused it.

The current build is close enough that this can be achieved by improving current surfaces, not by replacing the app structure.

## Codex vs. Opus Comparison

### Where both reviews agreed

- `New Sale` needs to land in a customer-centered workspace, not just create an order and route to a global Sales page.
- Inventory finder must search across remembered operator strings like source codes, notes, legacy markers, item labels, and shorthand.
- Raw legacy markers such as `C`, `ofc`, `OFC`, `CV`, `T`, `P`, `Iv`, `M`, and unknown values must be preserved.
- Sales closeout needs visible independent checks for packed, inventory posted, and payment/follow-up.
- Receipts should be generated from selected rows with live totals and should not require a formal PO.
- Payments need a fast ledger-grid entry surface, not only one-off quick action buttons.
- Row-level history and reversal preview are required for trust.

### Where Opus corrected the first pass

- The first pass had too many equal-weight recommendations. The master list below keeps a long backlog but sharply separates P0 paradigm work from P1/P2 comfort and polish.
- Hotkeys matter, but the recording evidence points more strongly to paste, fill-down, visible scanning, and search than to complex shortcut chains.
- The marker issue is not only a UI display problem. It is a data model and trust problem.
- `New PO` vs. `Receive Inventory` is useful, but the higher-priority work is client workspace, closeout columns, finder/resolver, quick ledger, and selection-based receipt totals.
- The deepest mismatch is "typed command commitment" versus the current system's tolerance for uncertain visible rows. TERP Agro needs explicit draft/provisional states so command safety does not make early work feel brittle.

## Priority Model

- `P0`: paradigm-critical. Without these, the app will feel less comfortable or slower than the current spreadsheet in daily work.
- `P1`: comfort-critical. These make the P0 flows fast enough and safe enough for trained operators.
- `P2`: useful polish/backlog. Valuable, but not blockers for paradigm fit.

Gap types:

- `visibility_gap`: truth exists but is not visible at the decision point.
- `workflow_gap`: too many jumps, steps, or mental stitching.
- `output_gap`: the app cannot produce a usable operator/customer artifact.
- `trust_control_gap`: pricing, posting, recovery, ownership, or money safety is not explicit enough.
- `structural_gap`: the current surface/data shape cannot represent the operator moment without a small structural change.

## P0 Recommendations

| ID | Recommendation | Operator Moment | Current Failure | Smallest Viable Change | Acceptance Criteria | Gap Type |
| --- | --- | --- | --- | --- | --- | --- |
| MR-001 | Add a first-class provisional row state | Drafting intake, sales, or payment rows before everything is known | Commands validate too early compared with spreadsheet rows that can sit incomplete | Add explicit `draft`, `needs_resolution`, and `ready` row states before command posting; keep plain-language missing-field messages inline | A row with unknown ownership, unresolved inventory, or incomplete payment can be saved as draft and later marked Ready without losing raw values | structural_gap |
| MR-002 | Preserve raw legacy markers everywhere | Reviewing migrated or operator-entered rows | Current `OwnershipStatus = C/OFC/UNKNOWN` over-normalizes ambiguous markers | Add `legacy_marker` to inventory and `legacy_status_markers` to sales/order rows; show narrow raw columns | Imported/entered `C`, `ofc`, `OFC`, `CV`, `T`, blank, `P`, `Iv`, `M`, and unknown text remain visible and editable | structural_gap |
| MR-003 | Split ownership, arrival, and due logic | Intake confirmation and payable review | One marker is being asked to explain ownership, arrival, and consignment obligation | Model/display `ownership_status`, `arrival_status`, raw marker, and computed payable due reason separately | An inventory row can be `arrived + unknown ownership`; a payable can say `due because consigned lot depleted` without relying only on raw `C` | trust_control_gap |
| MR-004 | Make `New Sale` open a customer workspace | Starting a sale from anywhere | Quick Start creates an order and routes to a global Sales grid; customer is a filter, not a place | Add a customer workspace surface with customer header, editable draft order grid, finder, balance, notes, and recent purchases | `Cmd+K -> new sale -> customer -> Enter` lands focus in first editable sale line with finder open | workflow_gap |
| MR-005 | Keep the first sale line focused and editable | Building the order | Operators need to type/paste rows immediately, like a client sheet | When a customer workspace opens, create or resume a visible draft order with an empty line | Operator can type item, qty, price, notes into the line without opening a form | workflow_gap |
| MR-006 | Add inline inventory resolution to sale lines | Adding inventory to a customer order | Finder adds batches, but sale lines do not feel like copied inventory rows being resolved | Let sale-line item/source fields search and bind to inventory rows inline; unresolved lines stay visible as `needs_resolution` | Typing `m15` or item shorthand into a line offers matching inventory rows and stores the exact selected source row | workflow_gap |
| MR-007 | Add three independent closeout columns | Packing, inventory update, and payment/follow-up | Lifecycle status hides the independent checks operators currently track as cells | Add `Packed`, `Inv Posted`, and `Pay/F-up` columns to order/sales grids; each writes its own audited command | Operator can sort/filter/toggle each check independently; lifecycle status remains secondary | visibility_gap |
| MR-008 | Upgrade finder search into a full-text resolver | Searching inventory while selling | Facets require knowing which field holds the remembered value | Add a single search input across source code, intake date/code, vendor, item, category, notes, price range, marker, tag, and alias | Searches for `m15`, `rich`, `25 flex`, `ofc`, and item names return relevant rows | workflow_gap |
| MR-009 | Show source-row identity and ambiguity | Posting a sale line | Source code alone is not unique enough | Finder and order lines show compact identity: code/date, source, item, available/intake, ticket, marker, match confidence | Posting refuses ambiguous matches and names candidate rows to resolve | trust_control_gap |
| MR-010 | Add duplicate source-row guards in the UI | Adding lines to an order | Backend may refuse duplicate source rows, but operator should see it before posting | Show `Already in order` badges in finder and sale lines; allow explicit split only when intended | Duplicate add is blocked or requires clear split confirmation | trust_control_gap |
| MR-011 | Make selected-row totals universal | Selecting intake rows or order lines | Receipt generation is too tied to a specific flow | Every operational grid selection shows sticky count, qty sum, and money sum where applicable | Selecting four intake rows immediately shows total quantity and total value | visibility_gap |
| MR-012 | Generate vendor receipt from selection with preview | Intake/receiving | Current system expects receipt from selected rows, not necessarily a PO | Add `Generate receipt from selected rows`; preview vendor, date, lines, notes, and total before writing | Receipt total exactly equals selected row total; mixed vendor/date conflicts identify offending rows | output_gap |
| MR-013 | Replace one-off money quick actions with Quick Ledger grid | Logging multiple cash/crypto events | Receive/Pay buttons are useful but not fast enough for repeated ledger entry | Add a draft ledger grid at top of Payments with date, method, bucket, category, counterparty, amount, reference, notes | Operator logs five mixed entries in under 30 seconds with no modal | workflow_gap |
| MR-014 | Make negative money rows self-labeling | Down payments and buyer credits | Negative amount behavior can surprise operators | If amount is negative, immediately label row `buyer credit/down payment` and preview balance effect | Operator sees the credit label before commit; ledger and customer balance update after commit | trust_control_gap |
| MR-015 | Lock posted `Intake` and derive posted `Available` | Reviewing and adjusting stock | Current paradigm needs original intake stable and available generated from movements | Posted `Intake` is read-only; posted `Available` shows derived indicator; changes route to adjustment drafts | Editing posted intake is refused with `Use adjustment`; available adjustment creates audited reasoned change | trust_control_gap |
| MR-016 | Add row-level command history and reversal preview | Mistake recovery from the row | Recovery is command-centric, while operators notice row problems first | Add a history/reverse affordance in posted rows showing last commands, actor, diff, and reversal preview | From any posted row, operator can preview reversal impact in one click | trust_control_gap |
| MR-017 | Add plain-language KPI definitions and source drilldowns | Owner dashboard decisions | Metrics exist but must match current workbook definitions | Add formula/help and source-row drilldown for Files, Available Files, Receivables, Payables Due/Scheduled, Inventory Value | `Available Files` explains `Files on Hand - Payables Scheduled` and opens contributing rows | visibility_gap |
| MR-018 | Explain payable due vs scheduled in-row | Vendor payout review | Due and scheduled are business-critical but can blur in UI | Add `due_reason` and `scheduled_event` columns/badges | Every payable row says why it is due or when it is scheduled | visibility_gap |

## P1 Recommendations

| ID | Recommendation | Operator Moment | Current Failure | Smallest Viable Change | Acceptance Criteria | Gap Type |
| --- | --- | --- | --- | --- | --- | --- |
| MR-019 | Enable TSV paste into operational grids | Intake, sale, payment bulk entry | Single-row entry is slower than spreadsheet copy/paste | Enable AG Grid paste with validation preview and row-level errors | Pasting 50 intake rows creates 50 drafts and highlights bad cells | workflow_gap |
| MR-020 | Add fill-down for repeated values | Intake and sales entry | Operators repeat vendor/date/category/status values | Support fill handle or keyboard fill-down for selected cells | Operator fills vendor/source/category across 20 rows without retyping | workflow_gap |
| MR-021 | Preserve shorthand and normalize later | Category/source/tag entry | Strict values can block `Ins/candy` style vocabulary | Accept raw shorthand, store `raw_input`, and send unmapped values to vocabulary review | `Ins/candy` saves immediately and later maps to category/tags without rewriting history | structural_gap |
| MR-022 | Add a vocabulary review queue | Admin cleanup of raw terms | Free-text without governance becomes messy | Group unmapped categories, tags, markers, and aliases with counts/examples | Manager can approve alias mappings and see impacted rows | trust_control_gap |
| MR-023 | Split starts into `New PO` and `Receive Inventory` | Purchase planning vs. physical receiving | One Quick Start action blends two operator intents | Add two start actions with different default row states but shared audited backend where appropriate | `New PO` starts planned rows; `Receive Inventory` starts arrived/intake rows | workflow_gap |
| MR-024 | Insert new intake rows at current focus | Fast row entry near context | New rows may appear away from related rows | Add row insertion after selected row/current vendor/date group | New intake row appears where operator is working and inherits safe defaults | workflow_gap |
| MR-025 | Add arrival confirmation controls inline | Receiving product | Arrival confirmation is separate from ownership | Add compact arrival cell values: pending, arrived, canceled | Operator can mark arrived without changing ownership or raw marker | visibility_gap |
| MR-026 | Add selected-row receipt conflict handling | Vendor receipt generation | Mixed selections can silently confuse totals | Conflict panel names row/vendor/date mismatches and offers fix or explicit mixed receipt override | Mixed selections cannot post without operator acknowledging conflicts | trust_control_gap |
| MR-027 | Show price/range notes in finder and receipts | Sales pricing and vendor receipt | Notes like `25 flex` are business signals | Include price/range/notes in compact finder result and receipt line | `25 flex` is visible before adding and appears on receipt/export | visibility_gap |
| MR-028 | Add Enter-to-add behavior in finder | Keyboard sale building | Finder still depends too much on mouse clicks | Quantity input Enter adds row and moves focus to next result | Operator can add three inventory rows from finder using keyboard only | workflow_gap |
| MR-029 | Pre-scope finder with customer buying patterns | Guided selling | Suggestions exist but should be closer to the client sheet | When customer workspace opens, default finder chips/search hints use recent purchases/tags | Finder explains `Bought Candies recently` or similar reason inline | visibility_gap |
| MR-030 | Add typed payment categories to Quick Ledger | Manual money entry | Current payment flow does not fully cover referral/staff/accounting ledger cases | Add category enum and category-specific required fields in the ledger grid | Vendor, referral, staff/time, accounting cash, and crypto movement rows validate their own required fields | workflow_gap |
| MR-031 | Keep cash bucket visible on every money row | Cash/files accuracy | Office/accounting cash buckets are central to dashboard math | Every ledger row has visible bucket: office, accounting, or approved configured bucket | Dashboard drilldown groups rows by bucket | visibility_gap |
| MR-032 | Show vendor down payments on bills | Payables and inventory value | Down payments affect obligations but can disappear into notes | Vendor bill rows show original, down payments, paid, remaining, terms, due reason | Partially paid payable makes remaining balance obvious | visibility_gap |
| MR-033 | Convert manual stock edits into adjustment drafts | Inventory correction | Operators may still try to edit available directly | If posted `Available` is edited, create adjustment draft with reason and preview | Original value stays visible; adjustment command records movement and actor | trust_control_gap |
| MR-034 | Add row `Needs Fix` state with exact errors | Validation recovery | Errors can feel like command failures instead of row work | Failed validation writes plain-language row annotations and retry action | Row shows exactly what to fix, for example `Choose exact inventory row for M15` | workflow_gap |
| MR-035 | Add marker legends per surface | Interpreting raw shorthand | Raw markers are preserved but may be confusing | Add hover/focus legend that distinguishes confirmed meaning from inferred/unknown | `C` tooltip says meaning is legacy/inferred until mapped | visibility_gap |
| MR-036 | Add command palette aliases for workbook terms | Fast navigation/search | Modern terms may not match operator words | Alias `files`, `ticket`, `sub`, `ofc`, `iv`, `receipt`, `vendor receipt`, `rich`, and other terms | `Cmd+K` search finds the right surface/command using old vocabulary | workflow_gap |
| MR-037 | Persist panel layout by user and route | Making screen room | Collapse/focus helps but should remember operator setup | Store collapsed/focused/density preferences per user/route | Sales workspace layout survives reload and login | workflow_gap |
| MR-038 | Keep a compact global command strip in focus mode | Focused grid work | Hiding all global actions can make focused mode feel trapped | Replace full Quick Start with one-line command strip or command key hint while focused | Operator can start sale/payment/health without leaving focused grid | workflow_gap |
| MR-039 | Add compact density mode for all grids | Spreadsheet-like scanning | Default spacing can be slower than Numbers | Add density preference controlling row/header/toolbar heights | 500-row intake remains readable and avoids unnecessary vertical whitespace | workflow_gap |
| MR-040 | Add source-row provenance | Trusting imported and generated values | Operators need to know whether a value is imported, edited, or system-derived | Add subtle provenance indicator for imported value, operator edit, command consequence, or calculation | Hovering a derived cell explains its source | trust_control_gap |
| MR-041 | Add customer workspace exports | Sending product/order info | Current catalog/sales sheet export is not surfaced at the customer moment | Add `Send catalog` and `Internal sheet` actions to customer workspace | Customer export hides cost/margin; internal export shows margin and rule reason | output_gap |
| MR-042 | Add row-level margin/rule preview | Pricing decisions | Operators negotiate in the moment | Show cost, price, margin/spread, and pricing rule reason in internal-only sale workspace | Operator sees margin before confirming order; customer-facing output hides it | trust_control_gap |

## P2 Recommendations

| ID | Recommendation | Operator Moment | Current Failure | Smallest Viable Change | Acceptance Criteria | Gap Type |
| --- | --- | --- | --- | --- | --- | --- |
| MR-043 | Rename high-frequency `Batch` labels where operators expect `inventory row`, `item`, or `lot` | Daily scanning | Internal schema vocabulary leaks into UI | Keep backend `batch`, adjust visible labels per surface | Intake and Sales read naturally to spreadsheet operators | visibility_gap |
| MR-044 | Add saved finder slices | Repeated inventory filtering | Operators often repeat filters like Smalls, Candies, OFC, Aging | Add saved chips and command-palette aliases for common slices | One action applies a named slice | workflow_gap |
| MR-045 | Add compare-selected finder footer | Negotiating inventory | Comparing cost/price/aging/ownership requires eye movement | Footer compares selected rows side by side | Operator can compare selected lots without opening another panel | visibility_gap |
| MR-046 | Make side panels resizable with presets | Screen space control | Collapsible panels are binary | Add width presets and drag/keyboard resize for finder/support panels | Operator can set finder to narrow, standard, or wide | workflow_gap |
| MR-047 | Add owner assignment from dashboard queue | Owner daily decisions | Queues show work but may require opening lanes for assignment | Add inline assign/route action on dashboard work queue rows | Owner can route pending work from dashboard | workflow_gap |
| MR-048 | Add dashboard incomplete-data warnings | Owner trust | Unknown markers/unallocated money can distort metrics | Show warning counts linked to rows affecting each KPI | KPI with unknown ownership shows warning and opens rows | trust_control_gap |
| MR-049 | Add migration marker review surface | Import cleanup | Unknown marker vocabulary needs managed review | Table groups unknown markers with examples and suggested mappings | Manager can approve/reject mapping and preserve raw history | trust_control_gap |
| MR-050 | Add fulfillment label/manifest status inline | Warehouse closeout | Fulfillment exists but labels/manifests need row visibility | Add label status and manifest inclusion columns to fulfillment lines | Packed lines show print status and manifest status without leaving workflow | visibility_gap |
| MR-051 | Add selected-row support packet export | Recovery/support | Support packet is command/system oriented | From any row selection, export diagnostic packet for those rows and commands | Packet includes selected rows, related commands, and validation history | output_gap |
| MR-052 | Add operator training overlays only as optional help | Adoption | New structured states may confuse operators at first | Add optional per-surface help that maps old terms to new controls | Help can be toggled off and never blocks workflow | visibility_gap |

## Suggested Implementation Sequence

This is not a week-by-week plan. It is the lowest-risk order to make the UI feel right fastest.

1. Data truth layer: MR-001, MR-002, MR-003, MR-015, MR-018.
2. Sales comfort layer: MR-004, MR-005, MR-006, MR-007, MR-008, MR-009, MR-010.
3. Intake/receipt layer: MR-011, MR-012, MR-023, MR-024, MR-025, MR-026.
4. Money layer: MR-013, MR-014, MR-030, MR-031, MR-032.
5. Trust/recovery layer: MR-016, MR-034, MR-040.
6. Spreadsheet speed layer: MR-019, MR-020, MR-021, MR-027, MR-028, MR-036, MR-037, MR-038, MR-039.
7. Output and polish layer: MR-041 through MR-052.

## Done Definition For Paradigm Fit

The UI/UX pass should not be considered complete until these demonstrations pass:

1. Start a customer sale from anywhere, land in a customer workspace with first sale line focused, search inventory by a remembered string, add three lines, and confirm without a modal wizard.
2. Select four ad hoc intake rows, see live totals, generate a vendor receipt preview without a PO, and post with totals matching the selected rows.
3. Log five mixed cash/crypto/payment/payout rows in a quick ledger grid with bucket, category, counterparty, amount, and notes visible.
4. Open a vendor payable and immediately see whether it is due, scheduled, partially paid, or blocked, and why.
5. Inspect an imported row with raw markers preserved, see mapped/inferred meanings where known, and leave unknown markers raw.
6. Attempt to post an ambiguous inventory match and get a row-level Needs Fix explanation naming the candidate rows.
7. From a posted row, open command history and preview reversal impact without searching by command ID.
8. Focus the active grid/finder, collapse secondary panels, preserve the layout across reload, and keep access to global command actions.

## Non-Goals For This Pass

- Do not rebuild the Numbers workbook pixel-for-pixel.
- Do not replace the audited command bus with silent cell watching.
- Do not require formal purchase orders before ad hoc receipt generation.
- Do not normalize legacy markers before their meanings are confirmed.
- Do not add bank, card, crypto wallet, or third-party operational-data integrations.
- Do not turn high-frequency row work into modal wizards.

