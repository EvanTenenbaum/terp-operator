# Payment Processor System Design

**Date:** 2026-05-17  
**Status:** Approved  
**Pattern:** Mirrors Referee System with key adaptations for payment processing

## Problem

The user needs to accept crypto payments and process crypto cashouts, working with third-party payment processors who handle KYC and conversion. Processing fees are charged on each transaction and must be split between the user (Terp Operator) and the processor. The system needs to:

1. Track variable processing fees per transaction
2. Split fees between user and processor according to configurable ratios
3. Track whether user has collected their fee share (default: should be received with fiat transfer)
4. Track whether processor's fee share is settled (default: already paid/deducted)
5. Support multiple processors for different payment types (crypto, check, wire, etc.)
6. Integrate cleanly with existing Quick Ledger transaction entry
7. Provide dedicated processor management and fee tracking

## Solution

Implement a Payment Processor system modeled after the existing Referee system, with key differences:
- **Default fee status:** processor fees default to "paid" (already deducted), user fees default to "collectible" (expected to receive)
- **Fee deduction:** fees are deducted from transaction amount (not added on top)
- **Dual tracking:** track both user's share (collectible/collected) and processor's share (paid/unpaid)
- **Multi-type support:** processors can handle crypto, check, wire, or other payment types

## Architecture

### Schema Design

**New Tables:**

#### payment_processors

Stores payment processor entities and their default fee structures.

```sql
CREATE TABLE payment_processors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  processor_type varchar(32) NOT NULL,  -- 'crypto', 'check', 'wire', etc.
  fee_type varchar(16) NOT NULL DEFAULT 'hybrid',  -- 'percentage', 'fixed', 'hybrid'
  fee_percentage numeric(5, 2),  -- e.g., 3.50 means 3.5%
  fee_fixed_amount numeric(12, 2),  -- e.g., 0.30
  default_user_split numeric(5, 2) NOT NULL,  -- e.g., 25.00 means 25%
  default_processor_split numeric(5, 2) NOT NULL,  -- e.g., 75.00 means 75%
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_processors_type_idx ON payment_processors(processor_type);
CREATE INDEX payment_processors_active_idx ON payment_processors(active);
```

**Fee Formula Examples:**
- Percentage only: `feeType = 'percentage'`, `feePercentage = 3.5` → 3.5% of transaction
- Fixed only: `feeType = 'fixed'`, `feeFixedAmount = 2.00` → flat $2.00 per transaction
- Hybrid: `feeType = 'hybrid'`, `feePercentage = 2.5`, `feeFixedAmount = 0.30` → 2.5% + $0.30

**Split Examples:**
- `defaultUserSplit = 25`, `defaultProcessorSplit = 75` → user gets 25% of fee, processor gets 75%

#### processor_fees

Tracks each processing fee from every transaction.

```sql
CREATE TABLE processor_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_id uuid NOT NULL REFERENCES payment_processors(id) ON DELETE CASCADE,
  
  -- Transaction reference
  transaction_type varchar(32) NOT NULL,  -- 'payment', 'vendor_payment'
  transaction_id uuid NOT NULL,
  transaction_no varchar(80) NOT NULL,
  
  -- Amounts
  transaction_amount numeric(12, 2) NOT NULL,  -- Gross amount (before fees)
  processing_fee_total numeric(12, 2) NOT NULL,  -- Total fee charged
  user_fee_share numeric(12, 2) NOT NULL,  -- User's portion of fee
  processor_fee_share numeric(12, 2) NOT NULL,  -- Processor's portion of fee
  
  -- User's fee collection tracking
  user_fee_status varchar(16) NOT NULL DEFAULT 'collectible',  -- 'collectible', 'collected'
  user_fee_collected_at timestamptz,
  
  -- Processor's fee settlement tracking
  processor_fee_status varchar(16) NOT NULL DEFAULT 'paid',  -- 'paid', 'unpaid'
  processor_fee_paid_at timestamptz,
  processor_fee_paid_via uuid,  -- FK to payment if settled separately
  
  command_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX processor_fees_processor_idx ON processor_fees(processor_id);
CREATE INDEX processor_fees_transaction_idx ON processor_fees(transaction_type, transaction_id);
CREATE INDEX processor_fees_user_status_idx ON processor_fees(user_fee_status);
CREATE INDEX processor_fees_processor_status_idx ON processor_fees(processor_fee_status);
CREATE INDEX processor_fees_balance_calc_idx ON processor_fees(processor_id, user_fee_status, processor_fee_status);
```

**Status Meanings:**
- `user_fee_status`:
  - `collectible`: User should receive this fee share with the fiat transfer (default)
  - `collected`: User confirmed they received their fee share
