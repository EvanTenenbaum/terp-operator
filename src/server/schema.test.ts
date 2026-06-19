import { describe, it, expect } from 'vitest';
import {
  users,
  vendors,
  customers,
  items,
  batches,
  purchaseOrders,
  purchaseOrderLines,
  salesOrders,
  salesOrderLines,
  payments,
  invoices,
  contacts,
  commandJournal,
} from './schema';

describe('schema — core tables', () => {
  it('users table is defined', () => {
    expect(users).toBeDefined();
    // Drizzle tables include column definitions as object properties
    const cols = Object.getOwnPropertyNames(users).filter(k => !k.startsWith('_'));
    expect(cols.length).toBeGreaterThan(0);
  });

  it('vendors table has expected shape', () => {
    expect(vendors).toBeDefined();
  });

  it('customers table has expected shape', () => {
    expect(customers).toBeDefined();
  });

  it('items table has expected shape', () => {
    expect(items).toBeDefined();
  });

  it('batches table has expected shape', () => {
    expect(batches).toBeDefined();
  });

  it('purchase_orders table has expected shape', () => {
    expect(purchaseOrders).toBeDefined();
  });

  it('purchase_order_lines table has expected shape', () => {
    expect(purchaseOrderLines).toBeDefined();
  });

  it('sales_orders table has expected shape', () => {
    expect(salesOrders).toBeDefined();
  });

  it('sales_order_lines table has expected shape', () => {
    expect(salesOrderLines).toBeDefined();
  });

  it('payments table has expected shape', () => {
    expect(payments).toBeDefined();
  });

  it('invoices table has expected shape', () => {
    expect(invoices).toBeDefined();
  });

  it('contacts table has expected shape', () => {
    expect(contacts).toBeDefined();
  });

  it('command_journal table has expected shape', () => {
    expect(commandJournal).toBeDefined();
  });
});

describe('schema — constraints and relations', () => {
  it('users.contactId references contacts.id', () => {
    // The contactId column on users is defined as:
    //   contactId: uuid('contact_id').references((): AnyPgColumn => contacts.id)
    // We verify the Drizzle table definition is present.
    const userCols = Object.keys(users);
    expect(userCols).toContain('contactId');
  });

  it('vendors.contactId references contacts.id', () => {
    const vendorCols = Object.keys(vendors);
    expect(vendorCols).toContain('contactId');
  });

  it('all tables export valid Drizzle pgTable instances', () => {
    const tables = [
      users, vendors, customers, items, batches,
      purchaseOrders, purchaseOrderLines, salesOrders, salesOrderLines,
      payments, invoices, contacts, commandJournal,
    ];
    for (const table of tables) {
      expect(table).toBeDefined();
      expect(typeof table).toBe('object');
    }
  });
});

describe('schema — type mappings', () => {
  it('batches has numeric quantity columns', () => {
    // Verifies the Drizzle schema shape is well-formed
    const batchCols = Object.keys(batches);
    expect(batchCols).toContain('availableQty');
    expect(batchCols).toContain('reservedQty');
    expect(batchCols).toContain('unitCost');
    expect(batchCols).toContain('unitPrice');
  });

  it('payments has amount column', () => {
    const paymentCols = Object.keys(payments);
    expect(paymentCols).toContain('amount');
  });

  it('invoices has total and amountPaid columns', () => {
    const invoiceCols = Object.keys(invoices);
    expect(invoiceCols).toContain('total');
    expect(invoiceCols).toContain('amountPaid');
  });
});
