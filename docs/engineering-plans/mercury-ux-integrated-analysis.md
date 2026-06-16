# TERP Operator — Integrated UX Analysis

**Date:** 2026-06-16  
**Sources:** Claude Opus 4.7 xhigh (1029-line audit) + OpenAI GPT-4o (42-line adversarial audit)  
**Status:** Single authoritative UX analysis. Replaces both source files for forward-looking decisions.  
**Posture:** Opinionated. Written from the seat of a wholesale brokerage operator who has been processing orders for six hours and needs the system to help, not hinder.  
**Lens:** "Would Mercury show this here?" is the test for every screen, every action, every panel.

---

## Cross-Model Agreement

Two independent models — Claude Opus 4.7 (detailed step-by-step scoring) and GPT-4o (adversarial audit of worst moments) — converged on the same core finding:

> **TERP's current design overwhelms operators with too much simultaneous information, lacks progressive disclosure, and forces context-switching. Neither model scored any workflow above 7/10. The average across all scores was poor — Claude 5.0/10 per workflow (lower ~4.3 on per-step averages), GPT-4o 2.5/10.**

The convergence is not manufactured. Each model used different methodologies — Claude walked through every step of every workflow, scoring each transition; GPT-4o evaluated the whole workflow in one pass, zeroing in on the single worst friction point. They arrived at the same diagnosis from different angles.

### Key Agreements (Both Models, Independently)

| Finding | Claude Evidence | GPT-4o Evidence |
|---------|----------------|-----------------|
| **Information overload is the #1 problem** | "8 surfaces for a single workflow" (SalesView); per-step scoring reveals systemic over-display | "Pervasive issue of information overload and irrelevant data presentation across all workflows" |
| **Lack of progressive disclosure** | UX-2 rule: "Supporting information lives one click away, never zero, except for continuous monitoring" | "Lack of progressive disclosure and context-awareness severely impacts task efficiency" |
| **Context switching is debilitating** | Workflow 6 scored 4/10: "Operators learn defensive habits — save constantly, mistrust the back button" | Lowest score given (1/10): "The inability to preserve state decimates workflow efficiency" |
| **Dashboard lacks clarity and prioritization** | "8 equally-weighted panels means the eye lands nowhere in particular" | "Dashboard lacks clear prioritization and directive" |
| **Error recovery lacks actionable context** | "The operator has to filter the admin tools out of their attention to find the failure" | "Lack of contextual information surrounding the error is debilitating" |
| **Irrelevant actions clutter the interface** | UX-1: "The PO authoring workspace shows a constant ribbon of action buttons whose enablement varies" | "Irrelevant action buttons like 'Receive' and 'Unfinalize' further confuse and clutter" |

### The One Divergence — and What It Means

**GPT-4o is harsher (avg 2.5 vs Claude's 5.0).** This is not a disagreement about the problems — GPT-4o saw the same friction points. The gap comes from philosophy: GPT-4o scored each workflow by its single worst moment (the operator's breaking point), while Claude averaged across all steps, including the ones that work. Both are useful. GPT-4o tells us which workflows have moments so bad they color the entire experience. Claude tells us how much salvageable good exists among the bad. Together, they say: *the problems are real, they cluster in the same workflows both models identified, and the ceiling on the current design is low.*

---

## Top 7 Friction Points (Ranked by Operator Impact)

These are ranked by what they cost an operator after six hours of work — not by what looks worst on a heuristic checklist.

### 1. SalesView: Eight Simultaneous Panels

**What the operator experiences:** Arriving at SalesView means scanning eight surfaces — Orders grid, Draft Lines grid, Suggestions grid, Sale Builder workspace, Customer Purchase History panel, Photography Queue panel, Inventory Finder, and an optional ContextDrawer. A new operator freezes. A veteran operator learns to focus on one panel and ignore seven. The system prepared for everything the operator might want, and in doing so buried what they actually want.

**Why it matters after six hours:** The eye never gets a rest. Every interaction requires re-triage. Operators develop "panel blindness" — they stop seeing panels that aren't their current focus, which means when an important change happens in a peripheral panel, they miss it. The habituation that lets veterans function is also the thing that makes them miss validation warnings.