- `processor_fee_status`:
  - `paid`: Processor already deducted their share (default)
  - `unpaid`: Processor's share needs to be settled separately

**Modified Tables:**

```sql
-- Add processor references and fee tracking to payments
ALTER TABLE payments
  ADD COLUMN processor_id uuid REFERENCES payment_processors(id) ON DELETE SET NULL,
  ADD COLUMN processor_fee_id uuid REFERENCES processor_fees(id) ON DELETE SET NULL;

CREATE INDEX payments_processor_idx ON payments(processor_id);
CREATE INDEX payments_processor_fee_idx ON payments(processor_fee_id);

-- Add processor fee reference to vendor_payments
ALTER TABLE vendor_payments
  ADD COLUMN processor_fee_id uuid REFERENCES processor_fees(id) ON DELETE SET NULL;

CREATE INDEX vendor_payments_processor_fee_idx ON vendor_payments(processor_fee_id);

-- Make customerId nullable to support processor payments
ALTER TABLE payments
  ALTER COLUMN customer_id DROP NOT NULL;
```

**New Transaction Types:**

```sql
INSERT INTO transaction_types (slug, label, direction, allowed_entity_types, default_method, default_bucket, is_system)
VALUES
  ('crypto_payment_in', 'Crypto payment (customer)', 'receiving', ARRAY['customer'], 'crypto', 'crypto-wallet', true),
  ('crypto_cashout', 'Crypto cashout (to customer)', 'paying', ARRAY['customer'], 'crypto', 'crypto-wallet', true),
  ('check_payment_in', 'Check payment (customer)', 'receiving', ARRAY['customer'], 'check', 'cash-file-a', true),
  ('processor_fee_settlement', 'Processor fee settlement', 'paying', ARRAY['processor'], 'cash', 'accounting', true);
```

**Entity Types:**

Add "processor" to the existing entity type enum:

```typescript
type LedgerEntityType = 'customer' | 'vendor' | 'referee' | 'staff' | 'processor' | 'other';
```

### Transaction Flows

#### Cash-In Flow (Customer pays crypto to reduce balance)

**Scenario:** Customer owes $100, pays $100 in crypto

**Input:**
```typescript
{
  direction: 'receiving',
  entityType: 'customer',
  entityId: 'customer-123',
  transactionType: 'crypto_payment_in',
  method: 'crypto',
  bucket: 'crypto-wallet',
  
  grossAmount: 100.00,           // What customer paid in crypto
  processorId: 'processor-abc',
  processingFeeTotal: 4.00,      // Can override calculated fee
  userSplitPercent: 25,          // Can override default
}
```

**Calculation:**
```typescript
userFeeShare = 4.00 × 0.25 = 1.00
processorFeeShare = 4.00 × 0.75 = 3.00
netAmountReceived = 100.00 - 3.00 = 97.00  // Processor deducts their share
customerCreditAmount = 97.00 - 1.00 = 96.00  // User keeps their fee share
```

**Records Created:**

1. **processor_fees:**
```typescript
{
  processorId: 'processor-abc',
  transactionType: 'payment',
  transactionId: [payment id],
  transactionNo: 'PMT-001',
  transactionAmount: 100.00,
  processingFeeTotal: 4.00,
  userFeeShare: 1.00,
  userFeeStatus: 'collectible',      // User should receive this
  processorFeeShare: 3.00,
  processorFeeStatus: 'paid',        // Processor already deducted
}
```

2. **payments:**
```typescript
{
  customerId: 'customer-123',
  amount: 96.00,                     // Credits customer account
  method: 'crypto',
  direction: 'money_in',
  category: 'client_payment',
  processorFeeId: [fee record id],
}
```

3. **client_ledger_entries:**
```typescript
{
  customerId: 'customer-123',
  paymentId: [payment id],
  kind: 'payment',
  amount: 96.00,                     // Customer sees $96.00 credit
  balanceAfter: [previous balance - 96.00],
}
```

**Result:** Customer's $100 debt is reduced by $96.00. User receives $97.00 from processor, keeps $1.00 as fee income, applies $96.00 to customer balance.

#### Cashout Flow (Customer cashing out crypto to fiat)

**Scenario:** Customer wants $100 fiat, cashes out crypto

**Input:**
```typescript
{
  direction: 'paying',
  entityType: 'customer',
  entityId: 'customer-123',
  transactionType: 'crypto_cashout',
  method: 'crypto',
  bucket: 'crypto-wallet',
  
  customerReceivesAmount: 100.00,  // Fiat customer gets
  processorId: 'processor-abc',
  processingFeeTotal: 4.00,
  userSplitPercent: 25,
}
```

