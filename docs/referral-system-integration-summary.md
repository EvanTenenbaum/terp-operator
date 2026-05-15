# Referral Credit System - Integration Summary

**Quick Reference**: How the referee system integrates elegantly into TERP Agro's existing architecture

---

## Core Concept

**Referees** are a new entity type (like customers/vendors) who earn credits when linked customers/vendors make transactions. The system uses TERP's existing patterns: entity profiles, transaction checkboxes, ledger grid, and command journal.

---

## Key Integration Points

### 1. Entity Model (Like Customers/Vendors)

```
Referees Table
├── Contact info (name, email, phone, tax ID)
├── Balance (current unpaid credits)
├── Lifetime earned (all-time total)
└── Payment preferences

Referee Relationships Table
├── Links referee → customer OR vendor
├── Fee structure (percentage, fixed, or hybrid)
└── Apply by default? (checkbox behavior)

Referee Credits Table
├── Individual credit accruals from POs/Sales
├── Links to source transaction
└── Status: accrued → paid → voided
```

**Pattern match**: Same structure as `customers`/`vendors` tables with balance tracking

---

### 2. Transaction Flow (Checkbox Pattern)

#### When Creating PO/Sale:

```typescript
// System checks for active referee relationship
const relationship = await getRefereeRelationship(entityType, entityId);

if (relationship && relationship.active) {
  // Show checkbox (checked by default if relationship.applyByDefault === true)
  <RefereeCheckbox
    relationship={relationship}
    transactionTotal={orderTotal}
    checked={applyByDefault}
    onChange={setLogRefereeCredit}
  />
  
  // Checkbox shows: "☑ Log referee credit for [Name] ([fee])"
  // Live-updates credit amount as total changes
}
```

#### On Transaction Post:

```typescript
if (logRefereeCredit && refereeRelationshipId) {
  const creditAmount = calculateRefereeCredit(
    transactionTotal,
    relationship.feeType,
    relationship.feePercentage,
    relationship.feeFixedAmount
  );
  
  // 1. Insert referee_credit row (status: 'accrued')
  // 2. Update referee.balance += creditAmount
  // 3. Update referee.lifetime_earned += creditAmount
  // 4. Store in transaction.referee_relationship_id
  // 5. Log command in journal
}
```

**Pattern match**: Like the `packed`, `inventoryPosted`, `paymentFollowup` checkboxes on sales orders

---

### 3. Payment via Quick Ledger (Existing Flow)

#### In QuickLedgerGrid Component:

```typescript
// Add 'referee' to existing entity types
type LedgerEntityType = 'customer' | 'vendor' | 'staff' | 'other' | 'referee';

// When referee selected:
const referees = reference.data?.referees ?? [];
// Dropdown shows: "John Martinez ($450.00)" ← balance visible

// Payment type defaults to 'referee_payout'
const transactionTypes = getTypesForEntity('paying', 'referee');

// Allocation shows: "FIFO unpaid credits" or "All accrued"
// Impact preview: "Pays $X of $Y balance; $Z remains"
```

#### On Ledger Row Commit:

```typescript
if (entityType === 'referee' && transactionType === 'referee_payout') {
  // 1. Create transaction ledger row
  // 2. Mark referee_credits as 'paid' (FIFO until amount exhausted)
  // 3. Update referee.balance -= amount
  // 4. Link referee_credits.paid_via_transaction_id
  // 5. Set referee_credits.paid_at timestamp
}
```

**Pattern match**: Exactly like vendor payments via `recordVendorPayment` command

---

### 4. UI Views (Existing Layout Pattern)

#### New Referees Grid View
- Route: `/referees`
- Navigation: Add "Referees" to side nav (beside Clients/Vendors)
- Component: Reuse `OperatorGrid` pattern from Customers/Vendors
- Columns: Name, Email, Phone, Relationships, Balance, Lifetime

#### Referee Profile Panel
- Opens from grid (like customer/vendor profile)
- Sections: Contact, Balance Summary, Relationships, Credit History
- Actions: Edit, Quick Payout, Add Relationship

#### Customer/Vendor Profile Extension
- Add "Referee Relationship" section
- Shows current referee (if any)
- Edit/Add/Remove relationship buttons

#### Sales Workspace Extension
- Badge in header: "Referee: [Name] ([fee])"
- Checkbox above order lines
- Live-updating credit amount

**Pattern match**: Uses existing `WorkspacePanel`, modal patterns, grid components

---

### 5. Backend Commands (Command Bus Pattern)

#### New Commands:

| Command | Min Role | Reversible? | Pattern |
|---------|----------|-------------|---------|
| `createReferee` | manager | No (terminal) | Like `createCustomer` |
| `updateReferee` | manager | No (terminal) | Like `updateCustomer` |
| `addRefereeRelationship` | manager | No (use deactivate) | New pattern |
| `updateRefereeRelationship` | manager | No (terminal) | New pattern |
| `deactivateRefereeRelationship` | manager | No (terminal) | Like `cancelPurchaseOrder` |
| `voidRefereeCredit` | owner | No (terminal) | Like `refundPayment` |

