#!/usr/bin/env node
// Queries the seeded DB and emits JSON for seed-state-reference.md.
// Usage: node scripts/qa-export-seed-state.js
// Requires DATABASE_URL env var (or falls back to local default).
'use strict';

import pg from 'pg';
const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ||
      'postgres://terp_agro:terp_agro@localhost:55432/terp_agro',
  });

  try {
    // Customers
    const custResult = await pool.query(
      'SELECT name, credit_limit, balance FROM customers ORDER BY name'
    );
    const customers = custResult.rows.map(r => ({
      name: r.name,
      creditLimit: r.credit_limit,
      balance: r.balance,
      overLimit: parseFloat(r.balance) > parseFloat(r.credit_limit),
    }));

    // Credit-hold customer (balance > credit_limit)
    const creditHoldCustomer = customers.find(c => c.overLimit) || null;

    // Good-standing customer (balance well under limit)
    const goodStandingCustomer =
      customers.find(c => !c.overLimit && parseFloat(c.creditLimit) > 50000) ||
      customers[0] ||
      null;

    // Vendors
    const vendResult = await pool.query(
      'SELECT id, name FROM vendors ORDER BY name'
    );
    const vendors = vendResult.rows.map(r => ({ id: r.id, name: r.name }));

    // Live batches
    const batchResult = await pool.query(
      "SELECT id, name, available_qty, status FROM batches WHERE status = 'Live' ORDER BY name LIMIT 20"
    );
    const liveBatches = batchResult.rows.map(r => ({
      id: r.id,
      productName: r.name,
      availableQty: r.available_qty,
      status: r.status,
    }));

    // Open sales orders count
    const soResult = await pool.query(
      "SELECT count(*) as cnt FROM sales_orders WHERE status NOT IN ('archived','cancelled')"
    );
    const openSalesOrders = parseInt(soResult.rows[0].cnt, 10);

    // Active purchase orders count
    const poResult = await pool.query(
      "SELECT count(*) as cnt FROM purchase_orders WHERE status NOT IN ('closed','cancelled')"
    );
    const openPurchaseOrders = parseInt(poResult.rows[0].cnt, 10);

    const output = {
      generatedAt: new Date().toISOString(),
      branch: process.env.QA_BRANCH || 'unknown',
      qaUser: {
        email: 'owner@terpagro.local',
        password: 'terp-demo',
        note: 'Full operator access. All demo users share this password.',
        additionalUsers: [
          'manager@terpagro.local / terp-demo (manager role)',
          'intake@terpagro.local / terp-demo (operator role)',
          'sales@terpagro.local / terp-demo (operator role)',
        ],
      },
      customers,
      vendors,
      liveBatches,
      openSalesOrders,
      openPurchaseOrders,
      creditHoldCustomer,
      goodStandingCustomer,
      knownMissingEntities: [
        'connector record — create manually via Money → Processors before connector-actor flows',
        'credit-hold customer — set East Bay Select credit limit to $0 via Clients view if needed',
      ],
    };

    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error('qa-export-seed-state failed:', e.message);
  process.exit(1);
});
