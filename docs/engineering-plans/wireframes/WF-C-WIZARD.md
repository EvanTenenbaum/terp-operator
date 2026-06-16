## Wireframe: WF-C-WIZARD — WizardView Template

A multi-step form template for guided workflows (Intake, Pick, Pack, etc.). Mercury-style
step indicator with numbered circles, progress-connected lines, and Previous/Next navigation.

---

### Full Page Layout

```
┌─ Wizard Header ───────────────────────────────────────────────────────────────────┐
│  "New Intake Batch"                                     Step 2 of 4 — Line Items   │
│  Inter 20px semibold                                    Inter 13px text-muted      │
├─ Step Indicator ──────────────────────────────────────────────────────────────────┤
│                                                                                    │
│    ┌───┐              ┌───┐              ┌───┐              ┌───┐                  │
│    │ ✓ │──────────────│ 2 │──────────────│ 3 │──────────────│ 4 │                  │
│    └───┘              └───┘              └───┘              └───┘                  │
│  Upload File        Line Items        Review           Confirm                     │
│  completed          active            pending           pending                    │
│  text-green-600     bg-accent         text-muted        text-muted                 │
│                     Inter 11px labels below each step                              │
└────────────────────────────────────────────────────────────────────────────────────┘
  80px height  bg-zinc-50  border-bottom: 1px solid border-zinc-200
```