**Calculation:**
```typescript
userFeeShare = 4.00 × 0.25 = 1.00
processorFeeShare = 4.00 × 0.75 = 3.00
totalUserReceives = 100.00 + 1.00 = 101.00  // Customer's amount + user's fee share
```

**Records Created:**

1. **processor_fees:**
```typescript
{
  processorId: 'processor-abc',
  transactionType: 'payment',
  transactionId: [payment id],
  transactionNo: 'PMT-002',
  transactionAmount: 100.00,
  processingFeeTotal: 4.00,
  userFeeShare: 1.00,
  userFeeStatus: 'collectible',
  processorFeeShare: 3.00,
  processorFeeStatus: 'paid',
}
```

2. **payments:**
```typescript
{
  customerId: 'customer-123',
  amount: 100.00,                   // Debits customer account
  method: 'crypto',
  direction: 'money_out',
  category: 'crypto_cashout',
  processorFeeId: [fee record id],
}
```

3. **client_ledger_entries:**
```typescript
{
  customerId: 'customer-123',
  paymentId: [payment id],
  kind: 'cashout',
  amount: -100.00,                  // Customer account debited
  balanceAfter: [previous balance + 100.00],
}
```

**Result:** Customer receives $100 fiat. User receives $101 from processor ($100 for customer + $1 fee share), gives $100 to customer, keeps $1 as fee income.

### UI Integration

#### A. Quick Ledger Enhancements

Extend the existing `QuickLedgerGrid` component to support processor transactions.

**Conditional Fields:**

When transaction type is processor-enabled (crypto_payment_in, crypto_cashout, check_payment_in), show additional fields:

```typescript
interface ProcessorTransactionFields {
  grossAmount: number;           // Total before fees (NEW)
  processorId: string;           // Processor selector (NEW)
  processingFeeTotal: number;    // Editable fee amount (NEW)
  userSplitPercent: number;      // Editable split % (NEW)
  calculatedCustomerCredit: number;  // Display only (NEW)
}
```

**Layout in Quick Ledger Row:**

```
| Date | Entity Type | Entity | Transaction Type | Gross Amount | Processor | Fee | User Split % | Customer Credit | Method | Bucket | Notes | Commit |
```

**Fee Breakdown Display (Impact Preview):**

```
Gross: $100.00
Processing Fee: $4.00
  ├─ Your share (25%): $1.00 (collectible)
  └─ Processor share (75%): $3.00 (paid)
Net to customer: $96.00
```

**Implementation:**

```typescript
// QuickLedgerGrid.tsx modifications
function DraftLedgerRow({ row, ... }) {
  const isProcessorTransaction = ['crypto_payment_in', 'crypto_cashout', 'check_payment_in'].includes(row.transactionType);
  const processors = reference.data?.processors ?? [];
  
  const selectedProcessor = processors.find(p => p.id === row.processorId);
  const calculatedFee = selectedProcessor 
    ? calculateProcessingFee(row.grossAmount, selectedProcessor)
    : 0;
  
  const feeTotal = row.processingFeeTotal || calculatedFee;
  const { userShare, processorShare } = splitProcessingFee(
    feeTotal, 
    row.userSplitPercent || selectedProcessor?.defaultUserSplit || 25
  );
  
  const customerCredit = calculateCustomerCredit(
    row.grossAmount, 
    processorShare, 
    userShare
  );
  
  return (
    <tr>
      {/* ... existing fields ... */}
      
      {isProcessorTransaction && (
        <>
          <td>
            <input 
              type="number" 
              value={row.grossAmount} 
              onChange={(e) => onUpdate({ grossAmount: Number(e.target.value) })}
              placeholder="Gross amount"
            />
          </td>
          <td>
            <select 
              value={row.processorId} 
              onChange={(e) => onUpdate({ processorId: e.target.value })}
            >
              <option value="">Choose processor</option>
              {processors.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </td>
          <td>
            <input 
              type="number" 
              value={row.processingFeeTotal || calculatedFee} 
              onChange={(e) => onUpdate({ processingFeeTotal: Number(e.target.value) })}
              placeholder="Fee"
            />
          </td>
          <td>
            <input 
              type="number" 
              value={row.userSplitPercent || selectedProcessor?.defaultUserSplit} 
              onChange={(e) => onUpdate({ userSplitPercent: Number(e.target.value) })}
              placeholder="%"
            />
          </td>
          <td className="calculated-display">
            ${customerCredit.toFixed(2)}
          </td>
        </>
      )}
      
      {/* ... existing fields ... */}
    </tr>
  );
}
```

