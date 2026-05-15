# Referral Credit System Design

**Date**: 2026-05-15  
**Status**: Design proposal  
**Target**: Integrate referee credits into TERP Agro's transaction and ledger system

---

## Business Requirements Summary

- **Referees** are a first-class entity type (like customers/vendors)
- **Relationships**: Referees link to customers or vendors with a fee structure
- **Fee structure**: Percentage OR fixed dollar amount per transaction
- **Transaction opt-in**: Checkbox on PO/Sale to mark as "referral transaction" (can be checked by default)
- **Balance tracking**: Referees accumulate credits; balance shown in profile
- **Payout**: Pay referees through existing Quick Ledger (treat like vendor payments)
- **Configuration**: Manage referee relationships in either referee profile OR referred entity profile

---

## 1. Data Model

### New Tables

#### `referees`
Primary entity table for referee tracking.

```sql
CREATE TABLE referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  email varchar(240),
  phone varchar(80),
  tax_id varchar(80),  -- for 1099 reporting
  balance numeric(12,2) NOT NULL DEFAULT 0,  -- accumulated unpaid credits
  lifetime_earned numeric(12,2) NOT NULL DEFAULT 0,  -- total all-time earnings
  payment_method varchar(32) DEFAULT 'check',  -- preferred payout method
  payment_details text,  -- account info, address, etc.
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX referees_active_idx ON referees(active);
CREATE INDEX referees_balance_idx ON referees(balance) WHERE balance > 0;
```

#### `referee_relationships`
Links referee to customer/vendor with fee structure.

```sql
CREATE TABLE referee_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id uuid NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
  entity_type varchar(16) NOT NULL,  -- 'customer' | 'vendor'
  entity_id uuid NOT NULL,  -- polymorphic: customers.id OR vendors.id
  
  -- Fee structure (one or both can be set)
  fee_type varchar(16) NOT NULL DEFAULT 'percentage',  -- 'percentage' | 'fixed' | 'hybrid'
  fee_percentage numeric(5,2),  -- e.g., 5.00 for 5%
  fee_fixed_amount numeric(12,2),  -- e.g., 25.00 for $25/transaction
  
  -- Behavior
  apply_by_default boolean NOT NULL DEFAULT true,  -- checkbox starts checked
  active boolean NOT NULL DEFAULT true,
  
  notes text,
  effective_from timestamp with time zone,
  effective_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  CONSTRAINT referee_relationships_entity_check CHECK (
    entity_type IN ('customer', 'vendor')
  )
);

CREATE INDEX referee_relationships_referee_idx ON referee_relationships(referee_id);
CREATE INDEX referee_relationships_entity_idx ON referee_relationships(entity_type, entity_id);
CREATE UNIQUE INDEX referee_relationships_active_unique 
  ON referee_relationships(referee_id, entity_type, entity_id) 
  WHERE active = true;  -- one active relationship per referee+entity pair
```

#### `referee_credits`
Ledger of individual credit accruals from transactions.

```sql
CREATE TABLE referee_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id uuid NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
  referee_relationship_id uuid NOT NULL REFERENCES referee_relationships(id) ON DELETE CASCADE,
  
  -- Source transaction
  transaction_type varchar(32) NOT NULL,  -- 'purchase_order' | 'sales_order'
  transaction_id uuid NOT NULL,  -- purchase_orders.id OR sales_orders.id
  transaction_no varchar(80) NOT NULL,  -- PO-XXX or SO-XXX
  transaction_total numeric(12,2) NOT NULL,
  
  -- Credit calculation
  fee_type varchar(16) NOT NULL,
  fee_percentage numeric(5,2),
  fee_fixed_amount numeric(12,2),
  credit_amount numeric(12,2) NOT NULL,  -- calculated credit
  
  -- Payment tracking
  status varchar(32) NOT NULL DEFAULT 'accrued',  -- 'accrued' | 'paid' | 'voided'
  paid_via_transaction_id uuid,  -- links to transaction ledger payment
  paid_at timestamp with time zone,
  voided_at timestamp with time zone,
  voided_reason text,
  
  command_id uuid,  -- links to command_journal
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX referee_credits_referee_idx ON referee_credits(referee_id);
CREATE INDEX referee_credits_status_idx ON referee_credits(status);
CREATE INDEX referee_credits_transaction_idx ON referee_credits(transaction_type, transaction_id);
```