#### Modified Commands:

| Command | Modification | Impact |
|---------|-------------|--------|
| `postPurchaseOrder` | Check for `refereeRelationshipId`, accrue credit | Backward compatible (field optional) |
| `confirmSalesOrder` | Check for `refereeRelationshipId`, accrue credit | Backward compatible |
| `postTransactionLedgerRow` | Add `referee` entity type, handle payout | Extends existing logic |
| Reversal commands | Void referee credit when reversing transaction | New cleanup logic |

**Pattern match**: Follows existing command journal, RBAC, reversal policy architecture

---

### 6. Database Schema (Relational Integrity)

```sql
-- New tables reference existing entities polymorphically
referee_relationships
  ├── referee_id → referees.id
  └── entity_id → customers.id OR vendors.id (polymorphic)
                  (enforced by entity_type column)

referee_credits
  ├── referee_id → referees.id
  ├── referee_relationship_id → referee_relationships.id
  └── transaction_id → purchase_orders.id OR sales_orders.id
                       (enforced by transaction_type column)

-- Existing tables get optional FK
sales_orders.referee_relationship_id → referee_relationships.id
purchase_orders.referee_relationship_id → referee_relationships.id
```

**Pattern match**: Like how `batches.vendorId` links to `vendors.id`, but polymorphic for customer/vendor

---

### 7. Query Integration (Reference Data Pattern)

#### Extend `reference` Query:

```typescript
reference: protectedProcedure.query(async () => {
  const referees = await pool.query(
    'SELECT id, name, balance, active FROM referees WHERE active ORDER BY name'
  );
  
  const refereeRelationships = await pool.query(
    `SELECT rr.id, rr.referee_id, r.name as referee_name,
            rr.entity_type, rr.entity_id, rr.fee_type,
            rr.fee_percentage, rr.fee_fixed_amount, rr.apply_by_default
     FROM referee_relationships rr
     JOIN referees r ON r.id = rr.referee_id
     WHERE rr.active`
  );
  
  return {
    // ... existing reference data ...
    referees: referees.rows,
    refereeRelationships: refereeRelationships.rows
  };
});
```

**Pattern match**: Like how `customers`, `vendors`, `items` are loaded in reference query

---

### 8. Fee Calculation (Pure Function)

```typescript
function calculateRefereeCredit(
  transactionTotal: number,
  feeType: 'percentage' | 'fixed' | 'hybrid',
  feePercentage: number | null,
  feeFixedAmount: number | null
): number {
  switch (feeType) {
    case 'percentage':
      return round(transactionTotal * (feePercentage / 100), 2);
    case 'fixed':
      return feeFixedAmount;
    case 'hybrid':
      return round(transactionTotal * feePercentage / 100, 2) + feeFixedAmount;
  }
}
```

**Pattern match**: Like existing pricing calculation functions, can be shared client/server

---

## What Makes This "Elegant"

### 1. **Zero New Paradigms**
- Referee is just another entity type
- Checkbox is same pattern as packed/inv-posted
- Payout uses existing Quick Ledger
- Balance tracking like customer balance
- Command journal logs everything

### 2. **Minimal New Surfaces**
- 1 new grid view (Referees)
- 1 new profile panel (Referee)
- 1 new section in customer/vendor profiles
- 1 new checkbox in PO/Sale workspaces
- 1 new entity type in Quick Ledger dropdown

### 3. **Backward Compatible**
- All referee fields optional on existing tables
- Existing POs/Sales work without referee data
- No breaking changes to existing commands
- Migration is additive only

### 4. **Follows Row-Native Philosophy**
- Credits are rows that transition (accrued → paid)
- Checkbox state is inline, visible, saved with draft
- Balance is a visible column
- Payout is ledger-grid entry, not a modal flow
- Selection-based actions (select credits → mark paid)

### 5. **Leverages Existing Infrastructure**
- Command bus for all mutations
- Command journal for audit trail
- RBAC via existing role system
- Transaction ledger for money movement
- Query router for reference data
- AG Grid for all table displays

---

## Implementation Checklist

### Phase 1: Core Entity (1-2 days)
- [ ] Run migration SQL (create tables)
- [ ] Add Drizzle schema definitions
- [ ] Create `createReferee`, `updateReferee` commands
- [ ] Build Referees grid view
- [ ] Build Referee profile panel
- [ ] Add to reference query

### Phase 2: Relationships (1 day)
- [ ] Create `addRefereeRelationship`, `updateRefereeRelationship` commands
- [ ] Add referee section to Customer/Vendor profiles
- [ ] Build relationship form modal
- [ ] Add referee relationships to reference query

### Phase 3: Transaction Integration (2 days)
- [ ] Modify `sales_orders` and `purchase_orders` schema
- [ ] Create `referee_credits` table
- [ ] Add RefereeCheckbox component
- [ ] Integrate checkbox into Sales workspace
- [ ] Integrate checkbox into Intake/PO view
- [ ] Modify `postPurchaseOrder` command to accrue credits
- [ ] Modify `confirmSalesOrder` command to accrue credits

