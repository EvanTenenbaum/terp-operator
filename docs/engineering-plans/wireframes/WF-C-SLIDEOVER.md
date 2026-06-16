## Wireframe: WF-C-SLIDEOVER — DetailSlideover All States

A right-side progressive disclosure panel for entity detail views. Supports 3 width
breakpoints (peek, standard, wide), transitions between states, and a full-view route
fallback.

---

### Slide-Over Modes

The slide-over is the **only** secondary surface. It runs in one of three modes,
chosen by the trigger, not the user:

| Mode | Use for | Header | Tabs? | URL encoding |
|------|---------|--------|-------|--------------|
| **entity** | Open a row to inspect / drill into related data (PO, Sale, Customer) | Entity title + state badge | Yes (Summary / Lines / History / etc.) | `/<view>/<entity>/<id>` |
| **tool** | Lightweight tool that operates on the current view (Inventory Finder, Search, Saved Views) | Tool title | No (single content area) | `?tool=<name>` |
| **form** | Authoring or editing a new entity (New PO, New Sale, New Intake) | Form title + breadcrumb | No (fields + actions) | `?action=<name>` |

#### URL state (UX-11)
- Mode, target id, active tab, and active filters all encode into the URL.
- Browser back/forward navigates **slide-over state** before navigating away from the page.
- Reload restores the exact mode, target, tab, and scroll position.
- Sharing the URL reproduces the operator's view.

#### Close behavior (consistent across modes)
- **Esc** closes the slide-over (form mode prompts on dirty state).
- **× button** (top-right, 24×24 hit area) closes.
- **Click-outside** the slide-over closes (form mode prompts on dirty state).
- **Browser back** closes the slide-over **before** navigating off the page.
- After close, focus returns to the originating row, button, or filter chip.

---

---

### State 1: Closed

#### Layout (ASCII)
```
┌─ FilterToolbar ──────────────────────────────────────────────────────────────┐
│                                                                               │
│  ┌─ AG Grid (main content, full width) ────────────────────────────────────┐  │
│  │                                                                          │  │
│  │    ID        Customer     Status       Date        Amount                │  │
│  │   ────      ────────     ──────       ────        ──────                │  │
│  │   SO-1042   Acme Co      Confirmed    6/15/26     $12,400               │  │
│  │   SO-1041   Beta Inc     Posted       6/14/26     $8,200                │  │
│  │   SO-1040   Gamma LLC    Draft        6/13/26     $3,150                │  │
│  │                                                                          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
└─ BulkActionBar ──────────────────────────────────────────────────────────────┘
   main content: full viewport width, no right margin
```

#### Details
- **DOM:** Slideover not rendered (`null` / conditional render). No wrapper, no overlay
- **Main content:** Full viewport width, no margin-right applied
- **ARIA:** No slideover-related ARIA in DOM
- **Edge cases:** If user resizes browser while closed → no layout shift from slideover

---

### State 2: Peek (280px)

#### Layout (ASCII)
```
┌─ FilterToolbar ───────────────────────────────────────────────┐           ┌─┤
│                                                                │───────────│P│
│  ┌─ AG Grid (margin-right: 280px) ─────────────────────────┐  │           │e│
│  │                                                          │  │  ┌──────┐ │e│
│  │   ID        Customer     Status       Date    Amount     │  │  │SO-104│ │k│
│  │  ────      ────────     ──────       ────    ──────     │  │  │1     │ │ │
│  │   SO-1042   Acme Co      Confirmed    >       $12,40│   │  │  ├──────┤ │2│
│  │   SO-1041 ▶ Beta Inc     Posted       >       $8,200│   │  │  │Beta  │ │8│
│  │                                                          │  │  │Inc   │ │0│
│  │                                                          │  │  ├──────┤ │p│
│  │                                                          │  │  │$8,200│ │x│
│  │                                                          │  │  ├──────┤ │ │
│  │                                                          │  │  │Post  │ │ │
│  │                                                          │  │  │ed    │ │ │
│  │                                                          │  │  ├──────┤ │ │
│  │                                                          │  │  │[Edit]│ │ │
│  │                                                          │  │  │[Post]│ │ │
│  │                                                          │  │  └──────┘ │ │
│  └──────────────────────────────────────────────────────────┘  └───────────┘─┤
└───────────────────────────────────────────────────────────────────────────────┘
   main content shifts left                   280px slideover on right
```

#### Details
- **Width:** 280px (fixed). Main content gets `margin-right: 280px` (CSS transition)
- **Content:** Entity summary header (ID, name, key values) + 2-3 primary action buttons (Edit, Post/Confirm, …)
- **Header:** Entity title (Inter 16px semibold) + "×" close button (top-right, 24×24 hit area)
- **Trigger:** Row click in AG Grid (single click). Also: "Esc" key, click-outside, click "×"
- **ARIA:** `role="complementary"`, `aria-label="Detail panel for [entity]"`. Focus trap NOT active in peek (limited interaction)
- **Transition:** 300ms `cubic-bezier(0.2, 0.8, 0.4, 1)` CSS width + margin transition
- **Edge cases:** Double-click on same row toggles Peek↔Standard. Click different row switches entity, stays in Peek

