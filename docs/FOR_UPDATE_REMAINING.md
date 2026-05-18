# FOR UPDATE Implementation Status

## ✅ COMPLETED
- **allocatePayment()** (commandBus.ts:1828)
  - Payment row locked (prevents concurrent allocation)
  - Invoices locked (prevents concurrent payment application)
  - Customer balance locked (prevents race on balance updates)

- **logPayment()** (commandBus.ts:1758)
  - Customer row locked (prevents concurrent balance updates for credits)

## ⚠️ REMAINING - High Priority

### Money Operations
1. **postSale()** (commandBus.ts:~1650-1700)
   - Customer balance updates (lines ~1689-1690)
   - Need: Lock customer before balance calculation

2. **unallocatePayment()** (commandBus.ts:~1862-1890)
   - Payment unappliedAmount updates
   - Invoice amountPaid updates
   - Need: Lock payment, invoice, customer

3. **voidPayment()** (commandBus.ts:~1892-1908)
   - Payment status updates
   - Customer balance updates
   - Need: Lock payment and customer

4. **adjustInvoiceTotal()** (commandBus.ts:~1910-1922)
   - Invoice total updates
   - Need: Lock invoice

5. **payVendorBill()** (commandBus.ts:~1924-1940)
   - Vendor bill amountPaid updates
   - Need: Lock vendor bill

6. **reverseVendorPayment()** (commandBus.ts:~1942-1955)
   - Vendor bill amountPaid reversal
   - Need: Lock vendor bill

### Inventory Operations
7. **adjustBatchQty()** (commandBus.ts:~1244-1268)
   - Batch quantity updates
   - Need: Lock batch before reading availableQty

8. **postSale()** inventory movements (commandBus.ts:~1680-1682)
   - Batch quantity deductions for line items
   - Need: Lock each batch being sold

9. **receivePurchaseOrder()** (commandBus.ts:~600-640)
   - Batch creation with inventory movements
   - Need: Review if locks needed (new rows, may be safe)

10. **transferBatchStatus/Location/Ownership()** (commandBus.ts:~1270-1310)
    - Batch metadata updates
    - Need: Lock batch

### Purchase Order Operations
11. **createPurchaseOrderLine()** / **updatePurchaseOrderLine()** / **deletePurchaseOrderLine()**
    - PO total recalculations (commandBus.ts:~2590-2650)
    - Need: Lock PO before reading/updating total

12. **approvePurchaseOrder()** (commandBus.ts:~2750-2800)
    - Status transitions
    - Need: Lock PO (prevent concurrent approvals)

## 📋 VERIFICATION NEEDED
- Concurrent sale posting (multiple clerks selling same batch)
- Concurrent payment allocation (customer makes two payments simultaneously)
- Concurrent invoice adjustments
- Concurrent vendor bill payments

## ⏱️ EFFORT ESTIMATE
- Remaining critical money operations: **1 day**
- Inventory operations: **0.5 day**
- Purchase order operations: **0.5 day**
- Testing + verification: **0.5 day**

**Total**: ~2.5 days remaining for full FOR UPDATE coverage

## 🎯 PRIORITY ORDER
1. Customer balance operations (highest race risk)
2. Payment/invoice operations
3. Inventory quantity operations
4. Vendor bill operations
5. Purchase order operations
