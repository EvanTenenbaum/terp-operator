## Wireframe: WF-V-MERGE — MergeCandidatesView (Custom Split-Panel)

### UX Posture

This is a *transactional view* — it exists for a single action (merge). The merge preview is the primary surface. Source and target panels frame the diff but don't compete — they're context columns. Footer actions are state-gated to whether the merge can proceed (all conflicts resolved or not). Modal confirmation is reserved for the merge itself (destructive).

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Header                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ Merge Contacts                              Two duplicates · Auto-selected││
│  │ [← Back]                                                                 ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  Merge Comparison (3-panel split: source · diff · target)                    │
│  ┌──────────────────┬──────────────────────────┬──────────────────────────┐  │
│  │  Source (Keep)   │  Merge Preview (Diff)    │  Target (Replace)        │  │
│  │  ─────────────── │  ─────────────────────── │  ─────────────────────── │  │
│  │  CON-0042        │  [Primary surface]       │  CON-0087                │  │
│  │  Maria Gonzalez  │                          │  Maria G.                │  │
│  │  Acme Corp       │  Name                    │  Acme Corp               │  │
│  │  Buyer           │  ☑ K Source wins         │  Buyer                   │  │
│  │  Active          │                          │  Active                  │  │
│  │  maria@acmeco..  │  Email                   │  m.gonzalez@acme.co…    │  │
│  │  (555) 234-5678  │  ☑ K Source wins         │  (555) 234-5678          │  │
│  │  12 POs, 8 SOs   │                          │  8 POs, 5 SOs            │  │
│  │  Created: Jan'24 │  Phone                   │  Created: Mar'25         │  │
│  │                  │  ☑ S Same value          │                          │  │
│  │  ← This record   │                          │  This record will be     │  │
│  │  will be kept    │  Status                  │  merged into source →    │  │
│  │                  │  ☑ K Same value          │                          │  │
│  │                  │                          │                          │  │
│  │                  │  Notes                   │                          │  │
│  │                  │  ☑ K Source wins         │                          │  │
│  │                  │                          │                          │  │
│  │                  │  Associated Records      │                          │  │
│  │                  │  ☑ Keep Both (20 total)  │                          │  │
│  └──────────────────┴──────────────────────────┴──────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Inline conflict strip (only when unresolved conflicts exist)                │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ ⚠ 2 fields have unresolved conflicts. Resolve before merging.           ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  Summary Banner (live preview)                                               │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │  After merge: Maria Gonzalez · Acme Corp · Buyer · maria@acmecorp.com   ││
│  │  20 associated POs · 13 associated SOs · 2 linked companies              ││
│  │  CON-0087 will be deactivated and marked as merged into CON-0042.        ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  Action Bar                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ [↔ Swap Source/Target]    [Undo All]    [Cancel]    [Merge & Close]     ││
│  │                          (Merge button absent until all conflicts        ││
│  │                           resolved — state-gated)                        ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

### State-Gated Action Surface

| Merge State              | Visible Actions                                  |
|--------------------------|--------------------------------------------------|
| Conflicts unresolved     | `Swap`, `Undo All`, `Cancel` (Merge absent)      |
| All resolved             | `Swap`, `Undo All`, `Cancel`, `Merge & Close`    |
| Merge in progress        | (all controls disabled; "Merging…")              |

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| Page max-width         | 1280px          | —            | Wider than default             |
| Header                 | 100%            | 56px         | Title + back link + count      |
| Source panel           | 280px           | fills space  | Left, context column           |
| Merge preview (diff)   | flex remaining  | fills space  | Primary surface                |
| Target panel           | 280px           | fills space  | Right, context column          |
| Field row height       | 44px            | —            | Merge Preview rows             |
| Inline conflict strip  | 100%            | 40px         | Absent when no conflicts       |
| Summary banner         | 100%            | auto (72px)  | Live preview                   |
| Action bar             | 100%            | 56px         | Flex row, right-aligned        |

### Interactive Elements

- **[← Back]**: Returns to previous view; preserves state.
- **Source Panel**: Displays the record that will be kept; success left-border accent.
- **Target Panel**: Displays the record that will be replaced; error left-border accent.
- **Merge Preview (center, primary surface)**: Each field with a checkbox control choosing the winning value.
  - **☑ K**: Keep Source.
  - **☑ S**: Keep Target.
  - **☑ Keep Both**: Available for multi-value fields.
  - Field highlighting: success left-border (source selected, differs from target); error left-border (unresolved conflict); muted text (identical values).
- **Inline conflict strip**: Appears only when unresolved conflicts exist. Per UX-5, validation strip appears at the point of impact (above the action bar).
- **Summary Banner**: Live preview of merged record. Updates with 150ms debounce.
- **[↔ Swap Source/Target]**: Swaps; preserves selections, remaps.
- **[Undo All]**: Resets all selections to defaults (source wins; keep both for multi-value).
- **[Merge & Close]**: Absent until all conflicts resolved (state gating). On click, opens modal confirmation: "Merge CON-0087 into CON-0042? This deactivates CON-0087 and cannot be undone in UI."
- **[Cancel]**: If user made manual changes, modal confirmation: "Discard merge setup? Your selections will be lost."

### States Shown

