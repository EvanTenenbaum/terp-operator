# Payment Processor System

## Overview

The Payment Processor system handles crypto payments, check processing, and other payment types that involve third-party processors with variable fees. Fees are split between the user (Terp Operator) and the processor according to configurable ratios.

## Key Concepts

### Payment Processors

Entities that handle payment processing with configurable fee structures:
- **Processor Type**: crypto, check, wire, etc.
- **Fee Formula**: percentage, fixed, or hybrid (percentage + fixed)
- **Default Split**: percentage of fee that goes to user vs processor

### Processor Fees

Each transaction creates a processor_fee record tracking:
- **User Fee Share**: User's portion of the processing fee
  - Status: `collectible` (default) → `collected` (confirmed)
- **Processor Fee Share**: Processor's portion of the fee
  - Status: `paid` (default, already deducted) ↔ `unpaid` (needs settlement)

## Workflows

### Cash-In (Customer Pays Crypto)

1. Navigate to Quick Ledger
2. Click "Receiving"
3. Select transaction type: "Crypto payment (customer)"
4. Enter **Gross Amount**: What customer paid in crypto (fiat equivalent)
5. Select **Processor**: Choose from dropdown
6. Review calculated **Fee** (can override)
7. Review **User Split %** (can override)
8. Review **Net to Customer**: Calculated credit amount
9. Commit transaction

**Result**: Customer account credited with net amount. User fee marked collectible, processor fee marked paid.

### Cashout (Customer Cashing Out)

1. Quick Ledger → Click "Paying"
2. Select transaction type: "Crypto cashout (to customer)"
3. Enter **Gross Amount**: Fiat amount customer receives
4. Select **Processor**
5. Review fee and split (can override)
6. Commit transaction

**Result**: Customer account debited. User collects fee share when facilitating payout.

### Managing Processors

Navigate to **Payments → Processors**

**Create Processor:**
1. Click "New Processor"
2. Enter name, type (crypto/check/wire)
3. Configure fee formula (percentage/fixed/hybrid)
4. Set default split percentage
5. Save

**View Fee History:**
- Expand processor row (click chevron)
- View all fees, filter by status
- Mark user fees as collected
- Toggle processor fee status (paid/unpaid)

## Database Schema

### payment_processors
- `fee_type`: percentage, fixed, or hybrid
- `fee_percentage`: e.g., 3.50 means 3.5%
- `fee_fixed_amount`: e.g., 0.30
- `default_user_split`: e.g., 25 (user gets 25%)
- `default_processor_split`: e.g., 75 (processor gets 75%)

### processor_fees
- `transaction_amount`: Gross amount before fees
- `processing_fee_total`: Total fee charged
- `user_fee_share`: User's portion
- `processor_fee_share`: Processor's portion
- `user_fee_status`: collectible | collected
- `processor_fee_status`: paid | unpaid

## Fee Calculation Examples

**Percentage Fee (3.5%):**
```
Transaction: $100
Fee: $100 × 3.5% = $3.50
```

**Fixed Fee ($2.00):**
```
Transaction: $100 (amount doesn't matter)
Fee: $2.00
```

**Hybrid (2.5% + $0.30):**
```
Transaction: $100
Fee: ($100 × 2.5%) + $0.30 = $2.50 + $0.30 = $2.80
```

**Fee Split (25% user / 75% processor):**
```
Total Fee: $4.00
User Share: $4.00 × 25% = $1.00
Processor Share: $4.00 × 75% = $3.00
```

**Customer Credit Calculation (Cash-In):**
```
Gross: $100.00
Processing Fee: $4.00
  User Share: $1.00
  Processor Share: $3.00
  
Processor deducts their share: $100 - $3 = $97
User keeps their share: $97 - $1 = $96
Customer Credit: $96.00
```

## Testing

### Unit Tests
`pnpm test processorCommands.test.ts`

Tests fee calculation helpers:
- calculateProcessingFee
- splitProcessingFee
- calculateCustomerCredit

### E2E Tests
`pnpm test:e2e processor-transactions.spec.ts`

Tests complete flows:
- Crypto cash-in transaction
- Crypto cashout transaction
- Fee calculation and commit

## Troubleshooting

**Fee not calculating:**
- Ensure processor is selected
- Gross amount must be entered
- Check processor has valid fee formula

**Customer credit incorrect:**
- Verify gross amount
- Check fee calculation
- Verify split percentage

**Processor fee status:**
- Default is "paid" (processor already deducted)
- Change to "unpaid" if needs separate settlement