#### B. Processor Management View

New dedicated view at `/payments/processors` (similar to RefereesView).

**Component Structure:**

```typescript
// src/client/views/ProcessorsView.tsx
export function ProcessorsView() {
  const grid = trpc.queries.grid.useQuery({ view: 'processors' });
  const { runCommand } = useCommandRunner();

  return (
    <WorkspacePanel
      panelId="payments:processors"
      title="Payment Processors"
      subtitle="Manage payment processors, fee structures, and settlement tracking"
      actions={
        <button onClick={handleCreateProcessor} className="primary-button">
          <Plus className="h-4 w-4" />
          New Processor
        </button>
      }
    >
      <OperatorGrid
        view="processors"
        title="Payment Processors"
        rows={grid.data ?? []}
        columns={processorColumns}
        expansionConfig={{
          actionsRenderer: (row) => <ProcessorActions row={row} />,
          historyRenderer: (row) => <ProcessorFeeHistory processorId={row.id} />,
        }}
      />
    </WorkspacePanel>
  );
}
```

**Grid Columns:**

```typescript
const processorColumns: ColDef<GridRow>[] = [
  { field: 'name', headerName: 'Processor Name', pinned: 'left', width: 200 },
  { field: 'processorType', headerName: 'Type', width: 120 },
  { field: 'feeFormula', headerName: 'Fee Formula', width: 150, 
    valueGetter: (params) => formatFeeFormula(params.data) },
  { field: 'defaultSplit', headerName: 'Default Split', width: 150,
    valueGetter: (params) => `User ${params.data.defaultUserSplit}% / Proc ${params.data.defaultProcessorSplit}%` },
  { field: 'totalFeesProcessed', headerName: 'Total Fees', type: 'numericColumn', width: 130 },
  { field: 'userFeesCollectible', headerName: 'User Collectible', type: 'numericColumn', width: 150 },
  { field: 'userFeesCollected', headerName: 'User Collected', type: 'numericColumn', width: 150 },
  { field: 'processorFeesUnpaid', headerName: 'Proc Unpaid', type: 'numericColumn', width: 130 },
  { field: 'active', width: 100 },
  { field: 'createdAt', width: 180 }
];
```

**Inline Expansion - Actions:**

```typescript
function ProcessorActions({ row }: { row: GridRow }) {
  const { runCommand } = useCommandRunner();
  
  return (
    <div className="expansion-actions">
      <button onClick={() => handleEditProcessor(row)} className="secondary-button">
        Edit Processor
      </button>
      <button onClick={() => handleViewFees(row)} className="secondary-button">
        View All Fees
      </button>
      <button onClick={() => handleMarkCollected(row)} className="secondary-button">
        Mark User Fees Collected
      </button>
      <button onClick={() => handleSettleFees(row)} className="secondary-button">
        Settle Processor Fees
      </button>
    </div>
  );
}
```

**Inline Expansion - Fee History:**