**Mercury comparison:** Mercury's most complex view is the transactions page — a filter toolbar, summary line, one table. When you need detail, a slide-over opens. When you need bulk actions, a bar appears. Mercury never presents two equal-weight grids simultaneously.

**Score impact:** Claude 2/10 (worst in TERP). GPT-4o 2/10 (tied for worst).

---

### 2. Mid-Flow Context Switching Destroys State

**What the operator experiences:** You are mid-sale building a customer's order. Your phone buzzes — a vendor asks about a PO from last week. You navigate away from SalesView to look it up. When you return, your draft may or may not be there. Sometimes it is. Sometimes it isn't. You learn to save constantly, mistrust the back button, and keep a paper notepad of "the PO I was on."

**Why it matters after six hours:** Almost every operator workflow includes at least one mid-flow lookup. If every lookup is a gamble, operators spend mental energy on defensive state-keeping instead of on the work. Over months, this erodes trust in the system. Operators stop exploring. They stay in rigid, linear paths because any detour might cost them data.

**Mercury comparison:** Mercury's URLs encode exact state. Click a transaction, the URL updates. Press back, you return. Close a detail panel, you're in the list. The system never forgets where you were.

**Score impact:** Claude 4/10. **GPT-4o 1/10** (the lowest score either model gave any workflow).

---

### 3. Dashboard: No Anchor, No Landing Zone

**What the operator experiences:** Opening TERP at 8:14 AM means landing on eight stacked WorkspacePanels (KPI tiles, Today Focus, Pending Queues, My Open Work, Credit Watch, Your Drafts, Recent Activity, Cash Buckets). The eye lands nowhere in particular. The operator has to choose where to start — its own small decision tax.

**Why it matters after six hours:** This is the morning ritual. It happens every day. The first five seconds of opening the app shape the operator's emotional posture toward the entire session. A crowded, unguided dashboard says "you figure it out." Across a year, the decision tax accumulates into "I hate opening this app."

**Mercury comparison:** Mercury's dashboard: welcome line, five quick actions, one balance card, recent activity. Four elements. The eye lands on the balance card. The operator knows their position in 2 seconds.

**Score impact:** Claude 4/10. GPT-4o 3/10.

---

### 4. PO Authoring Is Pre-Staged and Action-Overloaded

**What the operator experiences:** Opening PurchaseOrdersView means seeing the PO grid, a PO authoring workspace, a VendorContextPanel, a selected-PO lines grid, and a ReceiptPanel — all at once. The operator didn't ask to author a PO. They came to look at the list. The system pre-staged a workflow they may not need. When they do click "+ New PO," they see action buttons for states the PO isn't in: `Receive`, `Draft Intake`, `Unfinalize`.

**Why it matters after six hours:** Every PO session starts with a small act of visual triage — finding the grid in a crowded layout. Every new PO includes a moment of hesitation at the action buttons. Operators newer than three months pause on every button. Veterans learn to ignore the disabled ones, but the visual noise remains.

**Mercury comparison:** Mercury's transactions page is the transactions table. There is no transaction authoring workspace pre-staged. When you start a new transfer, you see only the fields and the one action that applies: `Send`.

**Score impact:** Claude 5/10 (net workflow; individual steps scored 4 and 5). GPT-4o 3/10.

---

### 5. Error Recovery: The Failure Is Not Foregrounded

**What the operator experiences:** A posting failed at 5:30 AM. The operator opens RecoveryView and sees three competing surfaces: an Action Log grid, an Admin tools panel, and a Command Reversal panel. They are half-awake and need to figure out which surface holds the failure. The Admin tools are visually prominent. The failure is in the Action Log. The operator's eye lands on Admin tools first.

**Why it matters after six hours:** Error recovery is the view operators land in when something has gone wrong — often late at night, often after a stressful notification. The visual posture of this view shapes the operator's emotional relationship with the system. A design that makes failures hard to find makes the system feel punitive. A design that surfaces failures immediately makes the system feel like a safety net.

**Mercury comparison:** Mercury doesn't have a separate "recovery" page. Failed payments live in the transactions table with `status = failed` filtered. Recovery is a status filter, not a separate destination.

