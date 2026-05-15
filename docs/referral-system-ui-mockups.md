# Referral System UI Mockups

Visual examples of how referee features integrate into TERP Agro's existing interfaces.

---

## 1. Referees Grid View (`/referees`)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ TERP Agro                                    🔍 Command Palette        Evan ▼   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 📊 Dashboard  📦 Intake  🛒 Sales  📋 Orders  💰 Payments                       │
│ 📊 Inventory  👥 Clients  🏭 Vendors  👤 Referees ◄ ═══                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Referees                                                      [+ Add Referee]  │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ Name               Email              Phone      Rels  Balance    Lifetime │ │
│  ├────────────────────────────────────────────────────────────────────────────┤ │
│  │ John Martinez      john@example.com   555-0123   2     $450.00   $2,340.00│ │
│  │ Sarah Chen         sarah@chen.com     555-0456   1     $0.00     $1,120.00│ │
│  │ Mike Thompson      mike@thompson.net  555-0789   3     $285.50   $4,567.25│ │
│  │ Lisa Wong          lisa@wong.co       555-0321   1     $125.00   $875.00  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Filters: ☐ Has balance  ☐ Active only                     4 referees           │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Balance column shows unpaid credits (filterable)
- Rels = count of active relationships
- Lifetime = total all-time earnings
- Click row → opens referee profile
- Follows same grid pattern as Customers/Vendors views

---

## 2. Referee Profile Panel

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Referee: John Martinez                                              [Edit] [×]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Contact Information                                                             │
│  ────────────────────────────────────────────────────────────────────           │
│  Email: john@example.com                                                         │
│  Phone: 555-0123                                                                 │
│  Tax ID: XX-XXX1234        Payment method: Check                                 │
│                                                                                  │
│  Balance Summary                                                                 │
│  ────────────────────────────────────────────────────────────────────           │
│  Current balance:    $450.00    ← [Quick Payout]                               │
│  Lifetime earned:    $2,340.00                                                   │
│  Last payout:        Apr 28, 2026 ($350.00)                                     │
│                                                                                  │
│  Relationships                                            [+ Add Relationship]  │
│  ────────────────────────────────────────────────────────────────────           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Entity Type  Entity Name       Fee Structure    Default  Active  Actions │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ Customer     Rich Star Foods   5%               ☑        ☑      [Edit]  │  │
│  │ Vendor       Green Valley Co.  $50 per PO       ☑        ☑      [Edit]  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  Credit History                                                    [View All]   │
│  ────────────────────────────────────────────────────────────────────           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Date      Transaction    Type    Fee         Amount    Status            │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ May 14    SO-1847        Sale    5%          $125.00   Accrued           │  │
│  │ May 12    PO-234         PO      $50 fixed   $50.00    Accrued           │  │
│  │ May 8     SO-1823        Sale    5%          $87.50    Accrued           │  │
│  │ Apr 28    SO-1801        Sale    5%          $212.00   Paid (TXN-456)    │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ☐ Show paid credits                                                            │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Balance prominently displayed with Quick Payout button
- Relationships grid shows linked customers/vendors
- Credit history shows accrued vs. paid status
- Links to transaction ledger for payouts

---

## 3. Customer Profile with Referee Relationship

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Customer: Rich Star Foods                                           [Edit] [×]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Balance: $1,250.00   Credit Limit: $5,000.00   Tags: [Premium] [Wholesale]   │
│                                                                                  │
│  Referee Relationship                                                            │
│  ────────────────────────────────────────────────────────────────────           │
│  Referred by: John Martinez (john@example.com)                                  │
│  Fee structure: 5% of sale total                                                │
│  Apply by default: ☑  Active: ☑                                                 │
│  Total credits generated: $2,340.00                                             │
│                                                                         [Edit]  │
│                                                                                  │
│  Recent Orders                                                                   │
│  ────────────────────────────────────────────────────────────────────           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Order #   Date      Total      Status      Referee Credit                │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ SO-1847   May 14    $2,500.00  Posted      $125.00 ☑                     │  │
│  │ SO-1823   May 8     $1,750.00  Fulfilled   $87.50 ☑                      │  │
│  │ SO-1801   Apr 28    $4,240.00  Fulfilled   $212.00 ☑                     │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Referee relationship shown as a profile section
- Recent orders show referee credit amount with checkbox indicator
- Quick edit for fee structure
- Total credits generated visible

---