- **Default (auto-selected)**: Smart defaults populated.
- **Field selected — source wins (success)**: Source value highlighted.
- **Field selected — target wins**: Target value highlighted.
- **Field — value identical**: Muted text; no highlight.
- **Field — conflict, unselected (error)**: Error highlight; "Select which value to keep."
- **Field — keep both (success)**: Merge icon; both values shown; count of combined records.
- **Swapped source/target**: Panels swap; selections remap.
- **Undo All clicked**: All selections revert to defaults.
- **Merge in progress**: Spinner; all controls disabled.
- **Merge successful**: Brief success animation; redirect to source record's profile.
- **Merge failed**: Error banner replaces summary banner: "Merge failed: [reason]. [Reload & Retry] [Cancel]"
- **No conflicts (all identical or source wins for all)**: Inline conflict strip absent. Summary: "All fields auto-resolved. Ready to merge."
- **Target has data source is missing**: Source value "(empty)" in muted; target value highlighted; auto-selected as target wins.
- **Source has data target is missing**: Source value highlighted; target shows "(empty)"; auto-selected as source wins.
- **Cancel confirmation**: Modal if user has changed selections.

### ARIA Annotations

- Header: `role="banner"`, `aria-label="Merge contacts"`
- [← Back]: `role="link"`, `aria-label="Back to contacts"`
- "Two duplicates detected": `role="status"`, `aria-live="polite"`
- Source panel: `role="region"`, `aria-label="Source record: Maria Gonzalez, CON-0042. This record will be kept."`
- Target panel: `role="region"`, `aria-label="Target record: Maria G, CON-0087. This record will be deactivated after merge."`
- Merge Preview: `role="region"`, `aria-label="Merge preview — select which values to keep"`
- Each field row: `role="group"`, `aria-label="Field: Name"`
- ☑ K checkbox: `role="checkbox"`, `aria-checked="true"`, `aria-label="Keep source value for Name: Maria Gonzalez"`
- ☑ S checkbox: `role="checkbox"`, `aria-label="Keep target value for Name: Maria G."`
- Keep Both checkbox: `role="checkbox"`, `aria-label="Keep both values for Associated Records: 20 total"`
- Inline conflict strip: `role="alert"`, `aria-live="polite"`
- Summary Banner: `role="status"`, `aria-live="polite"`
- [↔ Swap]: `role="button"`, `aria-label="Swap source and target records"`
- [Undo All]: `role="button"`, `aria-label="Reset all selections to defaults"`
- [Merge & Close]: `role="button"`, `aria-label="Merge records and close"`. During merge: `aria-busy="true"`.
- [Cancel]: `role="button"`, `aria-label="Cancel merge"`
- Merge progress: `role="progressbar"`, `aria-label="Merging records"`
- Error banner: `role="alert"`, `aria-live="assertive"`
- Confirmation dialog: `role="alertdialog"`, `aria-label="Confirm merge"` or `"Discard merge setup?"`

### Edge Cases Handled

- **No conflicts (identical records)**: Inline strip absent; banner: "These records appear to be exact duplicates."
- **Target has more associated records than source**: Keep-both auto-selected.
- **Source has empty critical field (e.g., email)**: Field flagged with warning; auto-selected target wins.
- **Very long text fields (notes, addresses)**: Truncated; full text in tooltip; comparison view shows diff with word-level highlighting.
- **Merge of records with different types**: Not allowed; validation at load: "Not mergeable."
- **Merge of records already merged**: Warning: "CON-0087 was already merged into CON-0099. Proceed?"
- **Concurrent modification during merge**: Merge fails with conflict error.
- **Associated records that reference both source and target**: De-duplicated.
- **Very many associated records (500+)**: Count shown; "View all" link.
- **Undo after merge**: Not supported in UI (destructive); admin can manually reverse via API.
- **Cancel with unsaved field selections**: Modal confirmation.
- **Swap after manual selections**: Selections correctly remap.
- **Keyboard navigation**: Tab through fields; Arrow keys; Space toggles checkbox; Ctrl+Enter triggers Merge & Close; Escape triggers Cancel.
- **Screen reader announcement on swap**: "Source and target records swapped."
- **Mobile (<768px)**: Panels stack vertically; horizontal scroll for comparison table; actions stack full-width.

### UX Compliance

| UX Rule | Status | Note |
|---------|--------|------|
| UX-1: Action visibility follows entity state | ✓ | Merge button absent until all conflicts resolved (state gating). |
| UX-2: Supporting info one click away, never zero | ✓ | Source/target panels show summary; deeper detail one click away (Open in full view from peek). |
| UX-3: One primary surface per view | ✓ | Merge Preview (diff) is the primary surface. Source/Target panels are context columns. |
| UX-4: Bulk actions appear only on selection | N/A | Transactional view; no bulk operations. |
| UX-5: Validation errors at point of impact | ✓ | Inline conflict strip appears only when unresolved conflicts exist. Per-field error left-border at the field. |
| UX-6: Tools and forms in slide-overs; modals for confirmations | ✓ | The merge action opens a modal confirmation because it's destructive. |
| UX-7: System never hides what mode the operator is in | ✓ | Source/target identity in panel headers. Summary banner shows the operator the outcome. |
| UX-8: State changes resolve in place | ✓ | Selections update the summary banner in place. |
| UX-9: Filtering is fluid; navigation is durable | N/A | No filtering on a transactional view. |
| UX-10: Cell-level interactions save immediately; forms have explicit save | ✓ | Field selections save to working state immediately. Final Merge requires explicit confirmation. |
| UX-11: URL is the session memory | ✓ | Source and target IDs encode into URL. Browser back returns to source view. |
| UX-12: Empty states give the operator a next step | ✓ | "All fields auto-resolved. Ready to merge." surfaces when no conflicts. |