### Schema Modifications to Existing Tables

#### `sales_orders`
Add referee relationship tracking.

```sql
ALTER TABLE sales_orders 
  ADD COLUMN referee_relationship_id uuid REFERENCES referee_relationships(id) ON DELETE SET NULL,
  ADD COLUMN referee_credit_amount numeric(12,2);  -- denormalized for quick display

CREATE INDEX sales_orders_referee_idx ON sales_orders(referee_relationship_id);
```

#### `purchase_orders`
Add referee relationship tracking.

```sql
ALTER TABLE purchase_orders 
  ADD COLUMN referee_relationship_id uuid REFERENCES referee_relationships(id) ON DELETE SET NULL,
  ADD COLUMN referee_credit_amount numeric(12,2);

CREATE INDEX purchase_orders_referee_idx ON purchase_orders(referee_relationship_id);
```

---

## 2. Transaction Flow

### Purchase Order Flow

```
Operator starts new PO for Vendor X
    ↓
System checks: does Vendor X have active referee relationship?
    ↓ YES
Load referee relationship
    ↓
Display checkbox: "☑ Log referee credit for [Referee Name] ([fee structure])"
    - Checked by default if apply_by_default = true
    - Shows calculated credit amount as PO total updates
    ↓
Operator confirms PO (postPurchaseOrder command)
    ↓
IF referee checkbox is checked:
    1. Insert row into referee_credits (status: 'accrued')
    2. Update referees.balance += credit_amount
    3. Update referees.lifetime_earned += credit_amount
    4. Update purchase_orders.referee_relationship_id and referee_credit_amount
    5. Log in command journal
    ↓
Referee balance increases; shows in Referees view
```

### Sales Order Flow

```
Operator starts new Sale for Customer Y
    ↓
System checks: does Customer Y have active referee relationship?
    ↓ YES
Load referee relationship
    ↓
Display in order workspace: "☑ Log referee credit for [Referee Name] ([fee structure])"
    ↓
Operator posts sale (confirmSalesOrder command)
    ↓
IF referee checkbox is checked:
    1. Insert row into referee_credits (status: 'accrued')
    2. Update referees.balance += credit_amount
    3. Update referees.lifetime_earned += credit_amount
    4. Update sales_orders.referee_relationship_id and referee_credit_amount
    5. Log in command journal
    ↓
Referee balance increases
```

### Referee Payout Flow

```
Operator opens Quick Ledger (Payments view)
    ↓
Add new "Paying" ledger row:
    - Entity type: referee
    - Entity: [Choose from referees dropdown, shows balance]
    - Payment type: "Referee payout"
    - Amount: (enter amount, warns if > balance)
    - Method: cash/check/wire/etc.
    - Bucket: accounting
    ↓
Commit ledger row (postTransactionLedgerRow command)
    ↓
1. Create payment in transaction ledger
2. Mark referee_credits as 'paid' (FIFO or selected)
3. Update referees.balance -= amount
4. Link referee_credits.paid_via_transaction_id
5. Set referee_credits.paid_at
    ↓
Referee balance decreases; credits show as paid
```

---

## 3. Fee Calculation Logic

### Fee Types

1. **Percentage**: `credit_amount = transaction_total * (fee_percentage / 100)`
2. **Fixed**: `credit_amount = fee_fixed_amount`
3. **Hybrid**: `credit_amount = (transaction_total * fee_percentage / 100) + fee_fixed_amount`

### Example Calculations

**Scenario 1**: PO for $1,000, referee has 5% fee
```
credit_amount = 1000 * 0.05 = $50.00
```

**Scenario 2**: Sale for $2,500, referee has $100 fixed fee
```
credit_amount = $100.00
```

