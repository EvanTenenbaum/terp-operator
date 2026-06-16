## Wireframe: WF-V-MERGE — MergeCandidatesView (Custom Split-Panel)

### Layout (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Header: "Merge Candidates — Contacts"                                       │
│  [← Back]                           Two duplicates detected · Auto-selected  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Merge Comparison (3-panel split)                                            │
│  ┌──────────────────┬──────────────────────────┬──────────────────────────┐  │
│  │  Source (Keep)   │  Merge Preview (Diff)    │  Target (Replace)        │  │
│  │  ─────────────── │  ─────────────────────── │  ─────────────────────── │  │
│  │  CON-0042        │                          │  CON-0087                │  │
│  │  ┌──────────────┐│  ┌──────────────────────┐│  ┌──────────────────────┐│  │
│  │  │ Maria Gonzalez││  │ Name                ││  │ Maria G.             ││  │
│  │  │ Acme Corp     ││  │ ┌─────┐ consolidate  ││  │ Acme Corp            ││  │
│  │  │ Buyer         ││  │ │ ☑ K │─────────────││  │ Buyer                 ││  │
│  │  │ Active        ││  │ └─────┘              ││  │ Active                ││  │
│  │  │ maria@acmeco..││  │ Source wins          ││  │ m.gonzalez@acme.co…  ││  │
│  │  │ (555) 234-5678││  ├──────────────────────┤│  │ (555) 234-5678        ││  │
│  │  │ 12 POs, 8 SOs ││  │ Email                ││  │ 8 POs, 5 SOs          ││  │
│  │  │ Created: Jan '24││  │ ┌─────┐ keep both   ││  │ Created: Mar '25      ││  │
│  │  └──────────────┘│  │ │ ☑ K │─────────────││  └──────────────────────┘│  │
│  │                  │  │ └─────┘              ││                          │  │
│  │  ← This record   │  │ Source wins          ││  This record will        │  │
│  │  will be kept    │  ├──────────────────────┤│  be merged into source → │  │
│  │                  │  │ Phone                ││                          │  │
│  │                  │  │ ┌─────┐ consolidate  ││                          │  │
│  │                  │  │ │ ☑ S │─────────────││                          │  │
│  │                  │  │ └─────┘              ││                          │  │
│  │                  │  │ Same value           ││                          │  │
│  │                  │  ├──────────────────────┤│                          │  │
│  │                  │  │ Status               ││                          │  │
│  │                  │  │ ┌─────┐ consolidate  ││                          │  │
│  │                  │  │ │ ☑ K │─────────────││                          │  │
│  │                  │  │ └─────┘              ││                          │  │
│  │                  │  │ Same value           ││                          │  │
│  │                  │  ├──────────────────────┤│                          │  │
│  │                  │  │ Notes                ││                          │  │
│  │                  │  │ ┌─────┐              ││                          │  │
│  │                  │  │ │ ☑ K │─────────────││                          │  │
│  │                  │  │ └─────┘              ││                          │  │
│  │                  │  │ Source wins          ││                          │  │
│  │                  │  ├──────────────────────┤│                          │  │
│  │                  │  │ Associated Records   ││                          │  │
│  │                  │  │ ┌─────┐ keep both    ││                          │  │
│  │                  │  │ │ ☑   │─────────────││                          │  │
│  │                  │  │ └─────┘              ││                          │  │
│  │                  │  │ 20 total (12+8)      ││                          │  │
│  │                  │  └──────────────────────┘│                          │  │
│  └──────────────────┴──────────────────────────┴──────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Field-by-Field Comparison (expanded view)                                   │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │  Field          │ Keep        │ Source Value          │ Target Value     ││
│  │  ───────────────┼─────────────┼───────────────────────┼──────────────────││
│  │  Name           │ ☑ Keep Src  │ Maria Gonzalez        │ Maria G.         ││
│  │  Company        │ ☑ Keep Src  │ Acme Corp             │ Acme Corp        ││
│  │  Role           │ ☑ Keep Src  │ Buyer                 │ Buyer            ││
│  │  Email          │ ☑ Keep Src  │ maria@acmecorp.com    │ m.gonzalez@ac…   ││
│  │  Phone          │ ☑ Keep Src  │ (555) 234-5678        │ (555) 234-5678   ││
│  │  Status         │ ☑ Keep Src  │ Active                │ Active           ││
│  │  Notes          │ ☑ Keep Src  │ Primary contact for…  │ (empty)          ││
│  │  Associated POs │ ☑ Keep Both │ 12 POs                │ 8 POs            ││
│  │  Associated SOs │ ☑ Keep Both │ 8 SOs                 │ 5 SOs            ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  Summary Banner                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │  After merge: Maria Gonzalez · Acme Corp · Buyer · maria@acmecorp.com    ││
│  │  20 associated POs · 13 associated SOs · 2 linked companies              ││
│  │  CON-0087 will be deactivated and marked as merged into CON-0042.        ││
│  └──────────────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────────────┤
│  Action Bar                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │  [↔ Swap Source/Target]              [Undo All]  [Merge & Close] [Cancel]││
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Component              | Width           | Height       | Notes                          |
|------------------------|-----------------|--------------|--------------------------------|
| Page max-width         | 1280px          | —            | Centered, wider than default   |
| Header                 | 100%            | 56px         | Title + back link + count      |
| Back link              | auto            | 32px         | Inter 13px, ← arrow, muted     |
| Source panel           | 280px           | fills space  | Left, grey background tint     |
| Merge preview (diff)   | flex remaining  | fills space  | Center, field-by-field rows    |
| Target panel           | 280px           | fills space  | Right, grey background tint    |
| Panel border           | 1px             | —            | Neutral border between panels  |
| Field row height       | 44px            | —            | In Merge Preview and comparison table |
| Checkbox column        | 56px            | —            | Centered, 20px checkbox        |
| Field name column      | 140px           | —            | Bold, Inter 13px               |
| Source/Target value    | flex remaining  | —            | Inter 13px                     |
| Summary banner         | 100%            | auto (72px)  | Blue tint bg, 16px padding     |
| Action bar             | 100%            | 56px         | Flex row, right-aligned buttons|
| [Merge & Close] button | 160px           | 40px         | Primary blue, prominent         |
| [Cancel] button        | 80px            | 40px         | Muted, secondary               |
| [Swap] button          | auto            | 36px         | Icon + text, secondary         |