### Phase 4: Payout (1 day)
- [ ] Add `referee` entity type to QuickLedgerGrid
- [ ] Add "Referee payout" transaction type to seed
- [ ] Modify `postTransactionLedgerRow` for referee payouts
- [ ] Implement FIFO credit marking logic
- [ ] Test full payout flow

### Phase 5: Credit Management (1 day)
- [ ] Build referee credits grid/history
- [ ] Create `voidRefereeCredit` command
- [ ] Add credit status filters
- [ ] Add payout history to profile
- [ ] Dashboard KPI card

### Phase 6: Reversal & Polish (1 day)
- [ ] Reversal logic for voided POs/Sales
- [ ] Validation error messages
- [ ] Help text and tooltips
- [ ] E2E test for full flow
- [ ] CSV export

**Total estimate**: 7-8 days for full implementation

---

## Testing Strategy

### Unit Tests
- Credit calculation function (all fee types)
- Validation logic (fee structure, balance checks)
- FIFO credit selection algorithm

### Integration Tests
- Create referee → add relationship → create PO → verify credit accrued
- Create sale with referee → post sale → verify balance updated
- Payout referee → verify credits marked paid, balance decreased
- Void PO → verify credit voided, balance adjusted

### E2E Test (Playwright)
1. Create referee "Test Referee"
2. Link to customer "Rich Star Foods" at 5%
3. Create sale for $1,000
4. Check referee checkbox (should show $50)
5. Post sale
6. Navigate to Referees view
7. Verify balance = $50
8. Open Quick Ledger
9. Pay referee $50
10. Verify balance = $0, credit marked paid

### Manual QA Checklist
- [ ] Checkbox defaults correctly based on `apply_by_default`
- [ ] Credit amount updates live as order total changes
- [ ] Cannot pay more than balance
- [ ] Payout shows in referee credit history with link
- [ ] Reversal voids credit and adjusts balance
- [ ] Multiple relationships per referee work correctly
- [ ] Hybrid fee calculation is accurate
- [ ] Dashboard KPI matches sum of referee balances

---

## Open Design Decisions

### 1. Credit Accrual Timing (POs)
**Option A**: Accrue on PO confirmation (`status = 'ordered'`)  
**Option B**: Accrue on receipt posting  

**Recommendation**: Option A  
**Rationale**: Referee credit is earned when the deal is made (PO placed), not when product arrives. Aligns with when vendor relationship is established.

### 2. Credit Accrual Timing (Sales)
**Option A**: Accrue on sale confirmation  
**Option B**: Accrue on sale posting (inventory allocated)  

**Recommendation**: Option B  
**Rationale**: Aligns with revenue recognition. Sale isn't "real" until inventory is allocated and invoice created.

### 3. Multiple Referees
**Option A**: Allow multiple active relationships per entity  
**Option B**: Enforce single active relationship (can change over time)  

**Recommendation**: Option B  
**Rationale**: Avoids ambiguity, simplifies UI. Unique index enforces this. If referee changes, deactivate old, add new.

### 4. Partial Payouts
**Option A**: Must pay full balance  
**Option B**: Allow partial payouts (FIFO credit marking)  

**Recommendation**: Option B  
**Rationale**: Cash flow flexibility. Mark oldest credits first until amount exhausted.

### 5. Manual Credit Adjustments
**Option A**: Phase 1 scope  
**Option B**: Phase 2 feature  

**Recommendation**: Option B (add `adjustRefereeBalance` command later)  
**Rationale**: Covers edge cases (disputes, goodwill, corrections) but not critical for MVP.

---

## Success Metrics

### MVP Launch (Phase 1-4)
- ✅ Operator can create referee with contact info
- ✅ Operator can link referee to customer with 5% fee
- ✅ Sale for that customer shows checkbox with calculated credit
- ✅ Posting sale accrues credit to referee balance
- ✅ Quick Ledger shows referee entity type
- ✅ Payout decreases balance and marks credits paid

### Full Feature (Phase 1-6)
- ✅ Reversal voids credits correctly
- ✅ Dashboard shows referee obligations KPI
- ✅ Export referee credits to CSV
- ✅ All commands logged in audit journal
- ✅ E2E test passes
- ✅ No existing tests broken

### Business Value
- 📈 Track referee performance (credits generated)
- 💰 Accurate payout tracking (no manual spreadsheets)
- 🔍 Full audit trail (who, when, why)
- ⚡ Fast workflow (checkbox + ledger grid, no modals)
- 🧩 Fits TERP paradigm (rows, grids, selection)

---

## Related Documents

- **Full Design**: `referral-credit-system-design.md` (detailed spec)
- **UI Mockups**: `referral-system-ui-mockups.md` (visual examples)
- **Migration SQL**: `referral-system-migration.sql` (database schema)
- **Type Definitions**: `referral-system-types.ts` (TypeScript types)

---

**Next Steps**: 
1. Review with Evan, confirm business logic decisions
2. Run migration on dev database
3. Implement Phase 1 (core entity)
4. Demo to get feedback before continuing phases

---

**End of Integration Summary**
