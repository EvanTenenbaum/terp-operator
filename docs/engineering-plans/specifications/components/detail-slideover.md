# DetailSlideover — Component Specification

**Type:** Layout shell
**Replaces:** ContextDrawer (all 5 states) + ~15 drawer/panel components
**Research reference:** `research-packets/mercury-detail-panel-behavior.md`

---

## Purpose
Right-side slide-over panel for entity detail. Shows entity summary + tabbed content. Opens on row click. Replaces TERP's ContextDrawer with a cleaner 3-state model + full-page fallback.

---

## API Contract

```typescript
interface DetailSlideoverProps {
  entityType: string;            // e.g., 'po', 'salesOrder', 'customer', 'vendor', 'lot'
  entityId: string;              // UUID of the entity
  state: SlideoverState;         // 'closed' | 'peek' | 'standard' | 'wide'
  onStateChange: (state: SlideoverState) => void;
  onClose: () => void;          // Called on × click, Escape, or click-outside (peek only)
  onOpenFullView?: () => void;  // Navigates to full-page entity route
}

type SlideoverState = 'closed' | 'peek' | 'standard' | 'wide';
```

---

## Tab Registry API

```typescript
// Register tabs for an entity type (called at module import time, NOT in render)
function registerTabs(entityType: string, tabs: DetailTab[]): void;

// Get registered tabs for an entity type
function getTabs(entityType: string, userRole?: string): DetailTab[];

interface DetailTab {
  key: string;                   // Unique key within entity type
  label: string;                 // Display name (e.g., "Lines", "History")
  icon?: string;                 // Lucide icon name (e.g., 'Package', 'Clock')
  component: React.ComponentType<DetailTabProps>;  // Tab content component
  badge?: number | (() => number);  // Badge count (e.g., "3 invoices")
  requiresRole?: string;         // Role gate (e.g., 'manager')
  defaultFor?: string[];         // Entity types where this tab is default (first shown)
}

interface DetailTabProps {
  entityId: string;
  entityType: string;
}
```

---

## States

### State 1: Closed
```
[Not rendered]
```
- **Trigger:** No entity selected, or user clicked × / pressed Escape / clicked outside (peek)
- **Visual:** Slideover not in DOM (or `display: none`). Main content: full width.
- **Transition out:** Slideover animates right (200ms ease-in). Main content expands to full width (200ms).