### Interactive Elements

- **[← Back]**: Returns to previous view (ContactsView or wherever user came from); preserves state
- **Source Panel (CON-0042)**:
  - Displays summary of the record that will be **kept** (the source/primary)
  - Clicking any field in the source panel scrolls to that field in the Merge Preview
  - Panel has subtle green left-border accent to indicate "this is kept"
  - If user wants to swap source/target, use the [↔ Swap] button in the action bar
- **Target Panel (CON-0087)**:
  - Displays summary of the record that will be **replaced** (merged into source)
  - Panel has subtle red left-border accent to indicate "this will be deactivated"
  - After merge, this record is marked as "Merged into CON-0042" and deactivated
- **Merge Preview (Diff, center panel)**:
  - Shows each field with a radio/checkbox control choosing the winning value
  - **☑ K (Keep Source)**: Checkbox that selects the source value for that field
  - **☑ S (Keep Target)**: Available as alternative when values differ; grayed out when values are same
  - **☑ Keep Both**: Available for multi-value fields (associated records, tags, phone numbers)
  - **Field highlighting**:
    - **Green highlight** (left border): Fields where source value differs from target and source is selected
    - **Red highlight** (left border): Fields where there is a conflict (differing values); resolves when selection made
    - **Grey text**: Fields where values are identical; no conflict
  - Clicking source value text selects it; clicking target value text selects it
  - Hovering shows full value tooltip for truncated fields
- **Field-by-Field Comparison Table (below panels)**:
  - Same data as Merge Preview but in a horizontal table layout for scanning
  - Checkboxes in "Keep" column mirror those in Merge Preview (synced)
  - "Same value" rows are automatically pre-selected with source wins
  - "Different value" rows default to source wins, user can toggle
  - "Keep Both" rows pre-selected with keep-both
- **Summary Banner**:
  - Dynamically updates as user changes field selections
  - Shows the final merged record preview
  - Lists total associated records after merge
  - States clearly what happens to the target record ("CON-0087 will be deactivated")
  - If selections change, banner updates in real-time with 150ms debounce
- **Action Bar**:
  - **[↔ Swap Source/Target]**: Swaps which record is source (keep) and target (replace); all existing selections are preserved and remapped
  - **[Undo All]**: Resets all field selections to defaults (source wins for all fields; keep both for multi-value fields)
  - **[Merge & Close]**: Executes the merge operation
    - Combines records per field selections
    - Reassigns associated records from target to source
    - Deactivates target record
    - Sets target record merged-into reference
    - Navigates back to source record's profile or list view
  - **[Cancel]**: Abandons merge; navigates back to previous view; no changes made

### States Shown

- **Default (auto-selected)**: Both records loaded; merge preview pre-populated with smart defaults (source wins for text fields where source is non-empty; keep both for associations)
- **Field selected — source wins (Green)**: Checkbox ☑ K checked; source value shown in green-highlighted row; target value dimmed
- **Field selected — target wins**: Checkbox ☑ S checked (rare, but supported); target value shown in green-highlighted row; source value dimmed
- **Field — value identical (Grey)**: Row shows grey; no highlight; checkbox pre-checked for source; target value identical
- **Field — conflict, unselected (Red)**: Both checkboxes unchecked; red highlight; user must select one; "Select which value to keep" tooltip
- **Field — keep both (Green)**: ☑ K checkbox styled differently (merge icon instead of K); both values shown; count of combined records shown
- **Swapped source/target**: Panels swap positions; source now shows CON-0087 as keeper; all selections remapped
- **Undo All clicked**: All selections revert to defaults (source wins for all; keep both for multi-value)
- **Merge in progress**: [Merge & Close] button shows spinner "Merging…"; all other controls disabled; summary banner shows "Merging records…"
- **Merge successful**: Brief success animation; redirect to source record profile (or list view if coming from list)
- **Merge failed**: Error banner replaces summary banner: "Merge failed: A record was modified since you loaded this page. [Reload & Retry] [Cancel]"
- **No conflicts (all fields identical or source wins for all)**: Red highlights absent; "All fields auto-resolved. Review and confirm merge." banner
- **Target has data source is missing**: Source value shows "(empty)" in grey italic; target value shown in green; auto-selected as target wins
- **Source has data target is missing**: Source value shown normally; target shows "(empty)" in grey; auto-selected as source wins (default)
- **Cancel confirmation**: If user has made manual changes to selections, dialog: "Discard merge setup? Your selections will be lost." [Discard] [Keep Editing]