---

### State 3: Standard (420px)

#### Layout (ASCII)
```
┌─ FilterToolbar ───────────────────────────────────────────────┐           ┌─┤
│                                                                │───────────│D│
│  ┌─ AG Grid (margin-right: 420px) ─────────────────────────┐  │  ┌──────┐ │e│
│  │  ID        Customer     Status    Date    Amount         │  │  │SO-   │ │t│
│  │  ────      ────────     ──────    ────    ──────         │  │  │1041  │ │a│
│  │  SO-1042   Acme Co      Confirmed >       $12,400        │  │  │×     │ │i│
│  │  SO-1041 ▶ Beta Inc     Posted   6/14/26 $8,200          │  │  ├──────┤ │l│
│  │  SO-1040   Gamma LLC    Draft    6/13/26 $3,150          │  │  │[Edit]│ │ │
│  │                                                          │  │  │[Post]│ │4│
│  │                                                          │  │  │[More]│ │2│
│  │                                                          │  │  ├──────┤ │0│
│  │                                                          │  │  │Tab:  │ │p│
│  │                                                          │  │  │Line  │ │x│
│  │                                                          │  │  │Items │ │ │
│  │                                                          │  │  ├──────┤ │ │
│  │                                                          │  │  │Prcng │ │ │
│  │                                                          │  │  ├──────┤ │ │
│  │                                                          │  │  │Hist  │ │ │
│  │                                                          │  │  ├──────┤ │ │
│  │                                                          │  │  │Prod  │ │ │
│  │                                                          │  │  │Qt:200│ │ │
│  │                                                          │  │  │Apples│ │ │
│  │                                                          │  │  └──────┘ │ │
│  └──────────────────────────────────────────────────────────┘  └───────────┘─┤
└───────────────────────────────────────────────────────────┘
   main content shifted left by 420px
```

#### Details
- **Width:** 420px (fixed). Main content `margin-right: 420px`
- **Structure:** Header (entity title + close) → Action buttons (2-4, inline) → Tab bar → Tab content area (scrollable, flex-grow)
- **Tabs:** Rendered from tab registry. Active tab has border-accent bottom indicator. Tab content lazy-loaded or pre-fetched
- **Focus trap:** Active. Tab cycles through slideover elements only. Escape closes to Peek (not full close). Shift+Tab to first element
- **Close:** "×" button, Escape (→ Peek), click-outside (→ Closed)
- **Resize handle:** Left edge of panel shows subtle draggable area (cursor: col-resize, 4px wide invisible hit area, or visible grip on hover)
- **ARIA:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` for title. Focus trapped via `react-focus-lock` or custom hook
- **Edge cases:** Ensure scrollable content doesn't break focus trap. Tab bar scrolls horizontally if too many tabs

---

### State 4: Wide (60%)

#### Layout (ASCII)
```
┌─ FilterToolbar ────────────────────────────┐                       ┌─┤
│                                             │───────────────────────│D│
│  ┌─ AG Grid (margin-right: 60vw) ──────┐  │    ┌──────────────┐   │e│
│  │  ID        Cust.   Status  Date  Amt │  │    │ SO-1041      │   │t│
│  │  ────      ─────   ──────  ────  ─── │  │    │ Beta Inc  ×  │   │a│
│  │  SO-1042   Acme    Confirm >    $12K │  │    ├──────────────┤   │i│
│  │  SO-1041 ▶ Beta    Posted >    $8.2K │  │    │ Actions:     │   │l│
│  │  SO-1040   Gamma   Draft  >    $3.1K │  │    │ [Edit][Post] │   │ │
│  │                                      │  │    ├──────────────┤   │6│
│  │                                      │  │    │ [Lines]      │   │0│
│  │                                      │  │    │ [Pricing]    │   │%│
│  │                                      │  │    │ [History]    │   │ │
│  │                                      │  │    ├──────────────┤   │ │
│  │                                      │  │    │ ┌Product Qty┐│   │ │
│  │                                      │  │    │ │Apples  200││   │ │
│  │                                      │  │    │ │Oranges 150││   │ │
│  │                                      │  │    │ │Bananas 300││   │ │
│  │                                      │  │    │ │Grapes  100││   │ │
│  │                                      │  │    │ └───────────┘│   │ │
│  │                                      │  │    │ Details...   │   │ │
│  └──────────────────────────────────────┘  │    └──────────────┘   │
└────────────────────────────────────────────┘                       └─┤
```

#### Details
- **Width:** 60% of viewport width (CSS `width: 60vw`), after user drags left edge past 420px threshold
- **Snap points:** 280px (peek), 420px (standard), 60vw (wide). Transition snaps to nearest snap point on release
- **Constraints:** Min width: 200px (below 200px → closes). Max width: 70vw
- **Grid content:** margin-right adapts fluidly (no snapping on grid side)
- **Transition:** Width animates during drag with no transition; snaps with 300ms `cubic-bezier(0.2, 0.8, 0.4, 1)` on release
- **Edge cases:** If viewport < 700px wide → wide state unavailable, maxes at 50vw. Double-click left edge resets to standard (420px)
- **ARIA:** Same as standard (dialog, modal). Resize handle gets `aria-label="Resize detail panel"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