**Score impact:** Claude 5/10. GPT-4o 2/10 (calling the lack of error context "debilitating").

---

### 6. Customer Selection Triggers an Information Avalanche

**What the operator experiences:** Selecting a customer in SalesView fires six simultaneous panel updates: Sale Builder populates, Credit display updates, Pre-post strip updates, Purchase History panel shows history, Photography Queue shows pending assignments, Draft Lines clears, Suggestions populates. The operator just wanted to start adding lines. The system delivers a firehose.

**Why it matters after six hours:** Operators learn to ignore most of the updates that fire on customer selection. The habituation is pragmatic but dangerous — it means the operator might miss a critical change in a peripheral panel because they've trained themselves not to look. The system is training its users to ignore it.

**Mercury comparison:** Selecting an account to transfer from shows the account name + balance above the form. That's it. The transaction history, statement preview, and metadata are one click away. The one fact that matters is surfaced; everything else you ask for.

**Score impact:** Claude 3/10 (individual step). GPT-4o noted this as part of the SalesView 2/10 score.

---

### 7. Permanent Auxiliary Panels Become Invisible Noise

**What the operator experiences:** The pre-post validation panel is always visible during SalesView. When there are no issues, it reads "All checks passed" and occupies screen real estate. The VendorContextPanel is always visible in POsView. The Customer Purchase History panel is always visible in SalesView. These panels announce information the operator didn't ask for, 90% of the time.

**Why it matters after six hours:** Permanent "everything's fine" panels habituate the operator's eye. When an actual issue appears in a panel they've learned to ignore, they may not see it. The system is training operators to treat warnings as wallpaper. The most dangerous moment is when a real validation failure goes unnoticed because the panel has been silent for hours.

**Mercury comparison:** Mercury shows validation errors at the point of impact — "Insufficient funds" at the amount field, not in a permanent status panel. When there's no error, there's no error display. The absence of noise makes the presence of an error unmissable.

**Score impact:** Claude 4/10 (validation panel step). GPT-4o flagged this pattern as "irrelevant data presentation" across all workflows.

---

## User Experience Audit Summary (by Workflow)

| Workflow | Claude Score | GPT-4o Score | Primary Friction |
|----------|-------------|-------------|------------------|
| 1. Create PO | 5/10 | 3/10 | Pre-staged authoring workspace; irrelevant action buttons visible on draft POs |
| 2. Process Sale | 3/10 | 2/10 | Eight simultaneous panels; customer selection fires six updates at once |
| 3. Intake Verification | 7/10 | 4/10 | Cross-PO bulk selection unavailable; Claude found this view already close to Mercury |
| 4. Dashboard → Action | 5/10 | 3/10 | Eight equally-weighted panels; no visual anchor or landing zone |
| 5. Error Recovery | 5/10 | 2/10 | Three competing surfaces; failure not foregrounded; no command context shown |
| 6. Mid-Flow Context Switch | 4/10 | 1/10 | State not preserved; back button untrusted; operators keep paper notes |
| 7. Period Closeout | 5/10 | N/A | Four equal-weight panels; no enforced top-down attention flow |
| 8. Credit Review | 6/10 | N/A | Owner divergence panel always visible even when scanning, not reviewing |
| **Mean (all scored)** | **5.0** | **2.5** | |

**Notes:** GPT-4o did not score Closeout or Credit Review (the 42-line adversarial audit focused on the six workflows with the most visible friction). GPT-4o's lower average reflects its methodology: score the single worst moment, not the average experience. Claude's per-step average (~4.3) is lower than the per-workflow net scores (5.0), reflecting that some steps within otherwise functional workflows are sharply worse than the workflow's overall grade suggests.

---

## Contextual Action Rules — Cross-Model Confirmation

Claude's analysis derived 12 UX rules (UX-1 through UX-12) from Mercury's behavior. GPT-4o's adversarial audit independently identified the principles behind 6 of them. Rules with cross-model confirmation carry stronger weight — they represent problems both a detailed walkthrough AND an adversarial reviewer flagged from different angles.