**Scenario 3**: PO for $800, referee has 3% + $25 fixed
```
credit_amount = (800 * 0.03) + 25 = $24 + $25 = $49.00
```

---

## 4. UI/UX Integration

### New Views

#### Referees View (`/referees`)
Grid showing all referees, similar to Customers/Vendors view.

**Columns**:
- Name
- Email / Phone
- Active relationships count
- Balance (unpaid credits)
- Lifetime earned
- Last payout date
- Status (Active/Inactive)

**Actions**:
- Add referee
- Edit referee
- View referee profile
- Quick payout (opens ledger)

#### Referee Profile Panel
Opens from referees grid or from customer/vendor profile.

**Sections**:
1. **Contact Info**: name, email, phone, tax ID
2. **Payment Info**: preferred method, account details
3. **Balance Summary**: 
   - Current balance
   - Lifetime earned
   - Last payout
4. **Relationships**: Grid of linked customers/vendors
   - Entity type, entity name, fee structure, active status
   - Add/edit/deactivate relationship
5. **Credit History**: Grid of all referee_credits
   - Date, transaction, type, amount, status
6. **Payout History**: Links to transaction ledger rows

### Modified Views

#### Customer Profile
Add "Referee Relationship" section:
- Current referee (if any)
- Fee structure
- Toggle active
- Edit/remove relationship
- Button: "Add referee relationship"

#### Vendor Profile
Same as customer profile.

#### Sales Workspace
When customer has active referee relationship:
- Show referee badge/chip near customer name: "Referee: [Name] (5%)"
- Checkbox in order header: "☑ Log referee credit for [Name]"
- Live-update credit amount as order total changes
- Saves checkbox state with draft order

#### Intake/PO View
Same pattern as sales workspace for vendor referee relationships.

#### Quick Ledger (Payments)
Add `referee` to entity type dropdown (alongside customer, vendor, staff, other).

When `referee` selected:
- Dropdown shows all referees with balances
- Shows current balance beside name: "John Doe ($450.00)"
- Payment type defaults to "Referee payout"
- Allocation target shows: "FIFO unpaid credits" or "All accrued"
- Impact preview: "Pays $X of $Y balance; $Z remains"

#### Dashboard
Add KPI card:
- **Referee Obligations**: $X total unpaid referee balances
- Drilldown: opens Referees view filtered to balance > 0

---

## 5. Backend Command Integration

### New Commands

#### `createReferee`
**Params**: `{ name, email, phone, taxId, paymentMethod, paymentDetails, notes }`  
**Effect**: Insert into `referees` table  
**Min role**: manager

#### `updateReferee`
**Params**: `{ refereeId, ...fields }`  
**Effect**: Update referee record  
**Min role**: manager

#### `addRefereeRelationship`
**Params**: `{ refereeId, entityType, entityId, feeType, feePercentage, feeFixedAmount, applyByDefault, notes }`  
**Effect**: Insert into `referee_relationships`, deactivate any existing active relationship for same referee+entity  
**Min role**: manager

#### `updateRefereeRelationship`
**Params**: `{ relationshipId, ...fields }`  
**Effect**: Update relationship record  
**Min role**: manager

#### `deactivateRefereeRelationship`
**Params**: `{ relationshipId }`  
**Effect**: Set `active = false`, set `effective_until = now()`  
**Min role**: manager

#### `voidRefereeCredit`
**Params**: `{ creditId, reason }`  
**Effect**: 
1. Mark credit as voided
2. Reverse referee balance adjustment
3. Update transaction to clear referee fields  
**Min role**: owner  
**Reversible**: No (terminal)

### Modified Commands

#### `postPurchaseOrder`
**New logic**:
1. Check if PO has `referee_relationship_id`
2. If yes, calculate credit using relationship fee structure
3. Insert `referee_credits` row
4. Update `referees.balance` and `lifetime_earned`
5. Store in `purchase_orders.referee_credit_amount`

**Reversal**: Void referee credit when PO reversed

#### `confirmSalesOrder` / `postSalesOrder`
Same pattern as `postPurchaseOrder`.