```typescript
function ProcessorFeeHistory({ processorId }: { processorId: string }) {
  const fees = trpc.queries.processorFees.useQuery({ processorId });
  
  return (
    <div className="processor-fee-history">
      <h4>Recent Fees</h4>
      <table className="fee-history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Transaction</th>
            <th>Amount</th>
            <th>Fee Total</th>
            <th>User Share</th>
            <th>User Status</th>
            <th>Proc Share</th>
            <th>Proc Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {fees.data?.map(fee => (
            <tr key={fee.id}>
              <td>{formatDate(fee.createdAt)}</td>
              <td>{fee.transactionNo}</td>
              <td>${money(fee.transactionAmount)}</td>
              <td>${money(fee.processingFeeTotal)}</td>
              <td>${money(fee.userFeeShare)}</td>
              <td><StatusPill status={fee.userFeeStatus} /></td>
              <td>${money(fee.processorFeeShare)}</td>
              <td><StatusPill status={fee.processorFeeStatus} /></td>
              <td>
                <FeeActions fee={fee} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### C. Processor Fee Management Panel

Detailed fee tracking accessible from Processors view or as a dedicated panel.

**Tabs:**
1. User Fees Collectible (awaiting confirmation)
2. User Fees Collected (historical)
3. Processor Fees Unpaid (need settlement)
4. All Fees (complete audit trail)

**Per-Fee Actions:**
- Mark User Fee Collected
- Toggle Processor Fee Status (paid ↔ unpaid)
- View linked transaction
- Add notes

#### D. Navigation Integration

```typescript
// Add to main navigation
{
  label: 'Payments',
  children: [
    { label: 'Transaction Ledger', path: '/payments/ledger' },
    { label: 'Processors', path: '/payments/processors' },  // NEW
  ]
}
```

### Command Layer

#### New Commands

**1. createPaymentProcessor**

```typescript
export async function createPaymentProcessor(
  tx: Tx,
  payload: {
    name: string;
    processorType: 'crypto' | 'check' | 'wire';
    feeType: 'percentage' | 'fixed' | 'hybrid';
    feePercentage?: number;
    feeFixedAmount?: number;
    defaultUserSplit: number;
    defaultProcessorSplit: number;
    notes?: string;
  },
  commandId: string
): Promise<CommandResult> {
  // Validation
  if (payload.feeType === 'percentage' && !payload.feePercentage) {
    throw new Error('Percentage fee required for percentage fee type');
  }
  if (payload.feeType === 'fixed' && !payload.feeFixedAmount) {
    throw new Error('Fixed amount required for fixed fee type');
  }
  if (payload.feeType === 'hybrid' && (!payload.feePercentage || !payload.feeFixedAmount)) {
    throw new Error('Both percentage and fixed amount required for hybrid fee type');
  }
  if (payload.defaultUserSplit + payload.defaultProcessorSplit !== 100) {
    throw new Error('User split and processor split must add up to 100%');
  }

  const [processor] = await tx
    .insert(paymentProcessors)
    .values({
      name: payload.name,
      processorType: payload.processorType,
      feeType: payload.feeType,
      feePercentage: payload.feePercentage ? String(payload.feePercentage) : null,
      feeFixedAmount: payload.feeFixedAmount ? String(payload.feeFixedAmount) : null,
      defaultUserSplit: String(payload.defaultUserSplit),
      defaultProcessorSplit: String(payload.defaultProcessorSplit),
      notes: payload.notes || null,
      active: true
    })
    .returning();

  return {
    ok: true,
    commandId,
    affectedIds: [processor.id],
    toast: `Processor "${processor.name}" created.`
  };
}
```

**2. postTransactionLedgerRow (enhanced)**

```typescript
export async function postTransactionLedgerRow(
  tx: Tx,
  payload: {
    // ... existing Quick Ledger fields ...
    
    // Processor fields (optional)
    processorId?: string;
    grossAmount?: number;
    processingFeeTotal?: number;
    userSplitPercent?: number;
    processorFeeStatus?: 'paid' | 'unpaid';
  },
  commandId: string
): Promise<CommandResult> {
  const isProcessorTransaction = ['crypto_payment_in', 'crypto_cashout', 'check_payment_in']
    .includes(payload.transactionType);

  let processorFeeId: string | null = null;

  if (isProcessorTransaction && payload.processorId) {
    // 1. Get processor config
    const processor = await tx.query.paymentProcessors.findFirst({
      where: eq(paymentProcessors.id, payload.processorId)
    });
    
    if (!processor) {
      throw new Error('Processor not found');
    }

    // 2. Calculate fee if not provided
    const feeTotal = payload.processingFeeTotal ?? calculateProcessingFee(
      payload.grossAmount!,
      processor
    );

    // 3. Split fee
    const userSplit = payload.userSplitPercent ?? Number(processor.defaultUserSplit);
    const { userShare, processorShare } = splitProcessingFee(feeTotal, userSplit);

    // 4. Calculate customer credit amount
    const customerCreditAmount = calculateCustomerCredit(
      payload.grossAmount!,
      processorShare,
      userShare
    );

    // 5. Create processor_fees record
    const [feeRecord] = await tx
      .insert(processorFees)
      .values({
        processorId: payload.processorId,
        transactionType: 'payment', // Will be set based on actual transaction type
        transactionId: 'pending',   // Will be updated after payment creation
        transactionNo: 'pending',
        transactionAmount: String(payload.grossAmount),
        processingFeeTotal: String(feeTotal),
        userFeeShare: String(userShare),
        userFeeStatus: 'collectible',
        processorFeeShare: String(processorShare),
        processorFeeStatus: payload.processorFeeStatus || 'paid',
        commandId
      })
      .returning();

    processorFeeId = feeRecord.id;

    // 6. Override payload amount with calculated customer credit
    payload.amount = customerCreditAmount;
  }

  // 7. Create payment/vendor_payment as normal
  const paymentResult = await createPaymentRecord(tx, payload, processorFeeId, commandId);

  // 8. Update processor_fees with actual transaction ID and number
  if (processorFeeId) {
    await tx
      .update(processorFees)
      .set({
        transactionId: paymentResult.paymentId,
        transactionNo: paymentResult.paymentNo,
        transactionType: payload.direction === 'receiving' ? 'payment' : 'vendor_payment'
      })
      .where(eq(processorFees.id, processorFeeId));
  }

  return {
    ok: true,
    commandId,
    affectedIds: [paymentResult.paymentId, processorFeeId].filter(Boolean),
    toast: `Transaction posted. ${processorFeeId ? 'Processing fee tracked.' : ''}`
  };
}
```

**3. markUserFeeCollected**

```typescript
export async function markUserFeeCollected(
  tx: Tx,
  payload: {
    processorFeeId: string;
    collectedAt?: string;
  },
  commandId: string
): Promise<CommandResult> {
  await tx
    .update(processorFees)
    .set({
      userFeeStatus: 'collected',
      userFeeCollectedAt: payload.collectedAt ? new Date(payload.collectedAt) : new Date()
    })
    .where(eq(processorFees.id, payload.processorFeeId));

  return {
    ok: true,
    commandId,
    affectedIds: [payload.processorFeeId],
    toast: 'User fee marked as collected.'
  };
}
```

**4. markUserFeesCollectedBulk**

```typescript
export async function markUserFeesCollectedBulk(
  tx: Tx,
  payload: {
    processorId: string;
    feeIds?: string[];  // If provided, only mark these; otherwise mark all collectible
  },
  commandId: string
): Promise<CommandResult> {
  const conditions = [
    eq(processorFees.processorId, payload.processorId),
    eq(processorFees.userFeeStatus, 'collectible')
  ];

  if (payload.feeIds) {
    conditions.push(sql`${processorFees.id} = ANY(${payload.feeIds})`);
  }

  const result = await tx
    .update(processorFees)
    .set({
      userFeeStatus: 'collected',
      userFeeCollectedAt: new Date()
    })
    .where(and(...conditions))
    .returning();

  return {
    ok: true,
    commandId,
    affectedIds: result.map(r => r.id),
    toast: `${result.length} user fee(s) marked as collected.`
  };
}
```

**5. updateProcessorFeeStatus**

```typescript
export async function updateProcessorFeeStatus(
  tx: Tx,
  payload: {
    processorFeeId: string;
    status: 'paid' | 'unpaid';
  },
  commandId: string
): Promise<CommandResult> {
  await tx
    .update(processorFees)
    .set({
      processorFeeStatus: payload.status,
      processorFeePaidAt: payload.status === 'paid' ? new Date() : null
    })
    .where(eq(processorFees.id, payload.processorFeeId));

  return {
    ok: true,
    commandId,
    affectedIds: [payload.processorFeeId],
    toast: `Processor fee marked as ${payload.status}.`
  };
}
```

**6. settleProcessorFees**

```typescript
export async function settleProcessorFees(
  tx: Tx,
  payload: {
    processorId: string;
    feeIds: string[];
    paymentAmount: number;
    method: string;
    reference?: string;
    notes?: string;
  },
  commandId: string
): Promise<CommandResult> {
  // 1. Validate fees belong to processor and are unpaid
  const fees = await tx
    .select()
    .from(processorFees)
    .where(
      and(
        eq(processorFees.processorId, payload.processorId),
        sql`${processorFees.id} = ANY(${payload.feeIds})`,
        eq(processorFees.processorFeeStatus, 'unpaid')
      )
    );

  if (fees.length !== payload.feeIds.length) {
    throw new Error('Some fees not found or already paid');
  }

  const totalUnpaid = fees.reduce((sum, f) => sum + Number(f.processorFeeShare), 0);
  
  if (Math.abs(totalUnpaid - payload.paymentAmount) > 0.01) {
    throw new Error(
      `Payment amount $${payload.paymentAmount.toFixed(2)} does not match total unpaid fees $${totalUnpaid.toFixed(2)}`
    );
  }

  // 2. Create payment to processor
  const [payment] = await tx
    .insert(payments)
    .values({
      processorId: payload.processorId,  // Link to processor
      customerId: null,                  // Not a customer payment
      amount: String(payload.paymentAmount),
      method: payload.method,
      direction: 'money_out',
      category: 'processor_fee_settlement',
      reference: payload.reference || null,
      notes: payload.notes || `Settlement for ${fees.length} processor fees`,
      status: 'posted'
    })
    .returning();

  // 3. Mark fees as paid
  await tx
    .update(processorFees)
    .set({
      processorFeeStatus: 'paid',
      processorFeePaidAt: new Date(),
      processorFeePaidVia: payment.id
    })
    .where(sql`${processorFees.id} = ANY(${payload.feeIds})`);

  return {
    ok: true,
    commandId,
    affectedIds: [payment.id, ...payload.feeIds],
    toast: `Settled ${fees.length} processor fees ($${payload.paymentAmount.toFixed(2)}).`
  };
}
```

#### Helper Functions

```typescript
/**
 * Calculate processing fee based on processor configuration
 */