### State 2: Peek (280px)
```
┌─Main Content──────────────────────────┬─Peek────────┐
│                                        │ PO #1004     │
│  [Table continues, fully interactive]  │ Acme Corp    │
│                                        │ Ordered      │
│                                        │ $8,200       │
│                                        │              │
│                                        │ [Open] [···] │  ← 2-3 key actions
│                                        │              │
│                                        │ ◀ drag       │
└────────────────────────────────────────┴──────────────┘
```
- **Width:** 280px
- **Trigger:** Single-click row OR hover row (configurable, default: single-click)
- **Visual:** Slides in from right. Main content stays full width (peek overlays, doesn't push). Semi-transparent right edge of peek panel. Table behind remains INTERACTIVE.
- **Content:** Entity summary header (title, key fields, status badge). 2-3 primary action buttons. Minimal info.
- **Dismiss:** Click ×, click outside peek panel, or press Escape.
- **Transition:** 300ms ease-out from right.

### State 3: Standard (420px)
```
┌─Main Content (shifts left)─────────────┬─Standard─────┐
│                                         │ PO #1004      │
│  [Table is narrower, fully functional]  │ Acme Corp     │
│                                         │ Ordered       │
│                                         │ $8,200        │
│                                         │               │
│                                         │ [Draft Intake]│
│                                         │ [Unfinalize]  │
│                                         │ [Cancel]      │
│                                         │───────────────│
│                                         │ Lines | Intake│
│                                         │ Vendor | Hist │  ← tab bar
│                                         │───────────────│
│                                         │ Tab Content:  │
│                                         │ Line 1 · Rose │
│                                         │ Line 2 · Fern │
│                                         │ ...           │
│                                         │               │
│                                         │ [Open in full │
│                                         │  view →]      │
└─────────────────────────────────────────┴───────────────┘
```
- **Width:** 420px
- **Trigger:** Double-click row, OR click "Open" button in peek, OR drag peek handle left
- **Visual:** Main content shifts left (`margin-right: 420px`). Slideover has full border-left. Tab bar visible. Active tab content visible.
- **Content:** Entity header + action buttons + tab bar + tab content area + "Open in full view" link.
- **Dismiss:** Click × or Escape. Closes to peek? Or fully closed? → Fully closed. User re-clicks row to re-open.
- **Tab switching:** Click tab → content swaps. Tab indicator animates horizontally.

### State 4: Wide (60%)
```
┌─Main Content (40% width)───────────────┬─Wide (60%)───┐
│                                         │ Same layout  │
│  [Table compressed but usable]          │ as standard  │
│                                         │ but wider    │
│                                         │ content      │
└─────────────────────────────────────────┴──────────────┘
```
- **Width:** 60% of viewport
- **Trigger:** Drag left edge leftward beyond 420px, OR click "Expand" button
- **Visual:** Main content compressed to 40%. Slideover content has more horizontal space.
- **Content:** Same as standard. Tabs/content use the extra width.
- **Dismiss:** Click × or Escape. Returns to standard (420px) on next open? → Returns to standard.

### State 5: Full View (Navigated)
```
┌─Full Page───────────────────────────────────────────────┐
│ ← Back to list                                          │
│ PO #1004 · Acme Corp · Ordered · $8,200                 │
│ [Draft Intake] [Unfinalize] [Cancel]                    │
├─────────────────────────────────────────────────────────┤
│ Lines | Linked Intake | Vendor | History                │
│  (same tabs, full-page layout)                          │
│  [Full-width table, more room for complex data]         │
└─────────────────────────────────────────────────────────┘
```
- **Trigger:** Click "Open in full view" in standard/wide state
- **Visual:** Full page navigation. Browser URL updates (e.g., `/purchase-orders/:id`). Back button works.
- **Content:** Same tab registry used in full-page layout. Same entity header. Same action buttons.
- **Navigation:** Back button → returns to list view. Slideover closes.

---

## Transitions

| From → To | Animation | Duration | Easing |
|-----------|-----------|----------|--------|
| Closed → Peek | Slide in from right | 300ms | `cubic-bezier(0.2, 0.8, 0.4, 1)` |
| Peek → Standard | Width expand + main shift | 250ms | `cubic-bezier(0.2, 0.8, 0.4, 1)` |
| Standard → Wide | Width expand | 250ms | `cubic-bezier(0.2, 0.8, 0.4, 1)` |
| Any → Closed | Slide out to right | 200ms | `cubic-bezier(0.4, 0, 0.6, 1)` |
| Standard → Full View | Route navigation (no animation) | — | — |

**Implementation:** CSS `transition` on width + transform properties. Use existing `--tx-drawer-state: 180ms cubic-bezier(0.2, 0.8, 0.4, 1)` CSS variable (already defined in `styles.css:13`).

---

## Tab Content Loading States

Each tab loads its own data (queries fire when tab becomes active):

### Tab Loading
```
┌──────────────────────┐
│ Lines | Intake | Ven │
│──────────────────────│
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← skeleton rows
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
└──────────────────────┘
```
- Skeleton placeholder while tab queries load. Matches grid row height.

### Tab Error
```
┌──────────────────────┐
│ Lines | Intake | Ven │
│──────────────────────│
│ ⚠ Could not load     │
│   [Retry]            │
└──────────────────────┘
```

### Tab Empty
```
┌──────────────────────┐
│ Lines | Intake | Ven │
│──────────────────────│
│ No lines yet         │
│ [Add first line]     │
└──────────────────────┘
```

---

## Drag-to-Resize

The left edge of the slideover is draggable:
- Drag leftward → expands width (peek → standard → wide, continuous)
- Drag rightward → shrinks width (wide → standard → peek → closed)
- **Min width:** 280px (peek). Below 200px: close.
- **Max width:** 70% of viewport.
- **Snap points:** 280px, 420px, 60%. If drag released within 20px of snap point, snap to it.

**Implementation:** MouseDown on 8px-wide invisible drag handle on left edge. MouseMove updates width. MouseUp snaps to nearest state.

---

## Keyboard Behavior

| Key | State | Action |
|-----|-------|--------|
| Escape | Any | Close slideover (fully closed) |
| Tab | Any | Focus cycles within slideover (header → actions → tab bar → tab content) |
| Shift+Tab | Any | Reverse cycle |
| ArrowLeft/Right | Standard/Wide | Switch tabs when tab bar is focused |

---

## Accessibility

| Requirement | Implementation |
|-------------|---------------|
| `role="complementary"` | On slideover container |
| `aria-label="Entity details"` | On slideover |
| `aria-expanded` | On triggering row: true when slideover open |
| Focus trap | Tab cycles within slideover; Escape to close |
| Close button | `aria-label="Close detail panel"` |
| Tab bar | `role="tablist"`, tabs have `role="tab"`, panels have `role="tabpanel"` |
| Drag handle | `aria-label="Resize detail panel"` |

---

## File Locations

```
src/client/components/
├── DetailSlideover.tsx           Shell component
├── DetailSlideover.test.tsx      Unit + integration tests
└── tabs/
    └── registry.ts               registerTabs / getTabs
```

---

## Test Checklist

- [ ] Renders nothing in closed state
- [ ] Opens in peek on single-click (280px)
- [ ] Opens to standard on double-click (420px)
- [ ] Expands to wide on drag (60%)
- [ ] Closes on × button click
- [ ] Closes on Escape key
- [ ] Closes on click-outside (peek only)
- [ ] Tab bar renders registered tabs
- [ ] Clicking tab shows correct content
- [ ] Tab badge count renders correctly
- [ ] Role-gated tabs hidden for non-matching roles
- [ ] Drag handle resizes smoothly
- [ ] Snaps to 280px / 420px / 60% on drag release
- [ ] "Open in full view" navigates to correct route
- [ ] Back navigation returns to list view
- [ ] Focus trapped when open
- [ ] Tab content shows loading skeleton
- [ ] Tab content shows error with retry
- [ ] Tab content shows empty state
- [ ] Main content is interactive in peek state
- [ ] Transitions are smooth (no jank)
- [ ] ARIA roles and labels correct
- [ ] Works with keyboard only
