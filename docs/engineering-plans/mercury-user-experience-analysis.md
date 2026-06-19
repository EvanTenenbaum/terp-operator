# Mercury-Native TERP Operator — User Experience Analysis

**Date:** 2026-06-16
**Scope:** Human experience of TERP Operator retrofitted with Mercury's UX philosophy. This is not a token document. There are no pixel values, font weights, or border opacities in this file by design — those live in `mercury-design-ground-up-analysis.md` §6.
**Posture:** Opinionated. Written from the seat of a wholesale brokerage operator who has been processing orders for six hours and needs the system to help, not hinder.
**Lens:** "Would Mercury show this here?" is the test for every screen, every action, every panel.

---

## The Premise

A wholesale brokerage operator opens TERP at 8:14 AM. Today they will:

- Confirm three POs whose vendors emailed overnight
- Process four customer sales (one of them a referee deal with credit headroom concerns)
- Verify intake on two POs that arrived at the warehouse
- Investigate a posting failure that woke them at 5:30 AM
- Close the prior period before their accountant calls at 4 PM

They will do this while two phones ring, while a vendor's text message demands a counter-offer, and while a customer's photographer is asking for batch images. The screen is their cockpit. Every pixel that pulls their eye away from the task at hand is a small theft.

Mercury banking has decided, ruthlessly, that the operator's attention is sacred. TERP currently has decided, generously, that everything is helpful. This document is the trade-off audit.

---

## Part 1 — User Experience Audit

### Workflow 1: Creating a Purchase Order

#### Step 1: Operator arrives at PurchaseOrders

**Current TERP (what the operator sees on arrival):**

The PurchaseOrdersView opens with the PO grid, but it is not alone. A PO authoring workspace is already present in the layout. A VendorContextPanel is already on screen, even though no vendor has been selected. A selected-PO lines grid is shown if any PO is selected. A ReceiptPanel is visible. The operator's eye has to find the PO grid among four competing panels.

The operator did not ask to author a PO. They came to look at the list. The system has pre-staged a workflow they may not need.

**Retrofitted (Mercury-style):**

A single PO table. A filter toolbar above it. A single line of metrics ("15 POs · $124,500 · Draft 4 · Ordered 3 · Received 6 · Finalized 2"). That's it. The same surface Mercury shows for transactions: filters, summary line, table.

The operator scans the table and sees what they came to see.

**Friction in current state:** The operator's first interaction every time they enter this view is a small act of visual triage — finding the grid in a crowded layout. It costs a beat. After six hours, those beats accumulate into fatigue.

**Mercury equivalent:** Mercury's transactions page is the transactions table. There is no transaction authoring workspace pre-staged. The operator opens transactions and sees transactions.

**Score (current): 4/10.** The view is task-mixed by default.
**Score (retrofitted): 9/10.** The view is purposeful — list mode is the default; authoring is opted into.

---

#### Step 2: Operator clicks "+ New PO"

**Current TERP:** The authoring workspace was already there. The operator just shifts attention to it. Vendor context panel populates as they select a vendor. Lines grid begins accepting rows. All possible actions are visible — including actions that don't apply to a draft yet (e.g., `Receive`, `Draft Intake`, `Unfinalize`).

The cognitive load: "Which of these buttons do I need now? Which apply when?" Operators learn this over time, but the system isn't helping. The visual real estate is filled with buttons that do not apply to a draft PO.

**Retrofitted:** A slide-over panel opens from the right with: vendor selector, expected date, terms, notes, and an inline editable lines grid. Two actions only: `Save Draft` and `Approve & Finalize`. No `Receive`. No `Draft Intake`. No `Unfinalize`. Those actions don't exist for a PO that hasn't been ordered yet.

**Mercury equivalent:** When you start a new transfer in Mercury, you see only the fields and the action that applies to a new transfer — `Send`. You don't see `Cancel transfer` (no transfer exists yet), `Reverse transfer` (it hasn't happened), or `Reconcile` (irrelevant). Action surface follows entity state.

**Friction in current state:** Operators have to mentally state-gate the action buttons. Anyone newer than three months will hesitate at button choice on every PO they create.

**Score (current): 5/10.** The form is there, but it's wrapped in chrome that includes actions for future states.
**Score (retrofitted): 9/10.** The form is the form. The actions are the two that exist for a draft.

---

#### Step 3: Operator needs to check the vendor's open AP balance before finalizing

**Current TERP:** The VendorContextPanel is to the right of the authoring workspace. Open AP is visible. So is prior PO history, market signals, terms. All of it, all the time. Even when the operator just wants to know one thing.

This sounds like an upside — context is always there. But it's there even when the operator doesn't need it. It eats screen real estate. The lines grid is narrower because the vendor pane is permanent. Typing line item details happens in a column-cramped surface.

**Retrofitted:** The slide-over has a tab — `Vendor`. One click. Open AP, terms, prior POs, market signals all live there. When the operator doesn't need them, the lines grid uses the full slide-over width.

**Mercury equivalent:** Mercury's transaction detail panel shows transaction data. To see the account that the transaction touched in detail, you click the account name. The account view opens. One click to context, zero clicks of attention tax when you don't want it.

**Friction in current state:** Every PO authoring session pays a tax — narrower grid, vendor context occupying mental real estate even when the operator is heads-down adding lines. The data is "free" in that it's visible, but the attention cost is recurring.

**Score (current): 6/10.** Information is available but is also unavoidable.
**Score (retrofitted): 9/10.** Information is one click away, and the click is cheap (the slide-over is already open).

**One opinionated note:** The retrofit's plan to make Vendor a tab in the slide-over is correct, but the access cost matrix in `mercury-design-ground-up-analysis.md` §3 flags that "Quick Add from vendor history" should not be buried inside the Vendor tab. When an operator is building lines, the most natural Quick Add affordance is a row-level "from this vendor" picker on the lines grid itself, not a 2-click trip through the Vendor tab. The retrofit should surface Quick Add at the row level.

---

#### Step 4: Operator finalizes the PO, then what?

**Current TERP:** After clicking `Approve & Finalize`, a toast confirms. The authoring workspace stays present. Vendor context still there. Lines grid still there. The operator is sitting inside an authoring view for a PO that no longer needs authoring. They have to navigate back to "list mode" — which they do by clearing the workspace or selecting a different action.

There is no clear "you finished this; here's the next thing" moment. The system does not guide.

**Retrofitted:** After `Approve & Finalize`, the slide-over transitions from authoring state to detail state. Same panel, now showing the finalized PO with tabs: `Lines | Vendor | History`. The actions shown are now the ones valid for an Ordered PO (`Draft Intake`, `Record Prepayment`, `Cancel`). The operator can close the slide-over to return to the list, where the new PO is now visible at the top.

**Mercury equivalent:** After sending a transfer in Mercury, the transfer detail panel opens showing the sent transfer. You see your action persisted. Closing returns you to the transactions list. The system has confirmed without congratulating.