### ARIA Annotations

- **Header**: `role="banner"`, `aria-label="Merge contacts"`
- **[← Back]**: `role="link"`, `aria-label="Back to contacts"`
- **"Two duplicates detected"**: `role="status"`, `aria-live="polite"`, `aria-label="Two duplicate contacts detected"`
- **Source panel**: `role="region"`, `aria-label="Source record: Maria Gonzalez, CON-0042. This record will be kept."`
- **Target panel**: `role="region"`, `aria-label="Target record: Maria G, CON-0087. This record will be deactivated after merge."`
- **Merge Preview**: `role="region"`, `aria-label="Merge preview — select which values to keep"`
- **Each field row**: `role="group"`, `aria-label="Field: Name"`
- **☑ K checkbox**: `role="checkbox"`, `aria-checked="true"`, `aria-label="Keep source value for Name: Maria Gonzalez"`
- **☑ S checkbox**: `role="checkbox"`, `aria-checked="false"`, `aria-label="Keep target value for Name: Maria G."`
- **Keep Both checkbox**: `role="checkbox"`, `aria-checked="true"`, `aria-label="Keep both values for Associated Records: 20 total"`
- **Field highlighting**: Communicated via `aria-describedby` referencing a visually-hidden description: "Source value selected" or "Conflict: Select which value to keep" or "Values are identical"
- **Field-by-Field Comparison table**: `role="table"`, `aria-label="Field-by-field merge comparison"`
- **Table rows**: `role="row"`. Keep column: `role="columnheader"`. Field: `role="rowheader"`.
- **Summary Banner**: `role="status"`, `aria-live="polite"`, `aria-label="Merge summary: After merge, Maria Gonzalez with 20 POs and 13 SOs. CON-0087 will be deactivated."`
- **[↔ Swap Source/Target]**: `role="button"`, `aria-label="Swap source and target records"`
- **[Undo All]**: `role="button"`, `aria-label="Reset all selections to defaults"`
- **[Merge & Close]**: `role="button"`, `aria-label="Merge records and close"`. During merge: `aria-busy="true"`, `aria-label="Merging records"`
- **[Cancel]**: `role="button"`, `aria-label="Cancel merge"`
- **Merge progress**: `role="progressbar"`, `aria-label="Merging records"`
- **Error banner**: `role="alert"`, `aria-live="assertive"`
- **Confirmation dialog**: `role="alertdialog"`, `aria-label="Discard merge setup?"`

### Edge Cases Handled

- **No conflicts (identical records)**: "These records appear to be exact duplicates. All fields are identical." banner. User can still merge or cancel.
- **Target has more associated records than source**: Keep-both is auto-selected for associated records to preserve all links
- **Source has empty critical field (e.g., email)**: Field flagged with amber warning: "Source has no email. Target's email will be kept." Auto-selected target wins
- **Very long text fields (notes, addresses)**: Truncated in comparison table; full text in tooltip; comparison view shows diff if values differ (word-level highlighting)
- **Merge of records with different types**: Not allowed; validation at load time: "These records are not mergeable (different entity types)."
- **Merge of records already merged**: Target record already has a merged-into reference; warning: "CON-0087 was already merged into CON-0099. Merging again may create a chain. Proceed?"
- **Concurrent modification during merge**: Merge fails with conflict error; "Target record was modified by Evan T. at 3:45 PM. Reload to see latest changes."
- **Associated records that reference both source and target**: De-duplicated during merge; references consolidated to source
- **Very many associated records (500+)**: Count shown; "View all" link to preview which records will be reassigned; merge may take longer with progress indicator
- **Undo after merge**: Not supported in UI (destructive operation); deactivate + merge reference set on target; admin can manually reverse via API
- **Cancel with unsaved field selections**: Confirmation dialog if user changed any selection from defaults
- **Swap after manual selections**: All selections correctly remap (source→target, target→source); keep-both remains keep-both
- **Keyboard navigation**: Tab through fields in Merge Preview. Arrow keys move between fields. Space toggles checkbox. Ctrl+Enter triggers Merge & Close. Escape triggers Cancel.
- **Screen reader announcement on swap**: "Source and target records swapped. CON-0087 is now the keep record."
- **Mobile (<768px)**: Panels stack vertically (Source top, Diff middle, Target bottom); comparison table below; horizontal scrolling for table; actions stack full-width