---

### State 5: Full View Route

#### Layout (ASCII)
```
┌─ App Shell ───────────────────────────────────────────────────────────────────┐
│  [← Back to Sales Orders]     SO-1041 · Beta Inc        [Edit] [Post] [More]  │
├────────────────────────────────────────────────────────────────────────────────┤
│  ┌─ Tab: Lines ───┬── Tab: Pricing ──┬── Tab: History ──────────────────────┐  │
│  │ ───────────────────────────────────────────────────────────────────────── │  │
│  │                                                                           │  │
│  │  ┌─ Product ─────┬── Qty ──┬── Price ──┬── Total ────────────────────┐   │  │
│  │  │ Apples         │ 200 ct  │ $0.25/ct  │ $50.00                      │   │  │
│  │  │ Oranges        │ 150 ct  │ $0.30/ct  │ $45.00                      │   │  │
│  │  │ Bananas        │ 300 ct  │ $0.20/ct  │ $60.00                      │   │  │
│  │  │ Grapes         │ 100 ct  │ $0.50/ct  │ $50.00                      │   │  │
│  │  ├────────────────┴─────────┴───────────┴──────────────────────────────┤   │  │
│  │  │                                            Subtotal:  $205.00       │   │  │
│  │  │                                            Tax:        $17.43       │   │  │
│  │  │                                            Total:     $222.43       │   │  │
│  │  └─────────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
   Full viewport width, no grid, dedicated page at /sales-orders/SO-1041
```

#### Details
- **Route:** e.g., `/sales-orders/SO-1041`. Navigated via "Open in full view" button or Ctrl+Click on grid row
- **Layout:** Full page, no left grid. Same header, same tab registry, same tab content components as slideover
- **Back navigation:** "← Back to [View Name]" breadcrumb link (top-left). Browser back button also works
- **Tabs:** Reuse the same tab components and registry as slideover State 3. No duplicate code
- **ARIA:** Standard page-level landmarks. `aria-current="page"` on active tab
- **Edge cases:** Direct URL access (e.g., bookmark) loads entity independently. 404 if entity not found. Refresh preserves active tab via URL hash (`#lines`, `#pricing`)

---

### Transitions Summary

```
Closed ──row click──▶ Peek (280px) ──double click / drag──▶ Standard (420px)
  ▲                      │                                       │
  │                      │                                       │ drag past 450px
  │                      │                                       ▼
  │                      │                                  Wide (60vw)
  │                      │                                       │
  │                      │                                       │ drag < 420px
  │                      │                                       ▼
  │                      ◀──── drag < 200px / Esc / × ──── Standard
  │
  ◀──── click-outside / Esc (if in Peek) / × button ────────────┘
```

**Timing:**
- Closed → Peek: 200ms `ease-in`
- Peek → Standard: 300ms `cubic-bezier(0.2, 0.8, 0.4, 1)`
- Standard → Wide: fluid during drag, snap 300ms on release
- Any → Closed: 200ms `ease-out`

**Z-index:** 30 (below Combobox dropdown at 50, above grid)
**Font:** Inter 13px body, Inter 11px labels, Inter 16px header title (semibold)

---

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1 Action visibility follows entity state | ✅ | Slide-over actions come from the entity state machine; non-applicable actions are absent, not disabled |
| UX-2 Supporting info one click away | ✅ | Slide-over IS the one-click layer; nothing in it must be permanently visible on the master view |
| UX-3 One primary surface per view | ✅ | Grid stays primary; slide-over is secondary disclosure |
| UX-4 Bulk actions on selection only | N/A | Component-level; bulk lives in WF-C-BULK |
| UX-5 Validation at point of impact | ✅ | Form mode shows field-level errors inline; no separate "validation panel" |
| UX-6 Tools in slide-overs; modals for confirms | ✅ | Tools and forms run in the slide-over; modals only for irreversible confirms |
| UX-7 Mode is always visible | ✅ | Header carries entity title + state badge OR tool/form title; operator can never lose context |
| UX-8 State changes resolve in place | ✅ | Saves resolve in-slide-over; success returns operator to grid with row flashed |
| UX-9 Filtering fluid; navigation durable | ✅ | Entity slide-overs are durable URLs; tool/form slide-overs are transient query params |
| UX-10 Cell saves immediate; forms explicit | ✅ | Form mode has explicit Save/Cancel; entity tabs may inline-edit per WF-C-COMBOBOX |
| UX-11 URL is session memory | ✅ | All three modes encode into the URL (see modes table) |
| UX-12 Empty states give next step | ✅ | Empty tab content shows "No [items] yet — [+ Add]" |

---
*All widths use CSS transitions. Focus trap via `react-focus-lock`. Tab content from shared tab registry.*