#### `postTransactionLedgerRow`
**New entity type**: `referee`  
**New transaction type**: `referee_payout`

**Logic**:
1. Validate referee exists and amount <= balance
2. Create transaction ledger row
3. Mark referee_credits as paid (FIFO or explicit selection)
4. Update referee.balance -= amount
5. Link `referee_credits.paid_via_transaction_id`

**Reversal**: Unmark credits as paid, restore balance

### Query Integration

#### `reference` query
Add to return payload:
```typescript
{
  referees: Array<{ id, name, balance, active }>,
  refereeRelationships: Array<{ id, refereeId, refereeName, entityType, entityId, feeType, feePercentage, feeFixedAmount, applyByDefault, active }>
}
```

#### New `refereeProfile` query
**Input**: `{ refereeId }`  
**Returns**: Full referee details + relationships + credit history + payout history

#### New `refereeCredits` query
**Input**: `{ refereeId?, status? }`  
**Returns**: Grid of referee credits with filtering

---

## 6. Migration & Seed Strategy

### Migration Order

1. **0004_referee_system.sql**:
   - Create `referees` table
   - Create `referee_relationships` table
   - Create `referee_credits` table
   - Add columns to `sales_orders` and `purchase_orders`

2. **Seed Data**:
   - Add 2-3 sample referees
   - Link one referee to a customer with 5% fee
   - Link one referee to a vendor with $50 fixed fee

### Backward Compatibility

- All referee fields nullable or have defaults
- Existing POs/Sales continue to work without referee data
- Referee features opt-in via relationships

---

## 7. Validation & Business Rules

### Referee Relationships
- ✓ Only one active relationship per referee+entity pair
- ✓ Fee structure must have at least one of: percentage OR fixed amount
- ✓ Percentage must be 0.01-100.00
- ✓ Fixed amount must be >= 0
- ✓ Cannot delete referee with unpaid balance > 0 (must pay out first)
- ✓ Cannot delete relationship with accrued unpaid credits

### Transaction Credit Accrual
- ✓ Only create credit if transaction status is confirmed/posted
- ✓ Void credit if transaction is cancelled/reversed
- ✓ Credit amount always >= 0
- ✓ Store snapshot of fee structure (in case relationship changes later)

### Payouts
- ✓ Cannot pay more than current balance
- ✓ Manager/owner role required
- ✓ Must specify which credits are being paid (FIFO default)
- ✓ Payment generates audit trail in command journal

---

## 8. Reporting & Audit

### Referee Dashboard (future enhancement)
- Total referees
- Active relationships
- Total unpaid balance
- Total paid this period
- Top referees by lifetime earnings

### Export Capabilities
- Referee credits CSV (for accounting)
- 1099 report preparation (if tax IDs collected)
- Payout history per referee

### Command Journal Integration
All referee operations logged:
- Create/update referee
- Add/modify/deactivate relationship
- Credit accrual (links to PO/Sale)
- Payout (links to transaction ledger)
- Void credit

---

## 9. Row-Native Paradigm Fit

### How This Fits TERP's Philosophy

1. **Rows as working memory**:
   - Referee relationships are rows in entity profiles
   - Credits are rows that accrue and get marked paid
   - Checkbox on PO/Sale is inline row state

2. **Selection-based actions**:
   - Select referee credits → mark as paid
   - Select referee → quick payout
   - Select customer/vendor → add referee relationship

3. **Visible status cells**:
   - Balance column in referees grid
   - Status column in credits (accrued/paid/voided)
   - Checkbox state on transactions

4. **Ledger-grid money entry**:
   - Referee payouts use existing Quick Ledger
   - No separate payout modal or flow
   - Just another entity type in the ledger

5. **Audit trail from row**:
   - Every credit links to source PO/Sale
   - Every payout links to ledger transaction
   - Reversal available from command journal

---

## 10. Implementation Sequence

