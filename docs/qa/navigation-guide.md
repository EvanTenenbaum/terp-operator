# TERP Operator Navigation Guide

## Critical Information for QA Agents

⚠️ **This application uses STATE-BASED routing, NOT URL routing.**

### What This Means

- Direct URL navigation (e.g., `http://localhost:5173/payments/processors`) **WILL NOT WORK**
- The app uses React state (`activeView`) to control which view is displayed
- Navigation happens via sidebar clicks and quick action buttons
- URL changes do not trigger view changes

### Correct Navigation Methods

#### Method 1: Sidebar Navigation (Primary)

```javascript
// Example: Navigate to Processors view
await page.getByText('Processors').click();
// OR
await page.getByRole('button', { name: 'Processors' }).click();
```

**Sidebar Structure:**

```
├── Decide
│   ├── Dashboard (hotkey: ⌘1)
│   └── Reports
├── Procure
│   ├── Purchase Orders
│   ├── Intake (hotkey: ⌘2)
│   └── Inventory (hotkey: ⌘5)
├── Sell
│   ├── Sales (hotkey: ⌘3)
│   ├── Matchmaking
│   ├── Orders
│   ├── Fulfillment
│   └── Client Ledger (hotkey: ⌘6)
├── Money
│   ├── Payments (hotkey: ⌘4)
│   ├── Vendor Payouts
│   ├── Referees
│   └── Processors
└── Admin
    └── Settings
```

#### Method 2: Quick Action Buttons (Top Keel)

Located at the top of the page, these provide fast access to common workflows:

- **New Sale** → Opens Sales view with sale launcher
- **New PO** → Opens Purchase Orders view with PO launcher
- **Receive** → Opens Intake view with receiving launcher
- **Money in** → Opens Payments view with receiving mode
- **Money out** → Opens Vendor Payouts view with payout mode

```javascript
// Example: Open Money in (Receiving)
await page.getByRole('button', { name: 'Money in' }).click();
```

#### Method 3: Keyboard Shortcuts

Some views have hotkeys (Mac-specific):
- Dashboard: `⌘1`
- Intake: `⌘2`
- Sales: `⌘3`
- Payments: `⌘4`
- Inventory: `⌘5`
- Client Ledger: `⌘6`

### Navigation Examples for Common QA Tasks

#### Navigate to Processors View

```javascript
// WRONG - This will not work
await page.goto('http://localhost:5173/payments/processors');

// CORRECT - Use sidebar
await page.getByText('Processors').click();
await page.waitForSelector('text=Payment Processors'); // Wait for view to load
```

#### Navigate to Transaction Ledger

```javascript
// Option 1: Via sidebar
await page.getByText('Payments').click();

// Option 2: Via quick action
await page.getByRole('button', { name: 'Money in' }).click();
```

#### Create New Receiving Transaction

```javascript
// Navigate to Payments
await page.getByText('Payments').click();

// Click Receiving button
await page.getByRole('button', { name: 'Receiving' }).click();

// New draft row will appear in grid
```

### View Detection

To verify which view is currently active:

```javascript
// Each view has a unique h1 heading
await page.waitForSelector('h1:has-text("Payment Processors")'); // Processors view
await page.waitForSelector('h1:has-text("Payments")'); // Payments view
await page.waitForSelector('h1:has-text("Referees")'); // Referees view
```

### Common Navigation Errors

**Error:** "Element not found" when clicking navigation links  
**Cause:** Sidebar may be collapsed  
**Fix:** Expand sidebar first:
```javascript
await page.getByLabel('Expand navigation').click();
```

**Error:** View doesn't load after clicking  
**Cause:** Need to wait for React state update  
**Fix:** Add wait condition:
```javascript
await page.getByText('Processors').click();
await page.waitForSelector('h1:has-text("Payment Processors")');
```

**Error:** "Cannot read property of undefined" after navigation  
**Cause:** Grid data may not be loaded yet  
**Fix:** Wait for grid to render:
```javascript
await page.waitForSelector('[role="grid"]');
// OR wait for specific row
await page.waitForSelector('text=Test-Crypto-Percentage');
```

### Route Mapping Reference

Since URL navigation doesn't work, here's how to reach each view:

| View | Sidebar Path | Alternative |
|------|--------------|-------------|
| Dashboard | Decide → Dashboard | Hotkey ⌘1 |
| Reports | Decide → Reports | - |
| Purchase Orders | Procure → Purchase Orders | Quick: "New PO" |
| Intake | Procure → Intake | Hotkey ⌘2, Quick: "Receive" |
| Inventory | Procure → Inventory | Hotkey ⌘5 |
| Sales | Sell → Sales | Hotkey ⌘3, Quick: "New Sale" |
| Matchmaking | Sell → Matchmaking | - |
| Orders | Sell → Orders | - |
| Fulfillment | Sell → Fulfillment | - |
| Client Ledger | Sell → Client Ledger | Hotkey ⌘6 |
| Payments | Money → Payments | Hotkey ⌘4, Quick: "Money in" |
| Vendor Payouts | Money → Vendor Payouts | Quick: "Money out" |
| Referees | Money → Referees | - |
| **Processors** | **Money → Processors** | - |
| Settings | Admin → Settings | - |

### Implementation Notes

The routing system uses Zustand state management:

```typescript
// From src/client/store/uiStore.ts
const activeView = useUiStore((state) => state.activeView);
const setActiveView = useUiStore((state) => state.setActiveView);

// Sidebar buttons call:
onClick={() => setActiveView('processors')}

// App.tsx conditionally renders:
{activeView === 'processors' ? <ProcessorsView /> : null}
```

This is why URL navigation doesn't work - there's no routing library (React Router, etc.) watching for URL changes.