export function calculateProcessingFee(
  amount: number,
  processor: PaymentProcessor
): number {
  if (amount < 0) {
    throw new Error('Transaction amount cannot be negative');
  }

  const feePercentage = processor.feePercentage ? Number(processor.feePercentage) : 0;
  const feeFixedAmount = processor.feeFixedAmount ? Number(processor.feeFixedAmount) : 0;

  switch (processor.feeType) {
    case 'percentage':
      return Math.round((amount * feePercentage / 100) * 100) / 100;
    case 'fixed':
      return feeFixedAmount;
    case 'hybrid':
      const percentPart = Math.round((amount * feePercentage / 100) * 100) / 100;
      return percentPart + feeFixedAmount;
    default:
      throw new Error(`Invalid fee type: ${processor.feeType}`);
  }
}

/**
 * Split processing fee between user and processor
 */
export function splitProcessingFee(
  feeTotal: number,
  userSplitPercent: number
): { userShare: number; processorShare: number } {
  if (userSplitPercent < 0 || userSplitPercent > 100) {
    throw new Error('User split percent must be between 0 and 100');
  }

  const userShare = Math.round((feeTotal * userSplitPercent / 100) * 100) / 100;
  const processorShare = Math.round((feeTotal - userShare) * 100) / 100;

  return { userShare, processorShare };
}