**Friction in current state:** Operators have to manually navigate themselves back to the next task. The system doesn't recognize task completion.

**Score (current): 5/10.** The save works, but the post-save state is undirected.
**Score (retrofitted): 9/10.** Save → state transition → next natural action is one click (close panel, pick next PO).

---

#### Workflow 1 Summary

| Question | Current TERP | Retrofitted |
|---|---|---|
| First impression | "Where do I look?" | "Here is the list. What do I want to filter by?" |
| Flow naturalness | Mode-mixed (list and authoring share real estate) | Mode-separated (list is list; authoring is a slide-over) |
| Contextual relevance | Receive/Draft Intake actions visible on a draft | Only valid actions visible per state |
| Overwhelm check | 4+ panels visible at default | 3 elements above the table, slide-over only when invoked |
| Efficiency | ~7-9 clicks to create + verify a PO; many "where do I click" pauses | ~5-7 clicks, none of them ambiguous |
| Guidance | None on what to do next | Slide-over transitions to detail state, signaling completion |
| Lost prevention | Easy — vendor context always there | Operator never loses the PO; the slide-over keeps state |
| **Net score (current): 5/10. Retrofitted: 9/10. Gap: −4.** | | |

---

### Workflow 2: Processing a Sale (the hardest view in TERP)

#### Step 1: Operator arrives at SalesView

**Current TERP (what they actually see on arrival):**

Six grids. Three to the left (Orders, Draft Lines, Suggestions). One workspace to the right (Sale Builder with customer info, credit display, pre-post strip). A Customer Purchase History panel on the right side. A Photography Queue panel below it. A SalesSourcePane (Inventory Finder) docked to the left.

That is **eight surfaces** for a single workflow, plus the ContextDrawer in some states.

A new operator on day one sees this and freezes. A six-hour-into-the-day operator sees this and chooses to look at the one panel they're heads-down on, ignoring everything else. The system has prepared infrastructure for every possible thing the operator might want, and in doing so has buried the thing they actually want.