| Rule | Claude Finding | GPT-4o Independent Agreement |
|------|---------------|------------------------------|
| **UX-1:** Action visibility follows entity state | Action buttons on draft POs include `Receive`, `Unfinalize` — irrelevant for current state | ✅ "Irrelevant action buttons like 'Receive' and 'Unfinalize' further confuse and clutter" |
| **UX-2:** Supporting info one click away, never zero (except continuous monitoring) | VendorContextPanel, CustomerPurchaseHistory permanent — attention tax | ✅ "Context-sensitive interfaces where only relevant actions are exposed. Minimalism in visible options preventing distraction" |
| **UX-3:** One primary surface per view | SalesView has 6 grids/panels simultaneously; none is unambiguously primary | ✅ "The sheer number of panels dilutes focus, demanding significant cognitive effort" |
| **UX-4:** Bulk actions appear only on selection | IntakeView totals strip always visible regardless of selection | — |
| **UX-5:** Validation errors at point of impact, never in dedicated panel | Permanent pre-post validation panel reads "All checks passed" — habituating noise | ✅ "Validation panel without clear indication adds to the confusion" |
| **UX-6:** Tools and forms live in slide-overs; modals for confirmations only | RecordPrepaymentDialog, RefereeRelationshipDialog are blocking modals | — |
| **UX-7:** System never hides what mode the operator is in | Customer selection context only visible in Sale Builder workspace, disappears on scroll | — |
| **UX-8:** State changes resolve in place; no navigation for confirmations | Some commands navigate to confirmation pages, losing the operator's place | ✅ "Lack of feedback on task completion and dashboard refreshment leaves the operator uncertain" |
| **UX-9:** Filtering is fluid; navigation is durable | TabBars imply mode change when they're really just filters | — |
| **UX-10:** Cell-level interactions save immediately; multi-field forms have explicit save | Inline edit save behavior inconsistent across columns | — |
| **UX-11:** URL is the session memory | Refresh loses drawer state; operators learn defensive habits | ✅ "The inability to preserve state decimates workflow efficiency. Leaving a partially-built sale to address a query leads to data loss or state reset" |
| **UX-12:** Empty states give the operator a next step | Some grids show empty without context; operators wonder if filter is wrong or data is absent | — |

**Result:** 6 of 12 rules have cross-model confirmation. These 6 should be treated as the highest-priority design rules — they represent problems so visible that both a detailed walkthrough and a rapid adversarial audit caught them.

The 6 unconfirmed rules (UX-4, UX-6, UX-7, UX-9, UX-10, UX-12) are still valid — they are derived from Mercury's design behavior, which is well-established. The lack of GPT-4o confirmation reflects GPT-4o's shorter audit scope (42 lines, worst-moment focus), not a contradiction.

---

## Operator Attention Budget — The Single Most Actionable Principle

Claude's Part 3 produced an information access frequency matrix. Converted into a principle, it is simple and ruthless:

> **Show the operator three things:**
> 1. **What they're working on** — 0 clicks, always visible
> 2. **What they might need next** — 1 click away
> 3. **What they rarely need** — 2+ clicks away, or search

**Anything always-visible that belongs in category 2 or 3 is a design bug.**

Applied to current TERP:
- Customer Purchase History on SalesView is always visible. It belongs in category 2 (frequent during pricing, 1 click). **Design bug.**
- VendorContextPanel on POsView is always visible. It belongs in category 2 (occasional during PO, 1 click). **Design bug.**
- Pre-post validation panel when no issues exist belongs in category 3 (conditional). **Design bug.**
- Photography Queue on SalesView is always visible. It belongs in category 3 (rare during sale, 2+ clicks). **Design bug.**
- Admin tools on RecoveryView are always visible. They belong in category 3 (power user, 2+ clicks). **Design bug.**

The retrofit's job is to move every always-visible surface that belongs in category 2 or 3 into its correct access tier. The operator should never pay 0-click attention for 1-click information.

---

## Implementation Implications — Concrete, Not Generic

This section answers: *what actually changes in the code and the operator's screen?*

### SalesView Must Go from 8 Panels to 1 Primary + Collapsible Sections + Slide-Over