#### Step Indicator Details
- **Step circles:** 32×32px circles. Border-radius: 50%. Font: Inter 14px semibold
  - **Completed:** Green circle (`bg-green-100`, border: `2px solid border-green-400`), white checkmark "✓" inside. Label: `text-green-600`
  - **Active:** Accent-filled circle (`bg-accent` #216e4e, white text). Label: `text-accent`, `font-weight: 600`
  - **Pending:** Grey outline (`border: 2px solid border-zinc-300`, `text-zinc-500`). Label: `text-muted`
  - **Error:** Red outline (`border: 2px solid border-error`, `text-error`). Label: `text-error`. "⚠" inside circle
- **Connector lines:** 1px solid. Between circles. Width: 60-120px (flexible, divides remaining space equally)
  - **Completed line:** `border-color: border-green-400` (green)
  - **Active-to-pending line:** `border-color: border-zinc-300` (grey)
  - **Pending-to-pending line:** `border-color: border-zinc-200` (light grey)
- **Labels:** Below each circle. Inter 11px, `font-weight: 500`. Status-dependent color
- **Clickable steps:** Completed steps are clickable (navigates back). Active and pending steps not clickable through the indicator (use Previous/Next buttons). Optional: allow clicking pending steps if `allowSkipAhead` config is true
- **ARIA:** `role="progressbar"` on the indicator? No — use `<nav aria-label="Wizard steps">` with `<ol>`. Each step: `<li>` with `aria-current="step"` on active, `aria-disabled` on pending

---

### Step Content Area

```
┌─ Step Content ────────────────────────────────────────────────────────────────────┐
│                                                                                    │
│  ┌─ Step-Specific Content ────────────────────────────────────────────────────┐   │
│  │                                                                             │   │
│  │  (varies by step — could be upload dropzone, form fields, grid, or review)  │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │                                                                     │   │   │
│  │  │  Example: Step 2 — Line Items                                       │   │   │
│  │  │                                                                     │   │   │
│  │  │  ┌──────┬──────────┬──────┬────────────┬────────┬─────────┬─────┐  │   │   │
│  │  │  │  ☐   │ Product  │ Qty  │ Unit Price │ Total  │ Status  │ ⋮  │  │   │   │
│  │  │  ├──────┼──────────┼──────┼────────────┼────────┼─────────┼─────┤  │   │   │
│  │  │  │  ☐   │ Apples   │ 200  │ $0.25      │ $50.00 │ Pending▾│ ⋮  │  │   │   │
│  │  │  │  ☐   │ Oranges  │ 150  │ $0.30      │ $45.00 │ Pending▾│ ⋮  │  │   │   │
│  │  │  │  ☐   │ + Add line item…                                   │  │   │   │
│  │  │  └──────┴──────────┴──────┴────────────┴────────┴─────────┴─────┘  │   │   │
│  │  │                                                                     │   │   │
│  │  │  Subtotal: $95.00         3 items                                   │   │   │
│  │  │                                                                     │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
  flex-grow: fills all space between header/nav and bottom bar
  padding: 24px
  overflow-y: auto (scrollable if content exceeds height)
```

#### Content Area Details
- **Height:** `flex-grow: 1`, fills available space. Scrollable if needed
- **Padding:** 24px all sides. Background: `bg-white` (or `bg-zinc-50` for subtle section distinction)
- **Step title:** Optional in-content title (e.g., "Line Items" in Inter 16px semibold) — may overlap with the step indicator label
- **Transitions:** Step content transitions: 200ms `ease-out` crossfade (opacity: 0 → 1, translateY: 4px → 0). No slide animation (Mercury uses subtle fades)
- **Error states:** Inline validation errors (red borders + error text below fields). Step-level errors: banner at top of content area

---

### Navigation Bar

```
┌─ Navigation Bar ──────────────────────────────────────────────────────────────────┐
│  ┌──────────┐                                          ┌────────────────────────┐  │
│  │ ← Cancel │                                          │  [← Previous]  [Next →]│  │
│  └──────────┘                                          └────────────────────────┘  │
│  Inter 13px  text-muted                                right-aligned              │
│  hover: text-zinc-900                                                              │
└────────────────────────────────────────────────────────────────────────────────────┘
  56px height  bg-white  border-top: 1px solid border-zinc-200
```

#### Navigation Details
- **Height:** 56px. `bg-white`, `border-top: 1px solid border-zinc-200`
- **Left:** "← Cancel" link. Returns to previous view. Shows confirmation dialog if unsaved changes exist ("You have unsaved changes. Discard?")
- **Right:** "← Previous" (outline button) + "Next →" (primary button). On last step: "Next →" becomes "✓ Confirm" or "✓ Complete"
- **Button states:** Previous: always enabled (unless on step 1, then hidden or disabled). Next: enabled when step validation passes, disabled otherwise (with tooltip explaining why: "Complete all required fields")
- **Spacing:** 16px horizontal padding on each side
- **Keyboard:** Ctrl+Enter = Next. Ctrl+Shift+Enter = Confirm (on last step). Escape = Cancel (with confirmation)
- **ARIA:** Navigation: `role="navigation"`, `aria-label="Wizard navigation"`. Previous/Next: `aria-label="Go to previous step: Upload File"` / `"Go to next step: Review"`

---

### Complete Wizard State Machine

```
┌──────────┐   Cancel    ┌──────────┐
│  Step 1  │────────────▶│  Exit    │  (with confirmation dialog if dirty)
│  Upload  │             └──────────┘
└────┬─────┘
     │ Next
     ▼
┌──────────┐   Previous
│  Step 2  │◀────────────┐
│  Lines   │             │
└────┬─────┘             │
     │ Next              │
     ▼                   │
┌──────────┐   Previous  │
│  Step 3  │◀────────────┘
│  Review  │
└────┬─────┘
     │ Next
     ▼
┌──────────┐   Previous
│  Step 4  │◀────────────┐
│  Confirm │             │
└────┬─────┘             │
     │ Confirm           │
     ▼                   │
┌──────────┐             │
│  Saving  │  (spinner)  │
└────┬─────┘             │
     │ Error ────────────┘ (back to step with error)
     │ Success
     ▼
┌──────────┐
│  Done    │  (success page or redirect)
└──────────┘
```

---

### State Variations

#### Step 1: Initial (First Step)
```
┌─ Step Indicator ──────────────────────────────────┐
│   ┌───┐         ┌───┐         ┌───┐         ┌───┐ │
│   │ 1 │─────────│ 2 │─────────│ 3 │─────────│ 4 │ │
│   └───┘         └───┘         └───┘         └───┘ │
│  Upload File   Line Items    Review       Confirm  │
│   active       pending       pending      pending   │
└─────────────────────────────────────────────────────┘

Navigation:  [← Cancel]                    [Next →]  (disabled: no file uploaded)
```

#### Intermediate Step with Error
```
┌─ Step Indicator ──────────────────────────────────┐
│   ┌───┐         ┌───┐         ┌───┐         ┌───┐ │
│   │ ✓ │─────────│ ⚠ │─────────│ 3 │─────────│ 4 │ │
│   └───┘         └───┘         └───┘         └───┘ │
│  Upload File   Line Items    Review       Confirm  │
│   completed     error        pending      pending   │
└─────────────────────────────────────────────────────┘

Content:  ┌──────────────────────────────────────────┐
          │ ⚠ 2 line items have invalid quantities   │
          │ Please correct before continuing         │
          └──────────────────────────────────────────┘

Navigation:  [← Cancel]              [← Previous]  [Next →]  (disabled: errors present)
```

#### Last Step: Confirm
```
┌─ Step Indicator ──────────────────────────────────┐
│   ┌───┐         ┌───┐         ┌───┐         ┌───┐ │
│   │ ✓ │─────────│ ✓ │─────────│ ✓ │─────────│ 4 │ │
│   └───┘         └───┘         └───┘         └───┘ │
│  Upload File   Line Items    Review       Confirm  │
│   completed     completed     completed    active   │
└─────────────────────────────────────────────────────┘

Content:  Summary of all steps (read-only review)

Navigation:  [← Cancel]              [← Previous]  [✓ Confirm]
                                                      ↑ primary + green tint
```

#### Saving State
```
Navigation:  [← Cancel]              [← Previous]  [◌ Saving…]
                                                      ↑ disabled, spinner
```
- All navigation disabled. Cancel available but warns about in-progress save
- Step indicator unchanged from last state
- After save completes: auto-transitions to Done state

#### Done State
```
┌─ Success ─────────────────────────────────────────────────────────────────────────┐
│                                                                                    │
│                               ✓                                                    │
│                                                                                    │
│                     Intake batch #IA-306 created                                    │
│                                                                                    │
│                     12 orders · $48,600 total                                       │
│                                                                                    │
│               [View Batch →]        [Create Another]                               │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
  centered content, green checkmark, Inter 20px title
```
- **Auto-redirect:** Optional: if configured, auto-redirects to the new entity after 3 seconds
- **Actions:** "View Batch →" navigates to the new entity. "Create Another" restarts the wizard

---

### Configuration

Wizard steps are defined per-entity in a wizard config:

```typescript
// entity-schemas.ts or wizard-registry.ts
const intakeWizardSteps = [
  {
    id: 'upload',
    label: 'Upload File',
    component: UploadStep,
    validate: (state) => state.file != null,
  },
  {
    id: 'lines',
    label: 'Line Items',
    component: LineItemsStep,
    validate: (state) => state.lines.length > 0 && state.lines.every(l => l.qty > 0),
  },
  {
    id: 'review',
    label: 'Review',
    component: ReviewStep,
    validate: () => true, // read-only, always valid
  },
  {
    id: 'confirm',
    label: 'Confirm',
    component: ConfirmStep,
    validate: () => true,
    isLast: true,
  },
];
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Go to next step / Confirm on last step |
| `Ctrl+Shift+Enter` | Confirm (any step) |
| `Escape` | Cancel (with confirmation if dirty) |
| `Ctrl+S` | Save draft (if supported) |
| `Tab` | Navigate fields within step |
| `Shift+Tab` | Navigate fields backward |

### Edge Cases

- **Browser back button:** Shows confirmation dialog if wizard has unsaved changes. If user confirms, wizard state is discarded
- **Page refresh:** Wizard state NOT persisted (v1). Future: save draft to localStorage or server
- **Step validation on Previous:** No validation when going back — user can freely navigate backward
- **Step validation on Next:** Runs `validate()` on current step. If fails: shows inline errors, disables Next, highlights errored fields
- **Dirty state tracking:** Wizard tracks whether any field has been modified. Cancel/back shows confirmation only if dirty
- **Very many steps (8+):** Step indicator switches to compact mode: numbered dots without labels, labels in tooltip on hover
- **Network error during save:** Transitions to an error step showing "Failed to save. [Retry]" with option to go back and edit

---
*Font: Inter 20px wizard title, Inter 14px step content, Inter 11px step labels. Transitions: 200ms ease-out fades. Step circles: 32px.*