## 4. Sales Workspace with Referee Checkbox

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ New Sale: Rich Star Foods                                                       │
│ Balance: $1,250.00  |  Referee: John Martinez (5%)                    [Close]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Order SO-1847  |  Draft                                                         │
│                                                                                  │
│  ☑ Log referee credit for John Martinez (5% = $125.00) ◄──────────────────     │
│      └─ Live-updates as order total changes                                     │
│                                                                                  │
│  Order Lines                                                                     │
│  ────────────────────────────────────────────────────────────────────           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Item               Qty    Unit Price   Subtotal   Packed  Inv  Pay/F-up  │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ Blue Dream 1oz     10     $200.00      $2,000.00  ☐      ☐    ☐         │  │
│  │ Sunset Sherbet     5      $100.00      $500.00    ☐      ☐    ☐         │  │
│  │ [+ Add line]                                                              │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  Order Total: $2,500.00                                                          │
│                                                                                  │
│  Actions: [Save Draft]  [Confirm Order]  [Cancel]                              │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Referee badge shown in header: "Referee: John Martinez (5%)"
- Checkbox near order header with live credit calculation
- Checkbox state saved with draft order
- Checked by default if `apply_by_default = true`
- Credit amount updates in real-time as order total changes

---

## 5. Purchase Order with Referee

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Purchase Order: PO-234                                                           │
│ Vendor: Green Valley Co.  |  Referee: John Martinez ($50 fixed)      [Close]   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ☑ Log referee credit for John Martinez ($50.00 fixed per PO)                  │
│                                                                                  │
│  Expected: May 20, 2026  |  Status: Draft                                       │
│                                                                                  │
│  PO Lines                                                                        │
│  ────────────────────────────────────────────────────────────────────           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Product         Category   Qty   Unit Cost   Subtotal   Ownership        │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ Indica Mix      Flower     25lb  $80.00      $2,000.00  Office           │  │
│  │ Sativa Premium  Flower     15lb  $120.00     $1,800.00  Consignment      │  │
│  │ [+ Add line]                                                              │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  PO Total: $3,800.00                                                             │
│                                                                                  │
│  Actions: [Save Draft]  [Confirm PO]  [Cancel]                                 │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Fixed-fee referee shown in header
- Checkbox doesn't show calculated amount (since it's fixed $50 regardless of PO total)
- Same pattern as sales workspace

---

## 6. Quick Ledger with Referee Payout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Transaction Ledger                                         [+ Receiving] [+ Paying]
│ Manual rows, workflow payments, PO payments, and referee payouts.                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ▼ Paying Ledger                                      3 posted    $835.50       │
│  ────────────────────────────────────────────────────────────────────           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ # Date    Type    Entity         Payment type    Amount  Method  Bucket  │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ 1 May 15  Referee John Martinez  Referee payout  450.00  Check   Acct.   │  │
│  │             │                                         ↑                    │  │
│  │             └─ Balance: $450.00 ──────────────────────┘                   │  │
│  │                                                                            │  │
│  │   Target: FIFO unpaid credits                                             │  │
│  │   Impact: Pays $450 of $450 balance; $0 remains        [✓ Commit]        │  │
│  │                                                                            │  │
│  │ 2 May 12  Vendor  Green Valley   Vendor payout   200.00  Cash    Office  │  │
│  │ 3 May 10  Vendor  Rich Harvest   Vendor payout   185.50  Wire    Acct.   │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- `Referee` added to entity type dropdown
- Referee dropdown shows current balance: "John Martinez ($450.00)"
- Payment type defaults to "Referee payout"
- Impact preview shows: "Pays $X of $Y balance; $Z remains"
- Uses same ledger grid as customer/vendor payments
- No special payout flow needed - just another ledger row

---

## 7. Add Referee Relationship Modal

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Add Referee Relationship                                             [×]        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Referee                                                                         │
│  [John Martinez ▼]  ← dropdown of all active referees                           │
│                                                                                  │
│  Link to                                                                         │
│  ○ Customer  [Rich Star Foods ▼]                                                │
│  ○ Vendor    [Choose vendor... ▼]                                               │
│                                                                                  │
│  Fee Structure                                                                   │
│  ────────────────────────────────────────────────────────────────────           │
│  Fee type:  [Percentage ▼]  ← options: Percentage | Fixed | Hybrid              │
│                                                                                  │
│  Percentage:  [5.00] %                                                           │
│  Fixed amount: $[___]  (disabled for Percentage type)                           │
│                                                                                  │
│  Behavior                                                                        │
│  ────────────────────────────────────────────────────────────────────           │
│  ☑ Apply by default (checkbox starts checked on new transactions)               │
│                                                                                  │
│  Notes                                                                           │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Referral agreement signed May 2026. Customer from John's network.        │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  [Cancel]                                              [Add Relationship]       │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Simple modal, follows existing TERP form patterns
- Fee type selector enables/disables relevant fields
- Apply by default checkbox controls transaction checkbox behavior
- Can be opened from Referee profile OR Customer/Vendor profile