**Current:** 6 grids + 2 panels visible simultaneously.  
**Target:** Orders table as the primary surface. Customer selection switches to draft lines grid (full width) with a context header. Suggestions become a tab. Inventory Finder becomes a slide-over (opens on "Add line"). The rest — Purchase History, Photography Queue — live in the customer slide-over.

This is not a visual polish task. It is a re-architecture. The retrofit plan correctly flags this as Phase 3A "HARD GATE."

### PO Authoring Must Be Opt-In (Slide-Over), Not Pre-Staged

**Current:** PO authoring workspace, VendorContextPanel, and ReceiptPanel are always visible on PurchaseOrdersView.  
**Target:** The PO list IS the view. A filter toolbar + KPI line sits above it. "+ New PO" opens a slide-over. The slide-over has two tabs: Lines (for building) and Vendor (for reference). When the operator is not authoring a PO, the slide-over does not exist.

### Action Buttons Must Be State-Gated (Not Just Disabled)

**Current:** Action ribbon shows all possible PO actions (`Receive`, `Draft Intake`, `Unfinalize`, `Cancel Order`) regardless of PO state, with enablement varying.  
**Target:** A draft PO shows `Save Draft` and `Approve & Finalize` only. An Ordered PO shows `Draft Intake`, `Record Prepayment`, and `Cancel` only. The buttons that don't apply are **absent**, not disabled. Disabled buttons still consume attention. Absent buttons don't.

### Dashboard Must Go from 8 Panels to Focused Overview

**Current:** Eight stacked WorkspacePanels with equal visual weight.  
**Target:** Welcome + Quick Actions → 4-card KPI strip → two-column Focus + Pending Queues → unified Activity Feed. Three visual sections instead of eight undifferentiated panels. The KPI strip gives the eye a default landing zone.

### Recovery Must Show Command Context, Not Just Error Codes

**Current:** Action Log shows error identifiers without details of what the command was attempting.  
**Target:** Row click opens a slide-over with the command summary in the header, tabs for Details, History, and Logs, and actions for Retry, Reverse, and Mark Resolved. Inline retry available at the row level so the operator never has to open the slide-over for the common case.

### Every View Must Pass the "What Do I See First?" Test

**Current:** Most TERP views show 3-8 surfaces on arrival. The operator has to triage.  
**Target:** Every view has exactly one primary surface. The operator's eye lands on it in under 1 second. The test: "If I describe this view to someone on a phone call, they know what to click first."

### State Must Encode into the URL

**Current:** Some drawer states don't encode into the URL. Refresh loses them.  
**Target:** Open slide-over entity, active filters, active tab, active row selection — all encode into the URL. Refresh reproduces the exact view. Browser back works. Share the URL, get the same view. The operator trusts the back button.

### Validation Must Appear at the Point of Impact, Not in Permanent Panels

**Current:** Permanent pre-post validation panel on SalesView.  
**Target:** When issues exist, an inline warning strip appears above the lines grid with the issue and a fix link. When no issues exist, no surface. The absence of noise makes the presence of an error unmissable.

---

## What This Does Not Mean

- **Not a visual redesign.** This analysis governs UX behavior (what's shown, when, how many clicks away). Visual specifics — pixel values, font weights, border opacities — live in `mercury-design-ground-up-analysis.md` and the wireframes directory.
- **Not a feature removal.** Every piece of information TERP currently surfaces is genuinely useful — to someone, at some moment. The retrofit doesn't remove information. It sequesters it behind the correct access tier so it's available when needed and invisible when not.
- **Not a "make TERP look like Mercury."** Mercury is a bank. TERP is a wholesale brokerage operating in a richer domain. The retrofit adds tabs, slide-overs, context headers, and inline strips where the domain genuinely requires more than banking does. The principle — respect operator attention — is identical. The implementation is domain-appropriate.

---

*End of integrated analysis. This document supersedes `mercury-user-experience-analysis.md` and `openai-ux-analysis-gpt4o.md` as the single authoritative UX analysis for the Mercury retrofit. For task execution, see `MASTER-EXECUTION-DOCUMENT.md` and `AI-TODO.md`.*
