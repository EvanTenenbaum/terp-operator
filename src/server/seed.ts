import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool } from './db';
import { realisticDemoConfigFromEnv, seedRealisticDemoData } from './realisticSeed';
import {
  backupSnapshots,
  batches,
  brands,
  clientLedgerEntries,
  commandJournal,
  connectorRequests,
  customers,
  customerNeeds,
  fulfillmentLines,
  inventoryMovements,
  invoices,
  items,
  matchmakingMatches,
  payments,
  pickLists,
  purchaseOrderLines,
  purchaseOrders,
  salesOrderLines,
  salesOrders,
  tagCatalog,
  users,
  vendorBills,
  vendorSupply,
  vendors,
  contacts
} from './schema';
import { createPoFinalizationReceipts } from './services/poFinalizationReceipts';

const seedLockKey = 520126;

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Refusing to seed in production without ALLOW_DEMO_SEED=true.');
  }

  // Guard: ALLOW_DEMO_SEED=false means never seed (useful for alpha/live environments)
  if (process.env.ALLOW_DEMO_SEED === 'false') {
    console.log('[seed] ALLOW_DEMO_SEED=false — skipping seed entirely');
    await pool.end();
    return;
  }

  await pool.query('select pg_advisory_lock($1)', [seedLockKey]);
  try {
    // Idempotency guard: only seed if the database is empty
    const { rows } = await pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users');
    const userCount = rows[0]?.count ?? 0;
    if (userCount > 0 && process.env.FORCE_RESEED !== 'true') {
      console.log(`[seed] Skipping: ${userCount} users already exist. Set FORCE_RESEED=true to override.`);
      return;
    }

    await pool.query(`
      truncate table
        "session", command_journal, backup_snapshots, photography_queue, archive_runs, period_locks, correction_journal_entries,
        matchmaking_matches, vendor_supply, customer_needs, tag_catalog,
        client_ledger_entries, invoice_disputes, credit_overrides, connector_requests, fulfillment_lines, pick_lists,
        vendor_payments, vendor_bills, payment_allocations, payments, invoices, sales_order_lines, sales_orders,
        purchase_receipt_lines, purchase_receipts, inventory_movements, batches, purchase_order_lines, purchase_orders,
        customer_credit_assessments, credit_recompute_queue,
        credit_engine_config_history, credit_engine_stance_history,
        credit_engine_config, credit_engine_stances,
        user_dismissed_banners,
        document_snapshots,
        contacts, appointments, contact_ledger_entries, contact_merge_candidates,
        items, customers, vendors, users
      restart identity cascade
    `);

    if (process.env.DEMO_SEED_SCENARIO === 'realistic_100d') {
      await seedRealisticDemoData(realisticDemoConfigFromEnv());
    } else {
      await insertSeedData();
    }

    // ---- Credit Engine seed (Phase 1) ----
    const stances = [
      { name: 'Balanced',            description: 'Default; even-handed', revM: 20, cashC: 20, profit: 15, debt: 15, vel: 20, tenure: 10 },
      { name: 'Prioritize Cash',     description: 'Reward customers who pay fast and pay in full', revM: 5,  cashC: 35, profit: 5,  debt: 20, vel: 30, tenure: 5  },
      { name: 'Prioritize Revenue',  description: 'Reward growth and volume', revM: 35, cashC: 10, profit: 25, debt: 10, vel: 10, tenure: 10 },
      { name: 'Conservative',        description: 'Penalize debt and slow payers heavily', revM: 5,  cashC: 25, profit: 10, debt: 35, vel: 20, tenure: 5  },
      { name: 'Loyalty-Weighted',    description: 'Reward long-term customers', revM: 15, cashC: 15, profit: 15, debt: 15, vel: 15, tenure: 25 }
    ];

    let balancedStanceId: string | undefined;
    for (const s of stances) {
      const sum = s.revM + s.cashC + s.profit + s.debt + s.vel + s.tenure;
      if (sum !== 100) {
        throw new Error(`Stance ${s.name} weights sum to ${sum}, expected 100`);
      }
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO credit_engine_stances
           (name, description, weight_revenue_momentum, weight_cash_collection,
            weight_profitability, weight_debt_aging, weight_repayment_velocity,
            weight_tenure_depth, is_seeded)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id`,
        [s.name, s.description, s.revM, s.cashC, s.profit, s.debt, s.vel, s.tenure]
      );
      if (s.name === 'Balanced') {
        balancedStanceId = rows[0].id;
      }
    }
    if (!balancedStanceId) {
      throw new Error('Balanced stance was not seeded');
    }

    await pool.query(
      `INSERT INTO credit_engine_config (global_default_stance_id, shadow_mode)
       SELECT $1, true
       WHERE NOT EXISTS (SELECT 1 FROM credit_engine_config)`,
      [balancedStanceId]
    );
  } finally {
    await pool.query('select pg_advisory_unlock($1)', [seedLockKey]);
  }
}

async function insertSeedData() {
  const passwordHash = await bcrypt.hash('terp-demo', 12);
  const [owner, manager, inventoryOperator, salesOperator, viewer] = await db
    .insert(users)
    .values([
      { name: 'Evan Owner', email: 'owner@terpagro.local', passwordHash, role: 'owner' },
      { name: 'Maya Manager', email: 'manager@terpagro.local', passwordHash, role: 'manager' },
      { name: 'Iris Intake', email: 'intake@terpagro.local', passwordHash, role: 'operator' },
      { name: 'Sam Sales', email: 'sales@terpagro.local', passwordHash, role: 'operator' },
      { name: 'Vic Viewer', email: 'viewer@terpagro.local', passwordHash, role: 'viewer' }
    ])
    .returning();

  const [northCoast, emerald, upland] = await db
    .insert(vendors)
    .values([
      { name: 'North Coast Gardens', termsDays: 10, consignmentDefault: true, contact: 'Rhea - Signal', notes: 'Consignment flower and infused lots.' },
      { name: 'Emerald Processing Co', termsDays: 7, consignmentDefault: false, contact: 'Marco - phone', notes: 'Extracts, carts, and distillate.' },
      { name: 'Upland Craft', termsDays: 14, consignmentDefault: false, contact: 'June - email', notes: 'Office-owned pre-roll inventory.' }
    ])
    .returning();

  const vendorContacts = await db
    .insert(contacts)
    .values([
      { name: 'Rhea Marin', displayName: 'Rhea Marin', email: 'rhea@ncgardens.terpagro.local', phone: '707-555-1001', companyName: 'North Coast Gardens', preferredContactMethod: 'email', notes: 'Primary sales rep', tags: ['sales-rep'], isVendor: true, active: true },
      { name: 'Kai North', displayName: 'Kai North', email: 'kai@ncgardens.terpagro.local', phone: '707-555-1002', companyName: 'North Coast Gardens', preferredContactMethod: 'phone', notes: 'Owner', tags: ['owner'], isVendor: true, active: true },
      { name: 'Marco Silva', displayName: 'Marco Silva', email: 'marco@emeraldproc.terpagro.local', phone: '510-555-1101', companyName: 'Emerald Processing Co', preferredContactMethod: 'email', notes: 'Account Manager', tags: ['account-manager'], isVendor: true, active: true },
      { name: 'June Fields', displayName: 'June Fields', email: 'june@uplandcraft.terpagro.local', phone: '831-555-1201', companyName: 'Upland Craft', preferredContactMethod: 'email', notes: 'Sales Rep', tags: ['sales-rep'], isVendor: true, active: true }
    ])
    .returning();

  await db.update(vendors).set({ contactId: vendorContacts[0].id }).where(eq(vendors.id, northCoast.id));
  await db.update(vendors).set({ contactId: vendorContacts[2].id }).where(eq(vendors.id, emerald.id));
  await db.update(vendors).set({ contactId: vendorContacts[3].id }).where(eq(vendors.id, upland.id));

  // TER-1589: seed secondary brands per vendor
  await db.insert(brands).values([
    { name: 'North Coast Gardens', alias: 'North Coast Gardens', vendorId: northCoast.id },
    { name: 'NCG Indoor', alias: 'NCG Indoor', vendorId: northCoast.id },
    { name: 'NCG Sungrown', alias: 'NCG Sungrown', vendorId: northCoast.id },
    { name: 'Emerald Processing Co', alias: 'Emerald Processing Co', vendorId: emerald.id },
    { name: 'Emerald Labs', alias: 'Emerald Labs', vendorId: emerald.id },
    { name: 'Upland Craft', alias: 'Upland Craft', vendorId: upland.id },
    { name: 'Upland Pre-Rolls', alias: 'Upland Pre-Rolls', vendorId: upland.id }
  ]);

  const [sunset, harbor, valley, cobalt] = await db
    .insert(customers)
    .values([
      { name: 'Sunset Collective', creditLimit: '45000.00', balance: '12850.00', tags: ['infused', 'premium', 'fast-pay'], notes: 'Likes candy SKUs and small mixed drops.' },
      { name: 'Harbor Wellness', creditLimit: '30000.00', balance: '7800.00', tags: ['flower', 'value'], notes: 'Prefers Friday delivery.' },
      { name: 'Valley Meds', creditLimit: '18000.00', balance: '21000.00', tags: ['extract', 'vape'], notes: 'Credit watch. Needs approval for new orders.' },
      { name: 'Cobalt Reserve', creditLimit: '65000.00', balance: '0.00', tags: ['premium', 'flower', 'live'], notes: 'VIP connector customer.' }
    ])
    .returning();

  const customerContacts = await db
    .insert(contacts)
    .values([
      { name: 'Rhea Valdez', displayName: 'Rhea Valdez', email: 'rhea@sunsetcollective.terpagro.local', phone: '415-555-0101', companyName: 'Sunset Collective', preferredContactMethod: 'email', notes: 'Head Buyer', tags: ['head-buyer'], isCustomer: true, active: true },
      { name: 'Marcus Chen', displayName: 'Marcus Chen', email: 'ap@sunsetcollective.terpagro.local', phone: '415-555-0102', companyName: 'Sunset Collective', preferredContactMethod: 'email', notes: 'Accounts Payable', tags: ['ap-contact'], isCustomer: true, active: true },
      { name: 'Dana Brooks', displayName: 'Dana Brooks', email: 'dana@harborwellness.terpagro.local', phone: '510-555-0201', companyName: 'Harbor Wellness', preferredContactMethod: 'email', notes: 'Buyer', tags: ['buyer'], isCustomer: true, active: true },
      { name: 'James Park', displayName: 'James Park', email: 'ops@harborwellness.terpagro.local', phone: '510-555-0202', companyName: 'Harbor Wellness', preferredContactMethod: 'phone', notes: 'Operations Manager', tags: ['operations-manager'], isCustomer: true, active: true },
      { name: 'Tina Ortiz', displayName: 'Tina Ortiz', email: 'tina@valleymeds.terpagro.local', phone: '209-555-0301', companyName: 'Valley Meds', preferredContactMethod: 'email', notes: 'Buyer', tags: ['buyer'], isCustomer: true, active: true },
      { name: 'Leo Stone', displayName: 'Leo Stone', email: 'leo@cobaltreserve.terpagro.local', phone: '707-555-0401', companyName: 'Cobalt Reserve', preferredContactMethod: 'email', notes: 'Head Buyer', tags: ['head-buyer'], isCustomer: true, active: true },
      { name: 'Nina Cross', displayName: 'Nina Cross', email: 'vip@cobaltreserve.terpagro.local', phone: '707-555-0402', companyName: 'Cobalt Reserve', preferredContactMethod: 'phone', notes: 'VIP Relations', tags: ['vip-relations'], isCustomer: true, active: true }
    ])
    .returning();

  await db.update(customers).set({ contactId: customerContacts[0].id }).where(eq(customers.id, sunset.id));
  await db.update(customers).set({ contactId: customerContacts[2].id }).where(eq(customers.id, harbor.id));
  await db.update(customers).set({ contactId: customerContacts[4].id }).where(eq(customers.id, valley.id));
  await db.update(customers).set({ contactId: customerContacts[5].id }).where(eq(customers.id, cobalt.id));

  await db.insert(tagCatalog).values([
    { slug: 'infused', label: 'Infused', color: 'purple', description: 'Infused product family' },
    { slug: 'candy', label: 'Candy', color: 'orange', description: 'Candy and edible shorthand' },
    { slug: 'premium', label: 'Premium', color: 'green', description: 'Premium buyer or inventory signal' },
    { slug: 'flower', label: 'Flower', color: 'green', description: 'Flower product family' },
    { slug: 'value', label: 'Value', color: 'gray', description: 'Value buyer or stock signal' },
    { slug: 'extract', label: 'Extract', color: 'blue', description: 'Extract product family' },
    { slug: 'live', label: 'Live', color: 'blue', description: 'Live resin or live rosin signal' },
    { slug: 'vape', label: 'Vape', color: 'yellow', description: 'Vape product family' },
    { slug: 'pre-roll', label: 'Pre-roll', color: 'gray', description: 'Pre-roll product family' }
  ]);

  const [candy, flower, rosin, preroll, vape] = await db
    .insert(items)
    .values([
      { sku: 'INS-CANDY', name: 'Infused Candy', category: 'Infused', tags: ['infused', 'candy', 'premium'], pricingRule: { margin: 0.32, customerFacing: true } },
      { sku: 'FLW-GELATO', name: 'Gelato Flower', category: 'Flower', tags: ['flower', 'premium'], pricingRule: { margin: 0.28, customerFacing: true } },
      { sku: 'EXT-ROSIN', name: 'Live Rosin', category: 'Extract', tags: ['extract', 'live', 'premium'], pricingRule: { margin: 0.35, customerFacing: true } },
      { sku: 'PRL-HOUSE', name: 'House Pre-roll', category: 'Pre-roll', tags: ['value', 'pre-roll'], pricingRule: { margin: 0.22, customerFacing: true } },
      { sku: 'VAP-LIVE', name: 'Live Resin Cart', category: 'Vape', tags: ['vape', 'live'], pricingRule: { margin: 0.3, customerFacing: true } }
    ])
    .returning();

  const [poApproved, poDraft] = await db
    .insert(purchaseOrders)
    .values([
      { poNo: 'PO-DEMO-001', vendorId: northCoast.id, status: 'approved', expectedDate: daysFromNow(1), orderedAt: daysAgo(1), orderedBy: manager.id, total: '5040.00', buyerNotes: 'Restock candy before the weekend rush.', internalNotes: 'Receive to intake first; verify ownership marker with Rhea.' },
      { poNo: 'PO-DEMO-002', vendorId: emerald.id, status: 'draft', expectedDate: daysFromNow(4), orderedBy: inventoryOperator.id, total: '3200.00', buyerNotes: 'Planning rosin reorder; confirm terp profile before approval.', internalNotes: 'Cost is real, quantity may change.' }
    ])
    .returning();

  await db.insert(purchaseOrderLines).values([
    { purchaseOrderId: poApproved.id, itemId: candy.id, productName: 'Infused Candy 10mg', category: 'Infused', tags: ['infused', 'candy', 'premium'], qty: '120.000', receivedQty: '0.000', uom: 'case', unitCost: '42.00', unitPrice: '68.00', sourceCode: 'PO-DEMO-001', shorthand: 'Ins/candy', legacyMarker: 'C', ownershipStatus: 'C', notes: 'Approved purchase before product arrives.', status: 'planned' },
    { purchaseOrderId: poDraft.id, itemId: rosin.id, productName: 'Live Rosin 1g', category: 'Extract', tags: ['extract', 'live', 'premium'], qty: '200.000', receivedQty: '0.000', uom: 'unit', unitCost: '16.00', unitPrice: '27.00', sourceCode: 'PO-DEMO-002', shorthand: 'Ext/rosin', legacyMarker: 'OFC', ownershipStatus: 'OFC', notes: 'Draft purchase planning row.', status: 'planned' }
  ]);

  // Finalized PO — required so the "Preview receipt" button is enabled in the UI
  // and so receipt-preview E2E tests can run without test.skip.
  const [poFinalized] = await db
    .insert(purchaseOrders)
    .values([{
      poNo: 'PO-DEMO-003',
      vendorId: northCoast.id,
      status: 'finalized',
      expectedDate: daysAgo(1),
      orderedAt: daysAgo(7),
      orderedBy: manager.id,
      total: '7200.00',
      finalizedAt: daysAgo(3),
      buyerNotes: 'Finalized flower order — receipt ready for vendor.',
      internalNotes: 'Verified against intake batch. All lines received.',
      paymentTerms: 'net_30',
    }])
    .returning();

  await db.insert(purchaseOrderLines).values([
    {
      purchaseOrderId: poFinalized.id,
      itemId: flower.id,
      productName: 'Gelato Flower',
      category: 'Flower',
      tags: ['flower', 'premium'],
      qty: '30.000',
      receivedQty: '30.000',
      uom: 'lb',
      unitCost: '240.00',
      unitPrice: '380.00',
      sourceCode: 'PO-DEMO-003',
      shorthand: 'Flw/gelato',
      legacyMarker: 'OFC',
      ownershipStatus: 'OFC',
      notes: 'Received in full.',
      status: 'planned',
    },
  ]);

  // Create the document_snapshots rows (external + internal) so the UI
  // receipt preview button is enabled. Uses raw pool — pg advisory locks
  // in poFinalizationReceipts require their own BEGIN/COMMIT.
  await createPoFinalizationReceipts(pool, poFinalized.id, 'seed-auto', manager.id);

  const [batchA, batchB, batchC, batchD, batchE, batchReady] = await db
    .insert(batches)
    .values([
      { itemId: candy.id, vendorId: northCoast.id, batchCode: 'BATCH-DEMO-001', sourceCode: 'NC-0426-A', shorthand: 'Ins/candy', legacyMarker: 'C', name: 'Infused Candy 10mg', category: 'Infused', tags: ['infused', 'candy', 'premium'], intakeQty: '120.000', availableQty: '96.000', uom: 'case', unitCost: '42.00', unitPrice: '68.00', ticketCost: '5040.00', priceRange: '60-72', location: 'A1', lotCode: 'NC-IC-0426', intakeDate: daysAgo(18), notes: 'Consigned candy lot from shared sheet intake area. Rich asked about 25 flex.', ownershipStatus: 'C', arrivalConfirmed: true, arrivalStatus: 'arrived', mediaStatus: 'done', status: 'posted', postedAt: daysAgo(18) },
      { itemId: flower.id, vendorId: northCoast.id, batchCode: 'BATCH-DEMO-002', sourceCode: 'M15-NC-0501-F', shorthand: 'Flw/gelato', legacyMarker: 'C', name: 'Gelato Flower', category: 'Flower', tags: ['flower', 'premium'], intakeQty: '45.000', availableQty: '31.500', uom: 'lb', unitCost: '780.00', unitPrice: '1120.00', ticketCost: '35100.00', priceRange: '1000-1200', location: 'Vault-2', lotCode: 'NC-GEL-0501', intakeDate: daysAgo(35), notes: 'Aging premium flower candidate. Source note M15 rich.', ownershipStatus: 'C', arrivalConfirmed: true, arrivalStatus: 'arrived', mediaStatus: 'done', status: 'posted', postedAt: daysAgo(35), createdAt: daysAgo(35), updatedAt: daysAgo(35) },
      { itemId: rosin.id, vendorId: emerald.id, batchCode: 'BATCH-DEMO-003', sourceCode: 'EM-0504-R', shorthand: 'Ext/rosin', legacyMarker: 'OFC', name: 'Live Rosin 1g', category: 'Extract', tags: ['extract', 'live', 'premium'], intakeQty: '300.000', availableQty: '188.000', uom: 'unit', unitCost: '16.00', unitPrice: '27.00', ticketCost: '4800.00', priceRange: '25-34', location: 'Cold-1', lotCode: 'EM-LR-0504', intakeDate: daysAgo(8), notes: 'Office-owned rosin.', ownershipStatus: 'OFC', arrivalConfirmed: true, arrivalStatus: 'arrived', mediaStatus: 'in_progress', status: 'posted', postedAt: daysAgo(8) },
      { itemId: preroll.id, vendorId: upland.id, batchCode: 'BATCH-DEMO-004', sourceCode: 'UP-0505-P', shorthand: 'Prl/house', legacyMarker: 'ofc', name: 'House Pre-roll 1g', category: 'Pre-roll', tags: ['value', 'pre-roll'], intakeQty: '1000.000', availableQty: '740.000', uom: 'unit', unitCost: '2.10', unitPrice: '4.00', ticketCost: '2100.00', priceRange: '3-5', location: 'B3', lotCode: 'UP-PR-0505', intakeDate: daysAgo(4), notes: 'Fast reorder candidate for value buyers.', ownershipStatus: 'OFC', arrivalConfirmed: true, arrivalStatus: 'arrived', mediaStatus: 'open', status: 'posted', postedAt: daysAgo(4) },
      { itemId: vape.id, vendorId: emerald.id, batchCode: 'BATCH-DEMO-005', sourceCode: 'EM-0420-V', shorthand: 'Vap/live', legacyMarker: 'CV', name: 'Live Resin Cart', category: 'Vape', tags: ['vape', 'live'], intakeQty: '250.000', availableQty: '0.000', uom: 'unit', unitCost: '14.50', unitPrice: '24.00', ticketCost: '3625.00', priceRange: '22-28', location: 'C2', lotCode: 'EM-VP-0420', intakeDate: daysAgo(21), notes: 'Depleted lot for consignment/reorder proof.', ownershipStatus: 'OFC', arrivalConfirmed: true, arrivalStatus: 'arrived', mediaStatus: 'done', status: 'posted', postedAt: daysAgo(21) },
      { itemId: candy.id, vendorId: northCoast.id, batchCode: 'BATCH-READY-001', sourceCode: 'NC-0511-S', shorthand: 'Ins/candy', legacyMarker: 'T', name: 'Infused Candy Sour', category: 'Infused', tags: ['infused', 'candy'], intakeQty: '80.000', availableQty: '0.000', uom: 'case', unitCost: '39.00', unitPrice: '64.00', ticketCost: '3120.00', priceRange: '58-68', location: 'Receiving', lotCode: 'NC-SOUR-0511', intakeDate: new Date(), notes: 'Ready row waiting on Process Intake.', ownershipStatus: 'UNKNOWN', arrivalConfirmed: true, arrivalStatus: 'arrived', validationIssues: [], mediaStatus: 'open', status: 'ready' }
    ])
    .returning();

  await db.insert(inventoryMovements).values([
    { batchId: batchA.id, kind: 'intake_posted', qtyDelta: '120.000', reason: 'Seed intake' },
    { batchId: batchB.id, kind: 'intake_posted', qtyDelta: '45.000', reason: 'Seed intake' },
    { batchId: batchC.id, kind: 'intake_posted', qtyDelta: '300.000', reason: 'Seed intake' },
    { batchId: batchD.id, kind: 'intake_posted', qtyDelta: '1000.000', reason: 'Seed intake' }
  ]);

  const [orderA, orderB] = await db
    .insert(salesOrders)
    .values([
      { orderNo: 'SO-DEMO-001', customerId: sunset.id, status: 'confirmed', pricingStrategy: 'premium', total: '5940.00', internalMargin: '2280.00', deliveryWindow: 'Today 2-4p', notes: 'Confirmed order ready for posting.', legacyStatusMarkers: 'P/Iv', packed: false, inventoryPosted: false, paymentFollowup: false },
      { orderNo: 'SO-DEMO-002', customerId: harbor.id, status: 'posted', pricingStrategy: 'standard', total: '5600.00', internalMargin: '1700.00', deliveryWindow: 'Tomorrow AM', notes: 'Posted invoice partially paid.', legacyStatusMarkers: 'P,Iv', inventoryPosted: true, postedAt: daysAgo(1) }
    ])
    .returning();

  const [lineA, lineB, lineC] = await db
    .insert(salesOrderLines)
    .values([
      { orderId: orderA.id, batchId: batchA.id, itemName: batchA.name, qty: '40.000', unitPrice: '72.00', unitCost: '42.00', sourceRowKey: batchA.batchCode, legacyStatusMarker: 'P', status: 'reserved' },
      { orderId: orderA.id, batchId: batchC.id, itemName: batchC.name, qty: '90.000', unitPrice: '34.00', unitCost: '16.00', sourceRowKey: batchC.batchCode, legacyStatusMarker: 'Iv', status: 'reserved' },
      { orderId: orderB.id, batchId: batchB.id, itemName: batchB.name, qty: '5.000', unitPrice: '1120.00', unitCost: '780.00', sourceRowKey: batchB.batchCode, legacyStatusMarker: 'M', inventoryPosted: true, status: 'posted' }
    ])
    .returning();

  const [invoice] = await db
    .insert(invoices)
    .values({ invoiceNo: 'INV-DEMO-001', customerId: harbor.id, orderId: orderB.id, status: 'partial', total: '5600.00', amountPaid: '2000.00', dueDate: daysFromNow(5) })
    .returning();

  const [payment] = await db
    .insert(payments)
    .values({ customerId: harbor.id, direction: 'money_in', category: 'client_payment', allocationIntent: 'selected_invoice', method: 'cash', amount: '2000.00', unappliedAmount: '0.00', reference: 'cash-file-0511', locationBucket: 'cash-file-a', impactPreview: 'Applied to INV-DEMO-001.', notes: 'Seed partial payment with oldest-invoice allocation.', status: 'posted' })
    .returning();

  await db.insert(clientLedgerEntries).values([
    { customerId: harbor.id, invoiceId: invoice.id, kind: 'invoice', amount: '5600.00', balanceAfter: '13400.00', note: 'SO-DEMO-002' },
    { customerId: harbor.id, paymentId: payment.id, kind: 'payment_allocation', amount: '-2000.00', balanceAfter: '7800.00', note: 'Seed allocation' }
  ]);

  await db.insert(vendorBills).values([
    { vendorId: northCoast.id, billNo: 'VBILL-DEMO-001', amount: '14280.00', amountPaid: '0.00', dueDate: daysFromNow(2), status: 'approved', termsDays: 10, consignmentTriggered: true, dueReason: 'Due because consigned inventory depleted' },
    { vendorId: emerald.id, billNo: 'VBILL-DEMO-002', amount: '4800.00', amountPaid: '2400.00', dueDate: daysFromNow(7), status: 'scheduled', scheduledFor: daysFromNow(3), termsDays: 7, dueReason: 'Scheduled payment event exists' },
    { vendorId: upland.id, billNo: 'VBILL-DEMO-003', amount: '2100.00', amountPaid: '0.00', dueDate: daysFromNow(12), status: 'open', termsDays: 14, dueReason: 'Net terms payable' }
  ]);

  const [pick] = await db.insert(pickLists).values({ pickNo: 'PICK-DEMO-001', orderId: orderB.id, assignedTo: inventoryOperator.id, status: 'open', unitsPerBag: 10, labelFormat: '4x6' }).returning();
  await db.insert(fulfillmentLines).values([
    { pickListId: pick.id, orderLineId: lineC.id, batchId: batchB.id, expectedQty: '5.000', actualQty: '0.000', actualWeight: '0.000', status: 'open' }
  ]);

  await db.insert(connectorRequests).values([
    { source: 'vip', requestType: 'catalog_request', customerId: cobalt.id, payload: { category: 'Flower', priceVisibility: 'customer' }, status: 'open' },
    { source: 'live-shopping', requestType: 'reserve_request', customerId: sunset.id, payload: { sku: 'INS-CANDY', qty: 20 }, status: 'open' },
    { source: 'mobile-scan', requestType: 'bag_scan', customerId: null, payload: { bagCode: 'BAG-447', orderNo: 'SO-DEMO-001' }, status: 'routed', routedTo: 'fulfillment', operatorNotes: 'Scan accepted for fulfillment review; no direct ledger mutation.', reviewHistory: [{ status: 'routed', actorName: 'Maya Manager', at: new Date().toISOString() }] }
  ]);

  const [needA, needB, needC] = await db
    .insert(customerNeeds)
    .values([
      {
        needCode: 'NEED-DEMO-001',
        customerId: cobalt.id,
        productName: 'Premium indoor flower',
        category: 'Flower',
        tags: ['premium', 'flower'],
        qtyMin: '20.000',
        qtyMax: '40.000',
        targetPrice: '1050.00',
        neededBy: daysFromNow(6),
        urgency: 'high',
        ownerId: salesOperator.id,
        notes: 'Customer asked for tight bag appeal; not necessarily in current stock.'
      },
      {
        needCode: 'NEED-DEMO-002',
        customerId: sunset.id,
        productName: 'Candy restock',
        category: 'Infused',
        tags: ['infused', 'candy'],
        qtyMin: '80.000',
        qtyMax: '150.000',
        targetPrice: '65.00',
        neededBy: daysFromNow(3),
        urgency: 'normal',
        ownerId: salesOperator.id,
        notes: 'Keep customer-safe catalog price hidden until sales sheet.'
      },
      {
        needCode: 'NEED-DEMO-003',
        customerId: valley.id,
        productName: 'Live vape carts',
        category: 'Vape',
        tags: ['vape', 'live'],
        qtyMin: '100.000',
        qtyMax: '200.000',
        targetPrice: '23.00',
        neededBy: daysFromNow(10),
        urgency: 'watch',
        ownerId: manager.id,
        notes: 'Credit watch; match only, do not auto-sell.'
      }
    ])
    .returning();

  const [supplyA, supplyB, supplyC] = await db
    .insert(vendorSupply)
    .values([
      {
        supplyCode: 'VS-DEMO-001',
        vendorId: northCoast.id,
        productName: 'Indoor Gelato smalls',
        category: 'Flower',
        tags: ['premium', 'flower'],
        availableQty: '35.000',
        askingPrice: '980.00',
        availableDate: daysFromNow(2),
        location: 'Vendor vault',
        grade: 'Smalls',
        terms: 'Consignment possible',
        notes: 'Vendor has not sold this to the office yet.'
      },
      {
        supplyCode: 'VS-DEMO-002',
        vendorId: northCoast.id,
        productName: 'Sour candy cases',
        category: 'Infused',
        tags: ['infused', 'candy'],
        availableQty: '120.000',
        askingPrice: '42.00',
        availableDate: daysFromNow(1),
        location: 'North Coast',
        grade: 'Standard',
        terms: 'Net 10',
        notes: 'Likely fill for Sunset need.'
      },
      {
        supplyCode: 'VS-DEMO-003',
        vendorId: emerald.id,
        productName: 'Live resin cart overrun',
        category: 'Vape',
        tags: ['vape', 'live'],
        availableQty: '180.000',
        askingPrice: '14.50',
        availableDate: daysFromNow(5),
        location: 'Emerald shop',
        grade: 'A',
        terms: 'Office-owned buy',
        notes: 'Possible match; customer credit still separate.'
      }
    ])
    .returning();

  await db.insert(matchmakingMatches).values([
    { customerNeedId: needA.id, vendorSupplyId: supplyA.id, score: 100, reasons: ['Category match', 'Tags: premium, flower', 'Quantity covers minimum', 'Ask is within target', 'Available before needed-by'] },
    { customerNeedId: needB.id, vendorSupplyId: supplyB.id, score: 100, reasons: ['Category match', 'Tags: infused, candy', 'Quantity covers minimum', 'Ask is within target', 'Available before needed-by'] },
    { customerNeedId: needC.id, vendorSupplyId: supplyC.id, score: 100, reasons: ['Category match', 'Tags: vape, live', 'Quantity covers minimum', 'Ask is within target', 'Available before needed-by'] }
  ]);

  await db.insert(backupSnapshots).values({
    label: 'Seed baseline',
    snapshot: {
      createdAt: new Date().toISOString(),
      note: 'Read-only restore preview baseline',
      counts: { batches: 6, purchaseOrders: 2, customers: 4, orders: 2 }
    }
  });

  await db.insert(commandJournal).values({
    commandName: 'createCorrectionJournalEntry',
    idempotencyKey: 'seed-command-journal-0001',
    actorId: owner.id,
    actorName: owner.name,
    actorRole: owner.role,
    reason: 'Seed activity',
    inputPayload: { memo: 'Seed activity' },
    status: 'ok',
    affectedIds: [],
    beforeSnapshot: {},
    afterSnapshot: {},
    result: { ok: true, commandId: 'seed-command-journal-0001', affectedIds: [], toast: 'Seed activity loaded.' }
  });

  console.log('Seeded TERP Operator demo data.');
  console.log('Demo login: owner@terpagro.local / terp-demo');
  console.log(`Additional users: ${manager.email}, ${inventoryOperator.email}, ${salesOperator.email}, ${viewer.email}`);
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

seed()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