---

## 8. Referee Credits Grid (Detailed View)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Referee Credits: John Martinez                                          [×]     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Filters: ○ All  ○ Accrued  ● Unpaid  ○ Paid  ○ Voided                         │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Date      Transaction  Type  Entity          Fee      Amount   Status    │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ May 14    SO-1847      Sale  Rich Star       5%       $125.00  Accrued   │  │
│  │ May 12    PO-234       PO    Green Valley    $50 fix  $50.00   Accrued   │  │
│  │ May 8     SO-1823      Sale  Rich Star       5%       $87.50   Accrued   │  │
│  │ May 6     SO-1812      Sale  Rich Star       5%       $62.50   Accrued   │  │
│  │ May 4     PO-228       PO    Green Valley    $50 fix  $50.00   Accrued   │  │
│  │ Apr 30    SO-1805      Sale  Rich Star       5%       $75.00   Accrued   │  │
│  │ Apr 28    SO-1801      Sale  Rich Star       5%       $212.00  Paid ✓    │  │
│  │           └─ Paid via TXN-456 on Apr 28                                  │  │
│  │ Apr 25    PO-220       PO    Green Valley    $50 fix  $50.00   Paid ✓    │  │
│  │ Apr 20    SO-1789      Sale  Rich Star       5%       $88.00   Paid ✓    │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  Unpaid total: $450.00  |  Paid total: $350.00  |  All-time: $800.00           │
│                                                                                  │
│  [Export CSV]  [Quick Payout]                                                   │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Filterable by status (accrued/paid/voided)
- Shows fee structure used for each credit
- Links to source transaction (PO or Sale)
- Paid credits show payment transaction link
- Totals at bottom for accounting

---

## 9. Dashboard KPI - Referee Obligations

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Dashboard                                                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Financial Health                                                                │
│  ────────────────────────────────────────────────────────────────────           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ Files       │  │ Receivables │  │ Payables    │  │ Referee     │           │
│  │             │  │             │  │             │  │ Obligations │           │
│  │  $45,230    │  │  $12,450    │  │  $8,340     │  │             │           │
│  │             │  │             │  │             │  │  $1,260.50  │ ← NEW     │
│  │  [View]     │  │  [View]     │  │  [View]     │  │  [View]     │           │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘           │
│                                                                                  │
│  └─ Click [View] → opens Referees view filtered to balance > 0                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Key Features**:
- New KPI card for total unpaid referee balances
- Clickable → drilldown to referees with balances
- Sits alongside other financial obligations
- Helps operators track payout liabilities

---

## Summary of UX Principles

### Integration with Row-Native Paradigm

1. **Referee is just another entity row**: Like customer/vendor, appears in grids
2. **Checkbox is inline state**: No modal/wizard for referee opt-in, just check/uncheck
3. **Balance tracking is visible**: Always shown in grids and profiles
4. **Payout is ledger-grid entry**: Uses existing Quick Ledger, no special flow
5. **Credits are rows that transition**: Accrued → Paid, like any other workflow state
6. **Selection-based actions**: Select credits → mark paid, select referee → payout
7. **Audit trail from row**: Every credit links to source PO/Sale and payment

### Consistency with Existing TERP Patterns

- ✓ Entity profile panels (same structure as Customer/Vendor)
- ✓ Grid views with filtering (same as Inventory/Sales)
- ✓ Inline checkbox state (like Packed/Inv Posted/Pay-F-up)
- ✓ Transaction ledger integration (referee = entity type)
- ✓ Command journal audit (all actions logged)
- ✓ Relationship management (similar to customer tags/notes)
- ✓ Balance tracking (like customer balance)

### Minimal Cognitive Load

- No new navigation paradigm
- No special "referral mode" or separate app section
- Referees appear where you'd expect (in entity lists, on transactions)
- Payout works exactly like vendor payment
- Checkbox is familiar pattern (like existing closeout checkboxes)

---

**End of UI Mockups**
