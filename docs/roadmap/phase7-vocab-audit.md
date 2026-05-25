# Phase 7 Vocabulary Audit

Audit date: 2026-05-25
Auditor: search-specialist subagent (CAP-028 / Phase 7 prep)
Source tree: src/client/ (views + components), commit 88f7ba9 (HEAD of feat/phase7-prep, branched from main)
North-star reference: docs/product/north-stars.md §6 ("Familiar vocabulary. Operator words win: Files, OFC, 25 flex, Inv Posted, Pay/F-up, New PO, Receive Inventory, Buyer credit.")

---

## Summary

**29 operator-visible string violations found** across 9 files. Priority breakdown:

| Tier | Count | Action |
|------|-------|--------|
| Clearly wrong | 11 | Change in Phase 7 sweep |
| Probably wrong | 12 | Check with Evan before changing |
| Investigate | 6 | Need product input |

ERP vocabulary clusters: **invoice/Invoices** (highest frequency, 11+ occurrences), **ledger labels** (Transaction Ledger, Client Ledger, Receiving/Paying Ledger), **journal entry** (correction journal, manual journal), **Payables/Receivables** (dashboard + contact panels), **FIFO** (payment allocation UI), **Vendor Bills/Bills** (context drawer + vendor payables view).

The product already uses excellent operator vocabulary in many places — `Inv Posted`, `Pay/F-up`, `OFC`, `Buyer credit`, `Money in`, `Money out`, `Receive Inventory`, `New PO`, `Receive product`. These are the correct models.

---

## Violations Table

### Clearly Wrong (high confidence — change in Phase 7)

These terms are ERP-accounting vocabulary that an operator would not use in conversation. Replace without product confirmation.

| # | Term found | File : approx line | UI element / context | Suggested operator replacement | Confidence |
|---|------------|-------------------|----------------------|-------------------------------|------------|
| V1 | "Open customer invoices" | `DashboardView.tsx:87` | Dashboard cash summary button subtitle | "Open customer orders" or "Outstanding customer balances" | High |
| V2 | "Invoices" (section title) | `RelationshipDrawer.tsx:95` | Relationship drawer tab section heading | "Orders" or "Customer orders" | High |
| V3 | "Invoice disputes" (section title) | `RelationshipDrawer.tsx:98` | Relationship drawer tab section heading | "Disputes" | High |
| V4 | "Open Invoices" (KPI label) | `ContactProfileHeader.tsx:60` | Customer profile header KPI card label | "Open orders" or "Open balances" | High |
| V5 | "Open invoices" (summary text) | `ContactMoneyPanel.tsx:41-42` | Contact money panel sentence | "Open order balances" | High |
| V6 | "Invoices" (mini-rows title) | `ContextDrawer.tsx:445` | Context drawer customer section | "Orders" | High |
| V7 | "Invoice" (column header) | `OperationsViews.tsx:1233` | Payments / allocation table `<th>Invoice</th>` | "Order" | High |
| V8 | "Correction journal" (dropdown option) | `IssueSidecar.tsx:72` | Issue sidecar action picker `<option>` | "Ledger correction" or "Manual correction" | High |
| V9 | "Correction journal entry" (button / prose) | `OperationsViews.tsx:2408` / `2516` | Recovery admin tools button label + help text | "Manual correction" / "Use a manual correction if a ledger adjustment is needed." | High |
| V10 | "Receivables" (dashboard section label) | `DashboardView.tsx:86` | Dashboard cash summary button heading | "Money owed to us" or "Customer balances due" | High |
| V11 | "Payables due/scheduled" (dashboard section label) | `DashboardView.tsx:82` | Dashboard cash summary button heading | "Bills due / scheduled" or "Vendor payments due" | High |

### Probably Wrong (medium confidence — check with Evan)

These terms may have operator familiarity or intentional product meaning. Confirm before changing.