### Phase 1: Core Entity & Relationships (P0)
- [ ] Create database tables
- [ ] Add `createReferee`, `updateReferee` commands
- [ ] Add `addRefereeRelationship`, `updateRefereeRelationship` commands
- [ ] Build Referees grid view
- [ ] Build Referee profile panel
- [ ] Add referee relationship section to Customer/Vendor profiles
- [ ] Add `referees` and `refereeRelationships` to reference query

### Phase 2: Transaction Integration (P0)
- [ ] Modify `sales_orders` and `purchase_orders` tables
- [ ] Create `referee_credits` table
- [ ] Add referee checkbox to Sales workspace
- [ ] Add referee checkbox to Intake/PO view
- [ ] Modify `postPurchaseOrder` to accrue credits
- [ ] Modify `confirmSalesOrder` to accrue credits
- [ ] Show referee credit amount in transaction grids

### Phase 3: Payout & Ledger Integration (P0)
- [ ] Add `referee` entity type to Quick Ledger
- [ ] Add "Referee payout" transaction type
- [ ] Modify `postTransactionLedgerRow` to handle referee payouts
- [ ] Build referee balance tracking
- [ ] Link credits to ledger payments (FIFO)
- [ ] Show referee balance in referees grid and profiles

### Phase 4: Credit Management (P1)
- [ ] Build referee credits grid/history view
- [ ] Add `voidRefereeCredit` command
- [ ] Add credit status filters
- [ ] Add payout history to referee profile
- [ ] Dashboard KPI for referee obligations

### Phase 5: Reversal & Polish (P1)
- [ ] Reversal logic for voided POs/Sales
- [ ] Reversal logic for refunded payments
- [ ] Validation error messages
- [ ] CSV export for referee credits
- [ ] Help text and legends

---

## 11. Open Questions / Decisions Needed

1. **Credit timing**: Accrue on PO creation or on receipt posting?
   - **Recommendation**: On PO confirmation (when `status = 'ordered'`), before receipt
   - **Rationale**: Referee credit earned when deal is made, not when product arrives

2. **Sales credit timing**: On draft, confirmed, or posted?
   - **Recommendation**: On posted (when inventory allocated and invoice created)
   - **Rationale**: Aligns with when revenue is recognized

3. **Partial payouts**: Allow paying less than full balance?
   - **Recommendation**: Yes, mark credits as paid FIFO until amount exhausted
   - **Rationale**: Flexibility for cash flow management

4. **Multiple referees per entity**: Allow or enforce single?
   - **Recommendation**: Single active relationship per entity (enforced by unique index)
   - **Rationale**: Avoids ambiguity; can change referee over time but only one active

5. **Credit adjustment/correction**: Allow manual credit entries?
   - **Recommendation**: Phase 2 feature - add `adjustRefereeBalance` command for one-off corrections
   - **Rationale**: Handles edge cases, disputes, goodwill credits

6. **Referee self-service portal**: Future scope?
   - **Recommendation**: Not in initial scope; can add read-only portal later
   - **Rationale**: Focus on operator workflow first

---

## 12. Success Criteria

**Operator can**:
- ✓ Create a referee with contact and payment info
- ✓ Link referee to customer with 5% fee
- ✓ Start new sale for that customer
- ✓ See checkbox "Log referee credit for [Name] (5%)"
- ✓ Post sale with checkbox checked
- ✓ See referee balance increase by 5% of sale total
- ✓ Open Quick Ledger, select referee entity type
- ✓ Choose referee, see balance, enter payout amount
- ✓ Post payout, see referee balance decrease
- ✓ View referee profile showing paid credit history

**Audit trail shows**:
- ✓ Referee created by [Manager] on [date]
- ✓ Relationship added to Customer X on [date]
- ✓ Credit accrued from Sale SO-123 for $50 on [date]
- ✓ Credit paid via transaction ledger TXN-456 on [date]

**System enforces**:
- ✓ Cannot delete referee with unpaid balance
- ✓ Cannot pay more than current balance
- ✓ Credit calculation matches fee structure
- ✓ Reversal of transaction voids credit and adjusts balance

---

## End of Design Document

**Next Steps**: Review with Evan, refine fee calculation rules, implement Phase 1.