/**
 * Calculate customer credit amount for cash-in transactions
 */
export function calculateCustomerCredit(
  grossAmount: number,
  processorFeeShare: number,
  userFeeShare: number
): number {
  // Customer credit = gross amount - processor's share - user's share
  return Math.round((grossAmount - processorFeeShare - userFeeShare) * 100) / 100;
}
```

#### TRPC Queries

```typescript
// Get processor with aggregated fee totals
processorWithTotals: publicProcedure
  .input(z.object({ processorId: z.string() }))
  .query(async ({ input, ctx }) => {
    const processor = await ctx.db.query.paymentProcessors.findFirst({
      where: eq(paymentProcessors.id, input.processorId)
    });

    if (!processor) return null;

    const fees = await ctx.db
      .select()
      .from(processorFees)
      .where(eq(processorFees.processorId, input.processorId));

    const totals = fees.reduce(
      (acc, fee) => ({
        totalFeesProcessed: acc.totalFeesProcessed + Number(fee.processingFeeTotal),
        userFeesCollectible: acc.userFeesCollectible + 
          (fee.userFeeStatus === 'collectible' ? Number(fee.userFeeShare) : 0),
        userFeesCollected: acc.userFeesCollected + 
          (fee.userFeeStatus === 'collected' ? Number(fee.userFeeShare) : 0),
        processorFeesUnpaid: acc.processorFeesUnpaid + 
          (fee.processorFeeStatus === 'unpaid' ? Number(fee.processorFeeShare) : 0),
      }),
      { totalFeesProcessed: 0, userFeesCollectible: 0, userFeesCollected: 0, processorFeesUnpaid: 0 }
    );

    return { ...processor, ...totals };
  }),

// Get processor fees with filtering
processorFees: publicProcedure
  .input(z.object({ 
    processorId: z.string().optional(),
    userFeeStatus: z.enum(['collectible', 'collected']).optional(),
    processorFeeStatus: z.enum(['paid', 'unpaid']).optional(),
  }))
  .query(async ({ input, ctx }) => {
    const conditions = [];
    
    if (input.processorId) {
      conditions.push(eq(processorFees.processorId, input.processorId));
    }
    if (input.userFeeStatus) {
      conditions.push(eq(processorFees.userFeeStatus, input.userFeeStatus));
    }
    if (input.processorFeeStatus) {
      conditions.push(eq(processorFees.processorFeeStatus, input.processorFeeStatus));
    }

    return await ctx.db
      .select()
      .from(processorFees)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(processorFees.createdAt));
  }),

// Get active processors for Quick Ledger dropdown
activeProcessors: publicProcedure
  .query(async ({ ctx }) => {
    return await ctx.db
      .select()
      .from(paymentProcessors)
      .where(eq(paymentProcessors.active, true))
      .orderBy(asc(paymentProcessors.name));
  }),