| # | Term found | File : approx line | UI element / context | Suggested operator replacement | Confidence |
|---|------------|-------------------|----------------------|-------------------------------|------------|
| V12 | "Client Ledger" (nav label) | `Shell.tsx:65` | Side navigation item label | "Payments" or "Client Payments" (already exists as separate nav item — dedup may be the real question) | Medium |
| V13 | "Client Ledger and Credit" (view title) | `OperationsViews.tsx:1607` | GridJourney view title h-tag | "Client Balances" or "Money In History" | Medium |
| V14 | "Transaction Ledger" (panel title) | `QuickLedgerGrid.tsx:343` | WorkspacePanel title prop | "Payment entry" or "Quick Payments" | Medium |
| V15 | "Receiving Ledger" / "Paying Ledger" | `QuickLedgerGrid.tsx:254` | Section headings inside the payment grid | "Money in" / "Money out" (matches existing nav labels) | Medium |
| V16 | "Commit ledger row" (button title / sr-only) | `QuickLedgerGrid.tsx:613-615` | Commit button tooltip and screen-reader label | "Record payment" or "Post payment" | Medium |
| V17 | "FIFO oldest open invoices" (allocation option label) | `QuickLedgerGrid.tsx:720` | Payment allocation target dropdown option | "Oldest open orders first" | Medium |
| V18 | "Open PO FIFO" (allocation option label) | `QuickLedgerGrid.tsx:424` / `745` | Payment allocation target dropdown option | "Oldest open purchase orders first" | Medium |
| V19 | "FIFO" (allocation option) | `QuickLedgerGrid.tsx:423` | Payment allocation target dropdown option | "Oldest order first" | Medium |
| V20 | "PO / FIFO / target" (column header) | `QuickLedgerGrid.tsx:301` | Quick ledger table column `<th>` | "Applied to" | Medium |
| V21 | "Vendor invoice ref…" (placeholder) | `MobilePaymentsView.tsx:468` | Mobile payment form reference field placeholder | "Vendor ref / bill #" or "Vendor reference" | Medium |
| V22 | "invoice" engine cold-start signal (panel text) | `CustomerCreditPanel.tsx:295`/`305` | Credit panel cold-start status text | "order" (e.g. "No signals yet — unavailable until orders appear" / "Orders") | Medium |
| V23 | "Invoice 30+ days overdue" (signal chip label) | `ContactProfileHeader.tsx:28` | Customer profile warning chip | "Balance 30+ days overdue" | Medium |

### Investigate (ambiguous — need product input)

These require judgment about whether the operator population uses these terms, or whether the internal/backend term is leaking into a UI surface.

| # | Term found | File : approx line | UI element / context | Question for Evan |
|---|------------|-------------------|----------------------|-------------------|
| V24 | "Invoice dispute" (dropdown option) | `IssueSidecar.tsx:73` | Issue sidecar action picker | Do operators use "dispute"? Or is it "claim" / "complaint"? Is the word "invoice" here specifically correct (the dispute is on an invoice record)? |
| V25 | "Manual journal / no target" (allocation label) | `QuickLedgerGrid.tsx:754` | Payment allocation type when no entity match | Is "manual journal" an intentional operator term for unattributed payment rows? Alternative: "No order / unattributed" |
| V26 | "Receivables (Customer)" / "Payables (Vendor)" (panel titles) | `ContactMoneyPanel.tsx:38`/`50` | Contact profile money panel WorkspacePanel titles | These use parenthetical disambiguation. Is this an acceptable hybrid or should it be "Customer Balances" / "Vendor Balances"? |
| V27 | "Vendor bills" (context drawer label, relationship drawer) | `ContextDrawer.tsx:447`, `RelationshipDrawer.tsx:102` | Mini-row section headings | "Bill" is arguably operator-adjacent (cannabis operators say "I got a bill from the lab"). Keep or replace with "Vendor invoices" → or just "Vendor payments / POs"? |
| V28 | "Vendor Payables" (GridJourney view title) | `OperationsViews.tsx:1715` | Money out view panel title | Nav label is already "Vendor Payouts" (Shell.tsx:73). This is an internal mismatch — should title match the nav label? |
| V29 | "Client credit" (dropdown option) | `IssueSidecar.tsx:75` | Issue sidecar action picker | "Buyer credit" is the established operator term (QuickLedgerGrid uses it). Should this read "Buyer credit" for consistency? |