**Mercury equivalent:** Mercury doesn't have a "sales view." But Mercury's send-money workflow is one slide-over with: recipient, amount, account, memo. The peripheral information (sender's balance, recent transfers to this recipient) lives outside that slide-over until you ask for it.

**Score (current): 2/10.** This is the worst experience in TERP. Operators succeed in spite of the layout, not because of it.
**Score (retrofitted): 8/10.** Still complex because sales is genuinely complex, but the complexity is sequenced, not stacked.

---

#### Step 2: Operator selects a customer

**Current TERP:** The Sale Builder workspace populates with customer info. Credit display lights up. Pre-post strip updates. Customer Purchase History panel shows their history. Photography Queue shows their pending photo assignments. The Draft Lines grid clears. The Smart Suggestions grid populates with recommendations.

That is **six panels updating simultaneously** in response to one customer selection. The operator's eye has to figure out which of those changes is the one they need to act on. Most of the time, none of them are — the operator just wanted to start adding lines.

**Retrofitted:** The customer selection appears as a context header above the lines grid. Customer name, balance, credit status, tags. The orders table transitions to a draft-lines grid. The tab strip switches from `All Orders | Draft | Confirmed | Posted` to `Lines | Suggestions`. Everything else — history, photography — is one click away in the customer slide-over.

**Mercury equivalent:** When you pick an account to transfer from, the account name + balance shows above the form. You don't get the account's transaction history, statement preview, and metadata all at once. You get the one fact that matters: "you have $X in this account." Anything else, you ask for.

**Friction in current state:** The customer selection moment is supposed to feel like progress ("good, I have my customer"). Instead it feels like an information dump. Operators learn to ignore most of the changes that fire.

**Score (current): 3/10.** Too much updates at once; signal lost in noise.
**Score (retrofitted): 9/10.** One context header, one grid transition. Operator knows: "I'm building this customer's sale."

---

#### Step 3: Operator adds lines from inventory

**Current TERP:** The SalesSourcePane (Inventory Finder) is docked to the left of the lines grid. Operator scrolls through inventory, drags or clicks items into the draft lines grid. The Finder is always there — even when the operator is reviewing existing lines they've already added.

The Finder competes with the lines grid for horizontal space. Both surfaces are cramped.

**Retrofitted:** The lines grid uses full width by default. When the operator clicks `Add line`, the Inventory Finder opens as a slide-over from the right. The operator picks a batch, the line is added, the Finder stays open (because operators add multiple lines in sequence). When done adding, close the slide-over.

This is a subtle but important UX gain: the lines grid is at its full readable width while the operator is reviewing what they've built. The Finder only steals real estate during the active "add" task.

**Mercury equivalent:** Mercury's category picker for transactions is an inline combobox. When you're editing a category, the picker is at the cell. When you're not, the cell shows the category. The picker doesn't occupy permanent real estate.

The Inventory Finder is a different beast — it's a search interface, not a single picker. So slide-over is appropriate. The Mercury principle is: "tools live in the moment they're needed."

**Friction in current state:** Lines grid is narrower than it should be, all the time, because the Finder is always present.

**Score (current): 5/10.** The Finder works but extracts a permanent layout tax.
**Score (retrofitted): 8/10.** Finder lives in the moment of adding. Slight increase in "where did I put my customer header" risk during long adds, but the operator's eye has muscle memory after the first day.

---

#### Step 4: Pre-post validation flags an issue

**Current TERP:** The pre-post validation panel is visible (always or conditionally — it depends on the variant). When an issue exists, the issue is in that panel. When no issue exists, the panel is still there, showing "All checks passed" or similar.

The signal-to-attention ratio is bad: the panel takes screen real estate to tell you nothing 90% of the time.

**Retrofitted:** When validation issues exist, an inline warning strip appears above the lines grid. The strip shows the issue and offers a fix link. When no issues exist, no strip. The grid uses the full vertical space.

**Mercury equivalent:** When you try to send more money than your account has, Mercury shows an inline error at the amount field. When no error, no error display. The form is the form.

**Friction in current state:** A permanent "everything's fine" panel is noise. The operator's eye habituates and stops checking the panel — which means when an actual issue appears, they may miss it.

**Score (current): 4/10.** Permanent validation surface = noise + habituation risk.
**Score (retrofitted): 9/10.** Issues appear at the point of impact. No issues = no surface.

---

#### Step 5: Operator wants to see the customer's purchase history mid-sale

**Current TERP:** It's right there. Customer Purchase History panel on the right. Already populated. 0 clicks.

This is a real upside of the current design. The retrofit increases this from 0 clicks to a click. Is that worth it?

**Retrofitted (current plan):** Click customer name → customer slide-over opens → click `Purchase History` tab. 2 clicks.

**Retrofitted (recommended):** Click customer name → customer slide-over opens with `Purchase History` as the default tab. 1 click.

The recommendation is documented in `mercury-design-ground-up-analysis.md` §3.1 as a "revert" — the retrofit went one click too deep. Mercury's account detail defaults to the history tab; TERP should match.

**Mercury equivalent:** Click an account → account detail opens with transactions list as the default tab. The most-wanted view of an account IS the transactions list. The most-wanted view of a customer IS their purchase history. The default tab should match the most-wanted view.

**Friction:** Going from 0 clicks to 2 clicks is a real loss for an operator who references purchase history often. Going from 0 clicks to 1 click is acceptable — the screen real estate gain compensates.

**Score (current): 7/10.** Information is free but is permanent overhead.
**Score (retrofitted with default tab fix): 8/10.** One click for the most-wanted reference, in exchange for a much cleaner main view.

---

#### Step 6: Operator confirms the sale

**Current TERP:** Operator clicks `Confirm`. Toast confirms. The Sale Builder workspace stays put. The Draft Lines grid clears (or persists, depending on variant). The Orders grid updates to show the new confirmed order. The Customer Purchase History panel updates to include this sale.

The operator is now sitting in a workspace for a sale that's done. They have to navigate themselves to "list mode" or to the next customer.

**Retrofitted:** `Confirm` action. The lines grid transitions back to the orders table. The new confirmed order is highlighted at the top. Customer context header dismisses. Slide-over closes if it was open. Operator is back in the "I am looking at sales orders" mode, ready for the next sale.

**Mercury equivalent:** After sending a transfer, you land back in the transactions list with your new transfer at the top, slightly highlighted. The page tells you "your last action was this," then dismisses the emphasis as you look elsewhere.

**Friction in current state:** Sale completion has no transition. Operators have to manually shake off the previous sale before starting the next one.

**Score (current): 4/10.** No completion transition; sales bleed into each other.
**Score (retrofitted): 9/10.** Confirm → grid transition → next sale.

---

#### Workflow 2 Summary

| Question | Current TERP | Retrofitted |
|---|---|---|
| First impression | "I count 8 panels. Where do I start?" | "Here is the orders table. New sale via [+] or by picking a customer." |
| Flow naturalness | Customer selection fires 6 simultaneous updates | Customer selection updates a context header and switches tabs |
| Contextual relevance | All possible context always shown | Context one click away, surfaced where it matters |
| Overwhelm check | This is the most overwhelming view in TERP | One primary surface; rest tab/slide-over |
| Efficiency | Many clicks lost to "did I update this?" reorientation | Linear: pick customer → add lines → resolve issues → confirm |
| Guidance | None on next sale | Confirm transitions back to list with new order highlighted |
| Lost prevention | Easy to lose track of which panel is "current" | Context header + slide-over tabs maintain state visually |
| **Net score (current): 3/10. Retrofitted: 8/10. Gap: −5.** | | |

This is the workflow that benefits most from the retrofit. It's also the hardest to migrate correctly (the retrofit plan flags SalesView as Phase 3A "HARD GATE").

---

### Workflow 3: Intake Verification

#### Step 1: Operator opens Intake

**Current TERP:** Master grid (POs awaiting intake) + detail grid (batches per PO, expanded inline). A totals strip at the bottom shows selected counts. A ReceiptPreviewDrawer is available via a button.

This is the only view in TERP that already feels close to Mercury. Master/detail is a real pattern; the inline expansion is appropriate; the totals strip is contextual.

**Mercury equivalent:** Mercury doesn't have master/detail tables (transactions are flat). But Mercury would not object to TERP's choice here — intake genuinely has hierarchical structure (PO → batches), and expansion is a valid progressive disclosure pattern. This is a case where TERP is operating in a richer domain than banking and the master/detail pattern is justified.

**Friction in current state:** Minimal. This view works.

**Score (current): 7/10.** Already close to Mercury's philosophy.
**Score (retrofitted): 9/10.** Filter toolbar + KPI line added on top; ReceiptPreview moves to slide-over; small cleanup wins.

---

#### Step 2: Operator expands a PO and verifies batches inline

**Current TERP:** The detail grid shows each batch with editable columns (actual qty, reason, status). BatchRowActions appear inline per row (Verify, Reject, Note). The operator works through batches in place.

This is great. It's the closest TERP gets to Mercury's "edit at the cell" philosophy. The operator never leaves the master/detail to verify; the actions are where the data is.

**Mercury equivalent:** Mercury edits transaction categories at the cell, with an inline combobox. TERP edits batch verification at the row, with inline actions. Same principle: action lives at the data.

**Friction:** Some of the cell editors are clunky (numeric typing, missing affordances). The retrofit plan introduces ComboboxCellEditor with immediate save and a Clear button, which will sharpen this further.

**Score (current): 8/10.** Strong pattern.
**Score (retrofitted): 9/10.** Marginal gain from better editors.

---

#### Step 3: Operator bulk-verifies multiple batches

**Current TERP:** Selection model + totals strip + StatusActionBar with bulk verify. The operator selects rows, sees the count, clicks `Verify All`.

This works. The selection feedback is immediate.

**Retrofitted:** Same flow, with the StatusActionBar replaced by a BulkActionBar that's slightly more visible (sticky to viewport bottom rather than inline). The decision-table logic for which bulk actions are valid stays.

**Mercury equivalent:** Mercury's bulk selection in transactions: select rows → selection bar appears with count + total + actions. TERP's bulk bar is functionally equivalent.

**Score (current): 7/10.** Functional.
**Score (retrofitted): 8/10.** Sticky positioning improves visibility during long-list scans.

---

#### Step 4: Operator rejects a batch with a note

**Current TERP:** Inline reject action prompts for a note (modal or inline editor depending on variant). Operator enters note, confirms.

This is fine. Note entry is a brief interruption that fits the task.

**Retrofitted:** Inline reject opens a small popover for the note (not a slide-over — too heavy for a sentence). Same friction profile.

**Score (current): 7/10. Retrofitted: 8/10.**

---

#### Workflow 3 Summary

| Question | Current TERP | Retrofitted |
|---|---|---|
| First impression | "Here are POs waiting for me." | Same. |
| Flow naturalness | Master/detail expansion is natural | Same. |
| Contextual relevance | Actions are at the batch row, where they belong | Same, with cleaner cell editing |
| Overwhelm check | Slightly: totals strip is always there | KPI line replaces totals strip when nothing selected |
| Efficiency | Strong — verify in place, no mode switches | Marginally better |
| Guidance | After verify, return to list naturally | Same |
| Lost prevention | Expansion preserves which PO you were in | Same |
| **Net score (current): 7/10. Retrofitted: 9/10. Gap: −2.** | | |

This is the easiest migration. The retrofit should preserve everything that works here.

---

### Workflow 4: Dashboard → Action (the Morning Ritual)

#### Step 1: Operator opens TERP at 8:14 AM

**Current TERP:** Dashboard with 8 stacked WorkspacePanels: KPI tiles, Today Focus, Pending Queues, My Open Work, Credit Watch, Your Drafts, Recent Activity, Cash Buckets.

The operator's eye has to land somewhere. Eight equally-weighted panels means the eye lands nowhere in particular. The operator has to choose where to start, which is its own small decision tax.

This is the morning ritual. It happens every day. Across a year, that decision tax accumulates into "I hate opening this app." The morning experience shapes the operator's relationship with the system.

**Mercury equivalent:** Mercury's dashboard is: welcome line, five quick action buttons, ONE big balance card, and a recent activity table. Four elements. The eye lands on the balance card. The operator knows their position. They pick a quick action or scroll into the activity table. Their day starts.

**Retrofitted:** Welcome + Quick Actions, then a 4-card KPI strip, then a two-column Focus + Pending Queues layout, then a unified Activity Feed. Three sections instead of eight panels.

This is still richer than Mercury — but appropriately so. TERP operators have more dimensions than bank customers (drafts to resume, queues to clear, credit to watch, balances to consider). The four-section layout buys the same "I know where I am" feeling.

**Friction in current state:** Decision paralysis on every morning open. The eye doesn't know where to land.
**Friction in retrofit:** Slightly muted; the KPI strip gives the eye a default landing zone.

**Score (current): 4/10.** Too many panels, no anchor.
**Score (retrofitted): 8/10.** Anchored, scannable, still rich enough for the domain.

---

#### Step 2: Operator sees a count on "Pending Queue: Intake Ready (8)" and clicks

**Current TERP:** Click takes them to IntakeView, possibly with a filter applied. The dashboard's "8" badge informed them, but the filter on the destination view may or may not match — there's no guarantee that "the 8 from the dashboard" equals "the 8 shown in the filtered view" because the filter encoding isn't always tight.

**Retrofitted:** Click on a queue item is a guaranteed deep link with the exact filter applied. The destination shows exactly the 8 items the operator clicked. No ambiguity.

**Mercury equivalent:** Mercury's sidebar bookmarks show counts (e.g., "Inbox: 3"). Clicking the bookmark opens that filtered inbox. The count and the destination always match.

**Friction in current state:** Operators learn to distrust dashboard counts because they don't always match. They re-filter on the destination view. The dashboard becomes "an indicator I might check, but I trust the view itself."

**Score (current): 5/10.** Counts exist but trust is variable.
**Score (retrofitted): 9/10.** Deep links are tight; counts are honest.

---

#### Step 3: Operator processes the queue, then returns to dashboard

**Current TERP:** No explicit "return to dashboard" gesture. Operator clicks Dashboard in the sidebar. The dashboard reloads with updated counts. The operator scans again, picks the next queue.

**Retrofitted:** Same flow. The sidebar carries dashboard nav with active state. Click → return → updated counts → next queue.

**Friction:** Minimal in either state. The morning ritual is "open dashboard → pick queue → work it → return → pick next." Both designs support this.

**Score (current): 7/10. Retrofitted: 9/10.** Retrofit benefits from sidebar carrying ambient context (balances, counts) so the operator doesn't even need to return to the dashboard to see if a queue cleared.

---

#### Workflow 4 Summary

| Question | Current TERP | Retrofitted |
|---|---|---|
| First impression | "8 panels. Pick one." | "KPIs. Quick actions. Focus + queues." |
| Flow naturalness | Decision tax on every open | Anchored landing |
| Contextual relevance | All panels always shown regardless of operator role | KPIs adapt to role; Credit Watch hidden for non-managers |
| Overwhelm check | High at first arrival, habituated over months | Low; readable in 3 seconds |
| Efficiency | Same number of clicks once the operator has memorized layout | Slightly fewer; sidebar carries context |
| Guidance | None — it's a panel grid | Quick actions advertise the day's likely tasks |
| Lost prevention | Dashboard is "home base" but feels noisy | Dashboard is launchpad; sidebar is home |
| **Net score (current): 5/10. Retrofitted: 8/10. Gap: −3.** | | |

The dashboard is the operator's daily first impression. The retrofit's value here is disproportionate to the LOC changed.

---

### Workflow 5: Error Recovery (the 5:30 AM Wake-Up)

#### Step 1: Operator gets a notification at 5:30 AM that a posting failed

They open TERP. They navigate to Recovery.

**Current TERP:** RecoveryView shows: an Action Log grid (the list of commands and their statuses) + an Admin tools panel with Backup/Correction/Find & Replace tabs + a Command Reversal panel.

That's three surfaces competing. The operator opens this view at 5:30 AM, half-awake, and has to figure out which surface is the one they need. The natural starting point is "show me the failure" — which is in the Action Log. But the eye is pulled toward Admin tools because they're in the upper right (or wherever the variant places them).

**Retrofitted:** A filter toolbar (filtered to `status = failed` by default if the user landed here via a failure notification), the action log table, and bulk action options. Admin tools live in a slide-over or settings sub-tab.

The Recovery view IS the action log when there are failures. Admin tools are a power user destination, not a first-impression surface.

**Mercury equivalent:** Mercury's failed payments live in the transactions table with `status = failed` filtered. There is no separate "recovery" page; recovery is a status filter on the primary table. TERP needs more (it has true admin tools), but the principle "the failure list is the primary surface" should hold.

**Friction in current state:** Operators have to filter the admin tools out of their attention to find the failure. At 5:30 AM, that's hard.

**Score (current): 4/10.** Three competing surfaces; failure is not foregrounded.
**Score (retrofitted): 9/10.** Failures are the page; admin tools are accessible but not foregrounded.

---

#### Step 2: Operator clicks on the failed command to investigate

**Current TERP:** Row click opens a Command Reversal panel (or inline expansion, depending on variant). Shows the command type, inputs, error message, retry option, reversal option.

**Retrofitted:** Row click opens a slide-over with: command summary in the header, tabs for `Details | History | Logs`, actions for `Retry`, `Reverse`, `Mark Resolved`. Inline retry is also available as a row-level action so the operator never has to open the slide-over for the common case.

**Mercury equivalent:** Failed transaction row click opens a detail panel with the failure reason, the related account, and a `Retry` action.

**Friction in current state:** Investigating a failure requires knowing which surface (panel vs reversal panel vs admin tools) holds the action you want.
**Friction in retrofit:** Light. Click the row, see the detail, retry from the panel or from the row.

**Score (current): 5/10. Retrofitted: 9/10.**

---

#### Step 3: Operator retries, gets feedback

**Current TERP:** Click `Retry`. Toast confirms attempt. Action log row updates to "pending" then to "ok" or "failed." Operator watches the row.

**Retrofitted:** Same flow. Toast confirms. Row status updates inline. If the retry fails again, the row's error context updates. Operator can chain retries from the row.

**Mercury equivalent:** Retry a failed payment. Status updates inline. No mode switch.

**Score (current): 7/10. Retrofitted: 8/10.** Retrofit makes the row-level retry slightly more visible (per the access cost matrix tiebreaker).

---

#### Workflow 5 Summary

| Question | Current TERP | Retrofitted |
|---|---|---|
| First impression | "Three surfaces. Where's the failure I'm looking for?" | "Here are the failures. Pick one." |
| Flow naturalness | Investigate-then-retry requires hunting | Click row → see details → retry |
| Contextual relevance | Admin tools shown even when you just want to retry | Admin tools in slide-over; row retry is foregrounded |
| Overwhelm check | High at 5:30 AM | Low |
| Efficiency | More clicks lost to surface-hunting | Faster |
| Guidance | None — it's a power-user view | Filter defaults to `failed` when entering via notification |
| Lost prevention | Easy to lose which command you were investigating | Slide-over preserves state |
| Does it feel like a safety net? | Feels like an interrogation room | Feels like a safety net |
| **Net score (current): 5/10. Retrofitted: 9/10. Gap: −4.** | | |

The "safety net vs punishment" question matters more than it seems. Recovery is the view operators land in when something has gone wrong, often late at night. The visual posture of this view shapes the operator's emotional relationship with the system. The retrofit, with its calm filter-toolbar-plus-table layout, treats recovery as a normal task. The current design treats it as a power-user expedition.

---

### Workflow 6: Mid-Flow Context Switch (the most important UX test)

This workflow isn't a step-by-step. It's a question: **can the operator answer a question without losing their place?**

**Scenario:** Operator is mid-PO (Workflow 1). They have the slide-over open with the PO in authoring mode. Their phone buzzes — a vendor texted asking about another PO from last week. The operator needs to look up that PO without losing their current draft.

**Current TERP:** Two options:
1. Navigate away to find the other PO. The current draft is held in URL/local state and may or may not be restorable. Often is. Sometimes isn't.
2. Open a new browser tab.

Both options have failure modes. Option 1 risks losing draft state if the operator forgets to save. Option 2 splits attention across tabs and requires URL knowledge to deep-link.

**Retrofitted:** The slide-over is anchored to a URL (e.g., `/purchase-orders/po/draft-1234`). The PO list is in the main view. Operator presses Escape or clicks elsewhere to close the slide-over without dismissing the draft (it's saved as draft automatically or via explicit save). They use the main filter or search to find the prior PO. They click that row to open it in the slide-over. They reference it. They close the slide-over. They return to their draft by clicking the draft row again. The slide-over reopens with the draft state preserved.

The URL is the source of truth (Rule 11 in the ground-up analysis). Bookmarks, browser back, share links — all work.

**Mercury equivalent:** Mercury's transactions page: open a transaction detail in the slide-over, close it, search for another transaction, open it, close it, return to the first via browser back or by re-clicking. State preserved. No drift. No "did I lose my work?"

**Friction in current state:** Operators learn defensive habits — save constantly, mistrust the back button, keep a notepad of "the PO I was on." That mistrust is a quiet tax.
**Friction in retrofit:** Minimal. The system promises to hold state via URL, and it does.

**Score (current): 4/10.** Context switches are fragile.
**Score (retrofitted): 9/10.** Context switches are safe.

This workflow is the deepest test of the retrofit's value. Almost every operator workflow includes at least one mid-flow lookup. Making that lookup safe is the biggest invisible win.

---

### Workflow 7: Period Closeout (the Month-End Ritual)

**Scenario:** Operator at 4 PM on the last business day of the month. The accountant is waiting. Closeout must succeed.

**Current TERP CloseoutView:** Control band (period selector, lock button, archive button, adjustment button) + Adjustment panel + Archive runs table + Blocker drilldown.

Four surfaces. Each is appropriate for closeout. But the visual weight is balanced across them, which means the operator has to actively triage what to look at first.

**Retrofitted:** A compact period header (period, status badge, primary `Lock Period` action). A control totals strip. An expandable blockers section ("3 unsafe batches → View in Intake"). An archive runs table below.

The order of attention is enforced visually: header → totals → blockers → archive. The operator works top-down.

**Mercury equivalent:** Mercury's closeout is closer to its statement export. The statement view is: period selector, account selector, export button. Mercury's closeout is simpler because banking has fewer dimensions, but the principle holds: the user should know what to do at the top of the page, and the page should walk them through downward.

**Friction in current state:** The four panels imply they're all equally important. The operator has to know from experience that blockers > totals > archive runs in priority.
**Friction in retrofit:** Low. Top-down attention flow.

**Critical UX point:** Closeout failures are high-stakes. The blocker drilldown should be the most prominent surface when blockers exist. The retrofit's expandable section pattern with deep links into intake/settings ("View in Intake") is exactly right — it gives the operator a one-click escape to fix the blocker and return.

**Score (current): 5/10.** Functional but flat — no visual hierarchy.
**Score (retrofitted): 8/10.** Hierarchical, but closeout is genuinely complex; can't be fully calmed.

---

### Workflow 8: Credit Review (the Manager Oversight Loop)

**Scenario:** Manager opens TERP to review credit positions across customers.

**Current TERP CreditReviewView:** Table + filter preset strip (Stale Manual | Engine Disabled | Near Snooze Cap) + owner-only divergence panel always visible for owners.

The owner divergence panel is a tax for non-owners — it's hidden, but for owners it's always there even when they're scanning the credit list rather than reviewing divergences.

**Retrofitted:** Table + filter toolbar with tabs as filter pills. Slide-over for customer detail. Owner divergence panel collapses to a toggle (per the wireframe plan).

**Mercury equivalent:** Mercury's account oversight is a list of accounts with balance status. Detail per account is one click. No "manager-only panel" cluttering the manager's main view.

**Friction in current state:** The owner divergence panel turns the credit review page into an "I am an owner" page, even when the owner is just scanning. The role is overemphasized in layout.
**Friction in retrofit:** Light. Toggle reveals divergence info when wanted.

**Score (current): 6/10. Retrofitted: 8/10.**

---

### Audit Summary Table

| Workflow | Current Score | Retrofitted Score | Gap |
|---|---|---|---|
| 1. Create PO | 5/10 | 9/10 | −4 |
| 2. Process Sale | 3/10 | 8/10 | −5 |
| 3. Intake Verification | 7/10 | 9/10 | −2 |
| 4. Dashboard Morning Ritual | 5/10 | 8/10 | −3 |
| 5. Error Recovery | 5/10 | 9/10 | −4 |
| 6. Mid-Flow Context Switch | 4/10 | 9/10 | −5 |
| 7. Period Closeout | 5/10 | 8/10 | −3 |
| 8. Credit Review | 6/10 | 8/10 | −2 |
| **Mean** | **5.0** | **8.5** | **−3.5** |

The retrofit's value is not in any single workflow. It's in the cumulative restoration of operator attention across every workflow, every day, for years. A 5.0 → 8.5 gap means the operator who currently sighs when opening SalesView will instead just open it.

---

## Part 2 — Contextual Action Rules

These are derived from Mercury's UX behavior and adapted for TERP's operator domain. They govern WHEN to show actions and information. They are UX rules, not visual design rules. They have nothing to do with tokens.

### Rule UX-1: Action visibility follows entity state

**Statement:** An action button is visible if and only if it can be successfully executed against the current entity in its current state.

**Mercury parallel:** A draft transfer in Mercury shows `Send`, `Save as draft`, `Discard`. It does not show `Cancel` (it isn't sent), `Reverse` (it hasn't happened), or `Reconcile` (irrelevant). Action surface = state.

**TERP application:** A draft PO shows `Save Draft`, `Approve & Finalize`, `Discard`. It does not show `Draft Intake`, `Receive`, `Unfinalize`, `Cancel Order` (those apply to later states). The decision-table logic in `StatusActionTable` already encodes this; the rule is to honor it in BulkActionBar and in slide-over action slots, not to flatten it.

**Anti-pattern flagged in current TERP:** The PO authoring workspace shows a constant ribbon of action buttons whose enablement varies. Operators have to read each button's state. Hide the buttons that don't apply; don't disable them.

---

### Rule UX-2: Supporting information lives one click away, never zero, except for state the operator must monitor continuously

**Statement:** Pre-emptive context (vendor history, customer credit, prior POs, market signals, photography queue) lives behind a tab or a row click. Continuous-monitoring context (current customer name when building their sale, validation errors during the moment they apply) is allowed in a context header or inline strip.

**Mercury parallel:** Account balance lives in the sidebar (continuous monitoring). Account transaction history lives in the account detail (one click away). Recipient bank details live in the transfer history (one click away). The screen is not pre-filled with everything you might want to know.

**TERP application:**
- Customer balance + credit during a sale → continuous-monitoring → context header.
- Customer purchase history during a sale → reference → one click (customer slide-over, History default tab).
- Vendor terms during PO authoring → reference → one click (slide-over Vendor tab).
- Pre-post validation issues → only when issues exist → inline warning strip.

**Anti-pattern flagged in current TERP:** The Customer Purchase History panel is permanent during SalesView. This makes it free but also unavoidable. The exchange is wrong — operators only need it during specific sub-moments of a sale (price negotiation, repeat-order detection), not continuously.

---

### Rule UX-3: One primary surface per view

**Statement:** Each view has one main surface — the surface the operator came to interact with. Supplementary surfaces are tabs, collapsible sections, or slide-overs. They never split horizontal screen real estate with the primary surface by default.

**Mercury parallel:** Transactions page = the transactions table. Detail panel slides over; tabs in the detail panel show related info; bulk action bar appears on selection. Never two equal-weight grids side by side.

**TERP application:** SalesView's primary surface is either the orders table (no customer selected) or the draft lines grid (customer selected). Suggestions become a tab on the lines view, not a co-equal grid.

**Anti-pattern flagged in current TERP:** SalesView shows 6 grids/panels simultaneously. None of them is unambiguously primary. The operator has to choose which to look at.

---

### Rule UX-4: Bulk actions appear only on selection

**Statement:** A bulk action bar is absent when no rows are selected. When selection happens, the bar appears with count, total, and only the actions valid for that selection (per the decision table). The bar disappears on deselection.

**Mercury parallel:** Mercury's transaction selection bar slides up from the bottom on first selection. It vanishes on full deselect.

**TERP application:** The retrofit's BulkActionBar already implements this. The rule is to ensure no view falls back to "always-visible" patterns.

**Anti-pattern flagged in current TERP:** The IntakeView's totals strip is always visible regardless of selection state. It should appear only on selection.

---

### Rule UX-5: Validation errors and warnings appear at the point of impact, never in a dedicated panel

**Statement:** A field-level error appears at the field. A line-level error appears at the line row. A sale-level error appears as an inline warning strip above the lines grid. There is no "Validation Issues" panel that sits permanently on the page.

**Mercury parallel:** "Insufficient funds" appears at the amount field. "Recipient not verified" appears at the recipient field. There is no validation status panel.

**TERP application:**
- Below-floor price → inline cell highlight on the price column, with the reason editor inline.
- Customer credit exceeded → context header turns to warning state with the specific deficit.
- Pre-post issues → inline warning strip above the lines grid, visible only when issues exist.

**Anti-pattern flagged in current TERP:** A permanent pre-post validation panel that reads "All checks passed" when there are no issues. The panel becomes noise that the operator's eye habituates to.

---

### Rule UX-6: Tools and forms live in slide-overs, modals are reserved for confirmations only

**Statement:** A tool (Inventory Finder, Advanced Filter Builder, Sheet Preview) opens as a slide-over from the right. A form (Record Prepayment, Referee Add, Adjustment Entry) opens as a slide-over from the right. A modal dialog is used only for destructive confirmations ("Cancel this PO? This will reverse 3 batches").

**Mercury parallel:** Mercury opens transfer forms in a slide-over. It uses modals only for confirmations like "Discard this draft?".

**TERP application:** The retrofit plan's `DetailSlideover` with `mode: 'tool' | 'form' | 'entity'` is the right abstraction. Modals stay in TERP only for destructive operations.

**Anti-pattern flagged in current TERP:** Several "dialogs" (RecordPrepaymentDialog, RefereeRelationshipDialog) are modal popups that block the main view. They should be slide-overs so the operator can reference the main view while filling the form.

---

### Rule UX-7: The system never hides what mode the operator is in

**Statement:** Active mode (which view, which filter, which customer, which entity in slide-over) is always visible somewhere on screen — sidebar active nav, context header, slide-over title, active filter chips. The operator never wonders "where am I?"

**Mercury parallel:** Sidebar shows the active section. Filter chips show what's filtered. The transaction detail panel has the transaction ID and amount in its header. State is never silent.

**TERP application:**
- Sidebar active nav for the current view.
- Context header when a customer or vendor is selected.
- Filter chips below the FilterToolbar when filters are active.
- Slide-over header shows entity type + identifier.

**Anti-pattern flagged in current TERP:** When the operator is mid-sale in SalesView with a customer selected, the only "I am in this customer's sale" cue is in the Sale Builder workspace. If the operator scrolls down or shifts focus, the cue disappears. The customer should be in a sticky context header.

---

### Rule UX-8: State changes resolve in place; navigation is for context changes, not for confirmations

**Statement:** When an action succeeds (confirm a sale, finalize a PO, verify a batch), the entity transitions in place. The operator does not get navigated to a different view to "see the result." The current view updates to reflect the new state.

**Mercury parallel:** Send a transfer — the transactions list updates, the new transfer appears at the top, briefly highlighted. The operator is not navigated to a "Confirmation" page.

**TERP application:**
- Confirm a draft sale → orders table shows the new confirmed order at the top; operator stays in SalesView.
- Approve & Finalize a PO → PO list shows the PO now in Ordered status; operator stays in POsView (slide-over may transition to detail state).
- Verify a batch → batch row updates inline; operator stays in IntakeView.

**Anti-pattern flagged in current TERP:** Some commands navigate to a confirmation page or modal. This loses the operator's place in the list they were working from.

---

### Rule UX-9: Filtering is fluid; navigation is durable

**Statement:** Changing a filter is a fluid, expected behavior — costs 0–1 clicks, no warnings, instant feedback. Navigating to a different view is a deliberate context change — sidebar click, deep link, or explicit navigation.

**Mercury parallel:** Filter pills in Mercury's transactions are one click each. Navigation between Dashboard / Accounts / Transactions is a deliberate sidebar click. Filtering and navigation feel different.

**TERP application:**
- Status filtering uses filter pills (multi-select popover), not tab bars that imply mode change. See the ground-up analysis Rule 7.
- Cycling status via filter is fluid — change Status pill from "Draft" to "Confirmed" and the table updates. No warnings, no confirmations.
- Switching views (Sales → POs) is durable — deliberate, may require navigation back if mid-task.

**Anti-pattern flagged in current TERP:** TabBars above tables imply that switching tabs is a mode change. Operators perceive it as such ("am I in Draft mode or Confirmed mode?"). It's really just filtering. Treat it as filtering visually.

---

### Rule UX-10: Cell-level interactions save immediately; multi-field forms have explicit save

**Statement:** Inline cell edits (status combobox, category combobox, numeric edit on a single cell) save on Enter or option select. Multi-field forms (new PO, new payment, adjustment entry) have explicit `Save` / `Submit` actions.

**Mercury parallel:** Combobox cells save on Enter, no Save button. Multi-field forms (new transfer, new payment) have an explicit Send button.

**TERP application:** The retrofit's ComboboxCellEditor follows this. Multi-field slide-over forms keep their Save action button in the slide-over footer.

**Anti-pattern flagged in current TERP:** Some inline edits require a save button. Some don't. The inconsistency forces the operator to track behavior per-column. Pick one rule per interaction shape and enforce it.

---

### Rule UX-11: URL is the session memory

**Statement:** The operator's current state — open slide-over entity, active filters, active tab in detail panel, active row selection if persistent — encodes into the URL. Refreshing the page or sharing the URL reproduces the operator's exact view.

**Mercury parallel:** Mercury's transaction detail URLs (`/transactions/lineOfCreditTransaction-3`) are stable. Refresh keeps the detail panel open. Share the link, get the same view.

**TERP application:** The retrofit explicitly adopts this (Rule 11 in ground-up analysis). The UX implication: the operator can trust the back button, can bookmark a deep view, can share a link with a colleague during a phone call.

**Anti-pattern flagged in current TERP:** Some drawer states don't encode into the URL. Refreshing loses them. Operators learn defensive habits.

---

### Rule UX-12: Empty states give the operator a next step

**Statement:** An empty grid is not silent. It shows a single CTA appropriate to the view's purpose ("No POs yet — [+ New PO]" or "No failed commands — system healthy").

**Mercury parallel:** Mercury's empty states are calm and actionable.

**TERP application:** Every grid should have a defined empty-state CTA. The retrofit's templates should enforce this.

**Anti-pattern flagged in current TERP:** Some grids show empty without context. Operators wonder if the filter is wrong or if the data genuinely is empty.

---

## Part 3 — Operator Flow Map

This map shows how a wholesale broker actually moves through TERP during a working day, with Mercury-style retrofitted behavior.

### Entry Points

**Sidebar (the operator's compass):**

```
┌─────────────────────┐
│ TERP Operator       │
├─────────────────────┤
│ ● Dashboard         │  ← Morning landing
│   Purchase Orders   │  ← Vendor side
│   Sales             │  ← Customer side
│   Intake            │  ← Warehouse side
│   Payments       3  │  ← Badge: 3 pending
│   Fulfillment       │
│   Inventory         │
│   Credit Review     │  ← Manager-only
│   Recovery          │  ← Safety net
│   Closeout          │  ← Month-end
│   Settings          │
├─────────────────────┤
│ Bookmarks           │
│   AR balance $234k  │  ← Ambient context
│   AP open $89k      │
│   Today's POs: 5    │
└─────────────────────┘
```

The sidebar is the operator's persistent identity surface. It carries navigation and ambient context (AR/AP balances, today's counts). The operator never has to navigate to "find out where they are" — they always know.

---

### The Morning Ritual

```
Sidebar → Dashboard
   │
   ▼
[Welcome + Quick Actions]
[KPI Strip: 4 cards]
[Focus + Pending Queues: 2 columns]
[Activity Feed: drafts + recent + (manager) credit watch]
   │
   ▼
Scan KPI line, identify pressure
   │
   ▼
Click "Intake Ready: 8" queue card
   │
   ▼
[IntakeView, filtered to ready batches]
   │
   ▼
Verify batches inline (master/detail expansion)
   │
   ▼
Return to Dashboard via sidebar → KPI updates
```

**Mercury equivalent:** Mercury's morning is: open dashboard, see balance, check recent activity, possibly initiate a transfer. Three actions, two minutes.

---

### Primary Workflow: New Purchase Order

```
Sidebar → Purchase Orders
   │
   ▼
[Filter toolbar + KPI line + PO table]
   │
   ▼
Click "+ New PO" (right end of filter toolbar)
   │
   ▼
[Slide-over: vendor selector, expected, terms, lines grid, Vendor tab]
   │
   ▼  (mid-flow: check vendor open AP)
Click Vendor tab → see open AP, prior POs, terms, market signals
   │
   ▼  (return to lines)
Click Lines tab → continue building
   │
   ▼
Click "Approve & Finalize"
   │
   ▼
Slide-over transitions to detail state
   │  (PO is now Ordered; actions shown: Draft Intake, Record Prepayment, Cancel)
   ▼
Close slide-over → PO list shows new PO at top, highlighted briefly
   │
   ▼
Pick next task from sidebar or filter the PO list
```

**Click count to create + finalize a PO:** ~5–7, no ambiguity at any step.

---

### Primary Workflow: New Sale

```
Sidebar → Sales
   │
   ▼
[Filter toolbar + KPI line + Orders table]
   │
   ▼
Click customer in filter or "+ New Sale"
   │
   ▼
Context header appears (customer, balance, credit, tags)
Tabs switch to: Lines | Suggestions
Orders table replaced by draft lines grid (full width)
   │
   ▼  (mid-flow: reference customer's purchase history)
Click customer name in context header → customer slide-over
   │  (default tab: Purchase History — 1 click, not 2)
   ▼
Reference. Close slide-over. Return to draft.
   │
   ▼  (add lines)
Click "Add line" → Inventory Finder slide-over from right
Pick batch → line added. Repeat. Close Finder when done.
   │
   ▼  (validation issues)
Inline warning strip appears above lines grid (only when issues exist)
   │
   ▼
Click "Preview sheet" → Sheet Preview slide-over
Copy offer / Export CSV → close
   │
   ▼
Click "Confirm"
   │
   ▼
Sale persists. Lines grid clears. Orders table reappears with new order at top.
Customer context header dismisses. Operator is back to "list mode."
   │
   ▼
Pick next customer or filter the orders table.
```

**Click count to process a sale:** ~10–15 depending on line count. Critically, no ambiguous clicks. Every interaction has a clear next state.

---

### Primary Workflow: Intake Verification

```
Sidebar → Intake (badge shows pending count if any)
   │
   ▼
[Filter toolbar + KPI line + Master grid (POs)]
   │
   ▼
Expand a PO row → batch detail grid appears inline
   │
   ▼
For each batch:
   - Verify (inline action) → row updates
   - Reject + note (popover) → row updates
   - Edit actual qty (cell edit, immediate save) → row updates
   │
   ▼
Bulk-select multiple batches → BulkActionBar appears
Bulk Verify → all selected verified
   │
   ▼
PO row updates: "12/15 verified" → "15/15 ✓ Complete"
   │
   ▼
Collapse PO → return to master grid → pick next PO
```

**Click count to verify a typical PO:** 1 (expand) + n (verify each batch, ~1 per batch) + 1 (collapse). For bulk verification, n collapses to 2 (select all + bulk verify).

---

### Context Switches (the Mercury Promise)

These are the moments that test the system's respect for operator attention.

**Switch 1: Mid-PO, vendor question**
```
Slide-over open with PO authoring
   │
   ▼
Click Vendor tab (already in slide-over)
   │  0 clicks of navigation; 1 click of tab switch
   ▼
See vendor open AP, terms, prior POs
   │
   ▼
Click Lines tab → return to draft
```

**Switch 2: Mid-sale, customer history reference**
```
Building draft sale (context header shows customer)
   │
   ▼
Click customer name in context header
   │  1 click
   ▼
Customer slide-over opens with Purchase History as default tab
   │
   ▼
Reference history. Close slide-over (Esc or X).
   │
   ▼
Return to draft, exactly as left.
```

**Switch 3: Phone rings, vendor asks about a different PO**
```
Mid-PO draft. Slide-over open.
   │
   ▼
Close slide-over (draft auto-saves). PO list visible.
   │
   ▼
Filter or search for the vendor's prior PO.
   │
   ▼
Click that PO row → slide-over opens with prior PO detail.
   │
   ▼
Answer the vendor's question. Close slide-over.
   │
   ▼
Click the draft PO row → slide-over reopens with draft state preserved.
```

The URL holds the state. Browser back works. The operator never loses their place.

---

### Information Access Patterns

When does the operator need what? The retrofitted system aligns access cost to need frequency.

| Information | Need Frequency | Access Pattern | Click Cost |
|---|---|---|---|
| Customer balance during their sale | Continuous | Context header | 0 |
| Customer credit limit detail | Occasional | Customer slide-over → Credit tab | 2 |
| Customer purchase history | Frequent during pricing | Customer slide-over → History (default tab) | 1 |
| Customer photography queue | Rare during sale | Customer slide-over → Photos tab | 2 |
| Vendor open AP | Occasional during PO | PO slide-over → Vendor tab | 1 |
| Vendor terms during PO | Frequent during PO | PO slide-over → Vendor tab (open by default in authoring) | 1 |
| Vendor prior POs | Occasional | PO slide-over → Vendor tab → scroll | 1 |
| Market signals | Rare | PO slide-over → Vendor tab → scroll | 1 |
| Pre-post validation issues | Conditional (only when exists) | Inline warning strip | 0 |
| Sheet preview | On demand | "Preview sheet" → slide-over | 1 |
| Inventory finder | On demand | "Add line" → slide-over | 1 |
| Bulk action options | On selection | BulkActionBar appears | 0 |
| Recovery details | On demand | Row click → slide-over | 1 |
| Closeout blockers | When blockers exist | Inline expandable section | 0 |
| Cross-view deep link (Dashboard → filtered view) | On click | Deep link with exact filter | 1 |

The ratio of "0-click continuous" to "1-click on-demand" to "2-click reference" is the operator's attention budget. The retrofit gets this ratio honest. The current state has too many "0-click continuous" surfaces, which means none of them register as primary.

---

### Session-Long Pattern: a typical working day

```
8:14 AM   Open TERP. Dashboard. Scan KPIs and queues.
8:18 AM   Click "Intake Ready: 8" → IntakeView filtered to ready. Verify all.
8:42 AM   Return to Dashboard. Click "Sales Drafts: 2" → SalesView filtered.
8:45 AM   Open first draft. Confirm. Return to drafts.
8:50 AM   Open second draft. Add lines. Resolve credit warning. Confirm.
9:30 AM   New customer call. Click "+ New Sale" → pick customer → build lines.
10:15 AM  Vendor email about counter-offer. Sidebar → POs. Find prior PO.
          Open in slide-over. Reference. Close.
10:22 AM  Return to current sale. Slide-over reopens to where we left.
          Adjust pricing. Confirm sale.
12:00 PM  Lunch. (Browser tab stays open. URL state preserved.)
1:30 PM   Recovery view because a payment failed during lunch. Investigate.
          Retry from row. Success. Sidebar → next task.
2:00 PM   Build 3 POs for evening vendor calls.
3:30 PM   Pull a sheet preview for a customer. Slide-over → copy → close.
4:00 PM   Accountant calls. Sidebar → Closeout. Period is open with 2 blockers.
          Expand blockers → "View in Intake" deep link → fix → return.
          Lock period. Done.
4:30 PM   Update credit review for two customers. Sidebar → Credit Review.
          Customer slide-over → adjust limit → confirm.
5:00 PM   Close laptop. URL state preserves the day's work.
```

The operator has moved through ~25 distinct tasks in a day. Each one started with a sidebar click or a deep link from the previous task. None of them required navigating into the wrong view by mistake. Each completed in place. The operator never had to wonder "where am I?" or "did I lose my draft?"

That is the Mercury promise applied to TERP.

---

## Closing Note

The Mercury retrofit isn't about making TERP look like Mercury. It's about giving TERP operators what Mercury gave bank customers: a system that respects their attention.

A wholesale broker has more dimensions to manage than a bank customer. The retrofit honors that by adding tabs, slide-overs, context headers, and inline strips where the domain genuinely requires more than banking does. But it refuses to spend attention on chrome — on permanent panels that announce information the operator didn't ask for, on action buttons for states the entity isn't in, on validation displays that say "everything's fine."

The current TERP says: "Here is everything you might need. You figure it out."
The retrofitted TERP says: "Here is what you came for. Ask me when you need more."

The first sentence sounds generous. The second is.

---

*End of analysis. For visual and token specifications, see `mercury-design-ground-up-analysis.md`. For per-view wireframes, see `wireframes/`. For task execution order, see `AI-TODO.md`.*