```

### Testing Strategy

#### Unit Tests

1. **Helper Functions:**
   - `calculateProcessingFee` with percentage, fixed, and hybrid types
   - `splitProcessingFee` with various split percentages
   - `calculateCustomerCredit` with different amounts

2. **Command Validation:**
   - Create processor with invalid fee configurations
   - Post transaction with missing processor fields
   - Settle fees with mismatched amounts

#### Integration Tests

1. **Cash-In Flow:**
   - Customer pays $100 crypto → verify customer credited $96, processor fee tracked correctly
   - Test with different fee formulas and split percentages
   - Verify all related records created (processor_fees, payments, ledger_entries)

2. **Cashout Flow:**
   - Customer cashes out $100 → verify customer debited $100, fees tracked
   - Test fee calculation overrides

3. **Fee Status Transitions:**
   - Mark user fee collectible → collected
   - Toggle processor fee paid ↔ unpaid
   - Bulk mark user fees collected

4. **Processor Settlement:**
   - Create multiple unpaid processor fees
   - Settle with payment
   - Verify fees marked paid and linked to payment

#### E2E Tests (Playwright)

1. **Quick Ledger Entry:**
   - Enter crypto payment transaction
   - Select processor, verify fee calculation
   - Override fee and split
   - Commit and verify success

2. **Processor Management:**
   - Create new processor
   - Edit fee configuration
   - View fee history in inline expansion
   - Mark fees collected/paid

3. **End-to-End Cash-In:**
   - Customer has $100 balance owed
   - Enter crypto payment (customer pays $100 crypto)
   - Verify customer balance reduced by $96
   - Verify processor fee shows collectible user share
   - Mark user fee collected
   - Verify totals in processor view

4. **End-to-End Cashout:**
   - Customer wants to cash out $100
   - Enter cashout transaction
   - Verify customer account debited $100
   - Verify processor fee tracked
   - Navigate to processor view and verify totals

### Migration Plan

1. **Create new tables:**
   - `payment_processors`
   - `processor_fees`

2. **Alter existing tables:**
   - Add `processor_fee_id` to `payments`
   - Add `processor_fee_id` to `vendor_payments`

3. **Seed transaction types:**
   - Insert crypto_payment_in, crypto_cashout, check_payment_in, processor_fee_settlement

4. **Update entity type enum:**
   - Add "processor" to LedgerEntityType

5. **Add indexes:**
   - All indexes specified in schema section

### Rollout Phases

**Phase 1: Backend Foundation**
- Create schema (migration)
- Implement command handlers
- Implement helper functions
- Add TRPC queries
- Unit tests for business logic

**Phase 2: Quick Ledger Integration**
- Extend QuickLedgerGrid with processor fields
- Add processor dropdown
- Implement fee calculation UI
- Add validation
- E2E test for transaction entry

**Phase 3: Processor Management**
- Create ProcessorsView component
- Implement processor CRUD
- Add inline expansion with fee history
- Add bulk fee actions
- E2E tests for processor management

**Phase 4: Fee Tracking & Settlement**
- Implement fee status management
- Add fee settlement flows
- Create processor fee panel
- Add reporting/totals
- E2E tests for complete flows

**Phase 5: Polish & Documentation**
- User documentation
- Operator training guide
- Dashboard KPIs (if needed)
- Performance optimization

### Open Questions & Future Enhancements

**Resolved:**
- ✅ Processor as entity type vs separate system → Separate system (like referees)
- ✅ Default fee status → User: collectible, Processor: paid
- ✅ Fee formula → Percentage + fixed (hybrid), editable per transaction
- ✅ UI integration → Quick Ledger + dedicated view
- ✅ Multiple processors → Yes, with type field (crypto, check, etc.)

**Future Enhancements:**
1. Automated processor statements (monthly fee summaries)
2. Processor API integration (for real-time fee calculation)
3. Multi-currency support for crypto transactions
4. Processor performance metrics (avg fee, transaction volume)
5. Fee dispute tracking
6. Batch settlement scheduling
7. Processor SLA tracking

## Summary

The Payment Processor system extends Terp Operator's transaction handling to support crypto payments, check processing, and other payment types that involve third-party processors with variable fees. By mirroring the proven Referee system architecture while adapting for payment-specific workflows, the system provides:

- **Flexible fee structures:** Percentage, fixed, or hybrid formulas with per-transaction overrides
- **Split tracking:** Separate accounting for user's share and processor's share of fees
- **Dual status tracking:** User fees (collectible/collected) and processor fees (paid/unpaid)
- **Seamless integration:** Processor transactions in Quick Ledger alongside regular payments
- **Dedicated management:** ProcessorsView for fee oversight and settlement
- **Audit trail:** Complete transaction and fee history with command journal

This design maintains consistency with existing TERP patterns (inline expansion, command-based mutations, entity management views) while adding the specialized fee-splitting logic required for payment processing workflows.