---

## Terms to Preserve

These are operator vocabulary already used correctly and should be replicated in new views:

| Term | Where it's used correctly | Why it's right |
|------|--------------------------|----------------|
| `Inv Posted` | `SalesView.tsx:152`, `OperationsViews.tsx:87` | North-star canonical term |
| `Pay/F-up` | `SalesView.tsx:153`, `OperationsViews.tsx:88` | North-star canonical term |
| `Buyer credit` | `QuickLedgerGrid.tsx:595`, `OperationsViews.tsx:1175` | North-star canonical term |
| `Money in` / `Money out` | `Shell.tsx:95`, `CommandPalette.tsx:21` | Correct operator vocabulary |
| `New PO` | `OperationsViews.tsx:582` | North-star canonical term |
| `Receive Inventory` | `CommandPalette.tsx` action label | North-star canonical term |
| `OFC` (office ownership) | `OperationsViews.tsx:1518`, `InventoryFinderPanel.tsx:206` | Domain-specific operator code, correct |
| `Needs Fix` | Status value in `StatusPill.tsx` | Operator-facing, clear action signal |
| `Referee credit` | Throughout | Domain-specific term, correct |
| `Posted` / `Inv Posted` as status | `StatusPill.tsx`, `SalesView.tsx` | Correct in status context — operators do say "posted" |
| `Draft` / `Ready` / `Reversed` | Status values in `StatusPill.tsx` | Correct operator states |
| `Correction` (button label in Recovery) | `OperationsViews.tsx:2408` child button text | Short label acceptable; the surrounding text is the problem (see V9) |

---

## Implementation Notes

**Sweep strategy for Phase 7:**

1. **Invoice → Order / Order balance**: The highest-frequency swap. All operator-visible "invoice" strings should map to "order" when referring to a sales order, or "balance" when referring to money owed. The internal DB column (`invoiceNo`) stays untouched; only JSX text content changes.

2. **Do not change `invoiceNo` field references or data access code.** The swap is purely in user-visible strings: JSX children, `title=`, `aria-label=`, `placeholder=`, `headerName=`, `label=` props, and template literals that produce UI text.

3. **Transaction Ledger / Ledger labels**: The QuickLedgerGrid component calls itself a "ledger" throughout. The safest replacement is "payment entry" or to reuse the existing "Quick Ledger" name (which the CommandPalette already uses as "Quick Ledger"). The internal CSS class names (`.transaction-ledger-*`) are not operator-visible and need not change.

4. **Journal entry → Manual correction or Ledger correction**: The `createCorrectionJournalEntry` command name stays; only the button text and tooltip changes.

5. **FIFO labels**: These are payment-allocation-specific and appear only in the QuickLedgerGrid allocation dropdown. Replacements should clarify what "FIFO" means in plain language ("oldest order first", "oldest PO first").

6. **Receivables / Payables on Dashboard**: These are high-visibility — first thing an operator sees. Replace with plain-English summaries.

7. **Grep pattern for sweep**: `grep -rn "invoice\|ledger\|journal\|FIFO\|receivable\|payable" src/client/ --include="*.tsx" --include="*.ts" | grep -v "\.test\."` — filter results to JSX text content only.

8. **No changes needed in**: `src/server/`, `src/shared/`, DB schema files, command catalog — these are internal identifiers. The registry uses "invoice" as a data concept; that is intentional and correct.
