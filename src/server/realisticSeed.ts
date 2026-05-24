import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import {
  archiveRuns,
  backupSnapshots,
  batches,
  clientLedgerEntries,
  commandJournal,
  connectorRequests,
  correctionJournalEntries,
  creditOverrides,
  fulfillmentLines,
  inventoryMovements,
  invoiceDisputes,
  invoices,
  items,
  matchmakingMatches,
  paymentAllocations,
  payments,
  periodLocks,
  photographyQueue,
  pickLists,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
  salesOrderLines,
  salesOrders,
  tagCatalog,
  users,
  vendorBills,
  vendorPayments,
  vendors,
  vendorSupply,
  customers,
  customerNeeds
} from './schema';

type Insertable<T extends { $inferInsert: unknown }> = T['$inferInsert'];

type FlowerGrade = 'outdoor' | 'deps' | 'indoor';

interface RealisticDemoConfig {
  days: number;
  monthlyRevenue: number;
  flowerRevenueShare: number;
  consignedFlowerPurchaseShare: number;
  consignedFlowerRangeShare: number;
  whaleCustomers: number;
  smallerCustomers: number;
  largeVendors: number;
  otherVendors: number;
  seed: number;
  flowerAvgPrice: Record<FlowerGrade, number>;
}

interface MutableBatch {
  id: string;
  batchCode: string;
  vendorId: string;
  itemId: string;
  itemName: string;
  grade?: FlowerGrade;
  category: string;
  tags: string[];
  ownershipStatus: string;
  intakeQty: number;
  remainingQty: number;
  unitCost: number;
  unitPrice: number;
  priceRange: string | null;
  createdAt: Date;
}

interface CustomerSeed {
  id: string;
  name: string;
  kind: 'whale' | 'small';
  creditLimit: number;
}

const DEFAULT_REALISTIC_DEMO_CONFIG: RealisticDemoConfig = {
  days: 110,
  monthlyRevenue: 4_000_000,
  flowerRevenueShare: 0.95,
  consignedFlowerPurchaseShare: 0.85,
  consignedFlowerRangeShare: 0.5,
  whaleCustomers: 8,
  smallerCustomers: 15,
  largeVendors: 4,
  otherVendors: 15,
  seed: 520126,
  flowerAvgPrice: {
    outdoor: 150,
    deps: 550,
    indoor: 1100
  }
};

const flowerGradeMix: Array<{ grade: FlowerGrade; revenueShare: number; batchCount: number; tag: string; label: string }> = [
  { grade: 'outdoor', revenueShare: 0.12, batchCount: 34, tag: 'outdoor', label: 'Outdoor Flower' },
  { grade: 'deps', revenueShare: 0.38, batchCount: 42, tag: 'mixed-light', label: 'Mixed Light Flower' },
  { grade: 'indoor', revenueShare: 0.5, batchCount: 52, tag: 'indoor', label: 'Indoor Flower' }
];

export function realisticDemoConfigFromEnv(env = process.env): RealisticDemoConfig {
  return {
    ...DEFAULT_REALISTIC_DEMO_CONFIG,
    days: numberEnv(env.DEMO_DAYS, DEFAULT_REALISTIC_DEMO_CONFIG.days),
    monthlyRevenue: numberEnv(env.DEMO_MONTHLY_REVENUE, DEFAULT_REALISTIC_DEMO_CONFIG.monthlyRevenue),
    flowerRevenueShare: ratioEnv(env.DEMO_FLOWER_REVENUE_SHARE, DEFAULT_REALISTIC_DEMO_CONFIG.flowerRevenueShare),
    consignedFlowerPurchaseShare: ratioEnv(env.DEMO_CONSIGNED_FLOWER_PURCHASE_SHARE, DEFAULT_REALISTIC_DEMO_CONFIG.consignedFlowerPurchaseShare),
    consignedFlowerRangeShare: ratioEnv(env.DEMO_CONSIGNED_FLOWER_RANGE_SHARE, DEFAULT_REALISTIC_DEMO_CONFIG.consignedFlowerRangeShare),
    whaleCustomers: numberEnv(env.DEMO_WHALE_CUSTOMERS, DEFAULT_REALISTIC_DEMO_CONFIG.whaleCustomers),
    smallerCustomers: numberEnv(env.DEMO_SMALL_CUSTOMERS, DEFAULT_REALISTIC_DEMO_CONFIG.smallerCustomers),
    largeVendors: numberEnv(env.DEMO_LARGE_VENDORS, DEFAULT_REALISTIC_DEMO_CONFIG.largeVendors),
    otherVendors: numberEnv(env.DEMO_OTHER_VENDORS, DEFAULT_REALISTIC_DEMO_CONFIG.otherVendors),
    seed: numberEnv(env.DEMO_RANDOM_SEED, DEFAULT_REALISTIC_DEMO_CONFIG.seed),
    flowerAvgPrice: {
      outdoor: numberEnv(env.DEMO_OUTDOOR_AVG_PRICE, DEFAULT_REALISTIC_DEMO_CONFIG.flowerAvgPrice.outdoor),
      deps: numberEnv(env.DEMO_DEPS_AVG_PRICE, DEFAULT_REALISTIC_DEMO_CONFIG.flowerAvgPrice.deps),
      indoor: numberEnv(env.DEMO_INDOOR_AVG_PRICE, DEFAULT_REALISTIC_DEMO_CONFIG.flowerAvgPrice.indoor)
    }
  };
}

export async function seedRealisticDemoData(config = realisticDemoConfigFromEnv()) {
  const rng = makeRng(config.seed);
  const passwordHash = await bcrypt.hash('terp-demo', 12);
  const [owner, manager, inventoryOperator, salesOperator, warehouseOperator, viewer] = await db
    .insert(users)
    .values([
      { name: 'Evan Owner', email: 'owner@terpagro.local', passwordHash, role: 'owner' },
      { name: 'Maya Manager', email: 'manager@terpagro.local', passwordHash, role: 'manager' },
      { name: 'Iris Intake', email: 'intake@terpagro.local', passwordHash, role: 'operator' },
      { name: 'Sam Sales', email: 'sales@terpagro.local', passwordHash, role: 'operator' },
      { name: 'Wes Warehouse', email: 'warehouse@terpagro.local', passwordHash, role: 'operator' },
      { name: 'Vic Viewer', email: 'viewer@terpagro.local', passwordHash, role: 'viewer' }
    ])
    .returning();

  await seedTags();
  const itemRows = await seedItems();
  const vendorRows = await seedVendors(config);
  const customerRows = await seedCustomers(config);
  const customerSeeds: CustomerSeed[] = customerRows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.tags.includes('whale') ? 'whale' : 'small',
    creditLimit: Number(row.creditLimit)
  }));

  const mutableBatches = await seedPurchasingAndInventory(config, rng, itemRows, vendorRows, inventoryOperator.id, manager.id);
  const customerBalances = new Map(customerRows.map((customer) => [customer.id, 0]));
  const { orderCount, invoiceCount, paymentCount, totalRevenue, flowerRevenue } = await seedSalesAccountingAndFulfillment(
    config,
    rng,
    mutableBatches,
    customerSeeds,
    { ownerId: owner.id, managerId: manager.id, salesOperatorId: salesOperator.id, warehouseOperatorId: warehouseOperator.id },
    customerBalances
  );
  await seedActiveOperatorWork(config, rng, itemRows, vendorRows, customerSeeds, mutableBatches, {
    managerId: manager.id,
    inventoryOperatorId: inventoryOperator.id,
    salesOperatorId: salesOperator.id,
    warehouseOperatorId: warehouseOperator.id
  });
  await seedMatchmaking(config, rng, customerSeeds, vendorRows, salesOperator.id);
  await seedConnectors(rng, customerSeeds, warehouseOperator.id);
  await seedOperationalControls(config, {
    ownerId: owner.id,
    managerId: manager.id,
    orderCount,
    invoiceCount,
    paymentCount,
    batchCount: mutableBatches.length,
    totalRevenue,
    flowerRevenue
  });

  for (const [customerId, balance] of customerBalances.entries()) {
    await db.update(customers).set({ balance: money(balance), updatedAt: new Date() }).where(eq(customers.id, customerId));
  }

  console.log(`Seeded TERP Operator realistic demo data: ${config.days} days, ${money(totalRevenue)} revenue, ${money(flowerRevenue)} flower revenue.`);
  console.log('Demo login: owner@terpagro.local / terp-demo');
}

async function seedTags() {
  await db.insert(tagCatalog).values(
    ['flower', 'outdoor', 'mixed-light', 'deps', 'indoor', 'premium', 'value', 'consignment', 'range-priced', 'credit', 'whale', 'small', 'infused', 'candy', 'extract', 'vape', 'pre-roll', 'overdue', 'fast-pay', 'matchmaking'].map((slug) => ({
      slug,
      label: labelize(slug),
      color: tagColor(slug),
      description: `Demo tag: ${labelize(slug)}`
    }))
  );
}

async function seedItems() {
  return db
    .insert(items)
    .values([
      { sku: 'FLW-OUTDOOR', name: 'Outdoor Flower', category: 'Flower', tags: ['flower', 'outdoor', 'value'], pricingRule: { avgSalePrice: 150 } },
      { sku: 'FLW-DEPS', name: 'Mixed Light Flower', category: 'Flower', tags: ['flower', 'mixed-light', 'deps'], pricingRule: { avgSalePrice: 550 } },
      { sku: 'FLW-INDOOR', name: 'Indoor Flower', category: 'Flower', tags: ['flower', 'indoor', 'premium'], pricingRule: { avgSalePrice: 1100 } },
      { sku: 'INS-CANDY', name: 'Infused Candy', category: 'Infused', tags: ['infused', 'candy'], pricingRule: { avgSalePrice: 68 } },
      { sku: 'EXT-ROSIN', name: 'Live Rosin', category: 'Extract', tags: ['extract', 'premium'], pricingRule: { avgSalePrice: 30 } },
      { sku: 'VAP-LIVE', name: 'Live Resin Cart', category: 'Vape', tags: ['vape'], pricingRule: { avgSalePrice: 24 } },
      { sku: 'PRL-HOUSE', name: 'House Pre-roll', category: 'Pre-roll', tags: ['pre-roll', 'value'], pricingRule: { avgSalePrice: 4 } }
    ])
    .returning();
}

async function seedVendors(config: RealisticDemoConfig) {
  const large = ['North Coast Gardens', 'Emerald Triangle Supply', 'Upland Craft Farm', 'Sun Valley Mixed Light'];
  const other = ['Redwood Ridge', 'Fogline Farms', 'Sierra Canna', 'High Desert House', 'Mendocino Lane', 'Pacific Resin Co', 'Boulder Creek', 'Valley Cure', 'Coastal Cure', 'Marin Harvest', 'Vista Verde', 'Golden State Supply', 'Humboldt Depot', 'Canyon Flower', 'Monarch Outdoor'];
  return db
    .insert(vendors)
    .values([
      ...large.slice(0, config.largeVendors).map((name, index) => ({
        name,
        termsDays: 7 + index * 3,
        consignmentDefault: index !== 1,
        contact: `${firstName(index)} - Signal`,
        notes: `large-vendor; steady supplier; ${index === 1 ? 'office-owned extracts and carts' : 'flower consignment friendly'}`
      })),
      ...other.slice(0, config.otherVendors).map((name, index) => ({
        name,
        termsDays: 10 + (index % 4) * 4,
        consignmentDefault: index % 3 !== 0,
        contact: `${firstName(index + 10)} - phone`,
        notes: 'other-vendor; intermittent supply; use for long-tail vendor payable scenarios'
      }))
    ])
    .returning();
}

async function seedCustomers(config: RealisticDemoConfig) {
  const whales = ['Cobalt Reserve', 'Sunset Collective', 'Harbor Wellness', 'Golden Gate Buyers', 'Maven Provisions', 'Lighthouse Retail Group', 'Redwood Buyers Club', 'Canyon Market'];
  const small = ['Valley Meds', 'Oak Street Wellness', 'Moss Landing Co-op', 'Mission Relief', 'Green Door Collective', 'Northside Patient Care', 'Pine Hill Supply', 'Metro Herb', 'Lagoon Wellness', 'Silver Lake Buyers', 'East Bay Select', 'Vista Patient Group', 'Prairie House', 'Capitol Cure', 'Coastal Corner'];
  return db
    .insert(customers)
    .values([
      ...whales.slice(0, config.whaleCustomers).map((name, index) => ({
        name,
        creditLimit: money(450_000 + index * 65_000),
        balance: '0.00',
        tags: ['whale', 'flower', index % 2 ? 'mixed-light' : 'indoor', 'credit'],
        notes: 'whale; revolving credit; usually pays prior purchases while taking new inventory on credit'
      })),
      ...small.slice(0, config.smallerCustomers).map((name, index) => ({
        name,
        creditLimit: money(35_000 + (index % 5) * 15_000),
        balance: '0.00',
        tags: ['small', index % 3 === 0 ? 'overdue' : 'fast-pay', index % 2 ? 'value' : 'premium'],
        notes: index % 4 === 0 ? 'smaller customer; overdue watch; require payment conversation before large order' : 'smaller customer; mixed payment habits'
      }))
    ])
    .returning();
}

async function seedPurchasingAndInventory(
  config: RealisticDemoConfig,
  rng: () => number,
  itemRows: Array<typeof items.$inferSelect>,
  vendorRows: Array<typeof vendors.$inferSelect>,
  inventoryOperatorId: string,
  managerId: string
) {
  const targetRevenue = (config.monthlyRevenue / 30) * config.days;
  const targetFlowerRevenue = targetRevenue * config.flowerRevenueShare;
  const flowerItems = Object.fromEntries(itemRows.filter((item) => item.category === 'Flower').map((item) => [item.sku, item]));
  const mutableBatches: MutableBatch[] = [];
  const poRows: Insertable<typeof purchaseOrders>[] = [];
  const poLineRows: Insertable<typeof purchaseOrderLines>[] = [];
  const batchRows: Insertable<typeof batches>[] = [];
  const movementRows: Insertable<typeof inventoryMovements>[] = [];
  let totalFlowerQty = 0;

  for (const gradeEntry of flowerGradeMix) {
    const totalGradeRevenue = targetFlowerRevenue * gradeEntry.revenueShare;
    const avgPrice = config.flowerAvgPrice[gradeEntry.grade];
    const totalQty = (totalGradeRevenue / avgPrice) * 1.18;
    const qtyPerBatch = totalQty / gradeEntry.batchCount;
    const item = flowerItems[gradeEntry.grade === 'outdoor' ? 'FLW-OUTDOOR' : gradeEntry.grade === 'deps' ? 'FLW-DEPS' : 'FLW-INDOOR'];
    let gradeConsignedQty = 0;
    let gradeConsignedRangeQty = 0;
    for (let index = 0; index < gradeEntry.batchCount; index += 1) {
      totalFlowerQty += qtyPerBatch;
      const targetConsignedQty = totalQty * config.consignedFlowerPurchaseShare;
      const isConsigned = gradeConsignedQty < targetConsignedQty;
      if (isConsigned) gradeConsignedQty += qtyPerBatch;
      const targetRangeQty = targetConsignedQty * config.consignedFlowerRangeShare;
      const hasRange = isConsigned && gradeConsignedRangeQty < targetRangeQty;
      if (hasRange) gradeConsignedRangeQty += qtyPerBatch;
      const intakeDate = daysAgo(config.days - Math.floor((index / gradeEntry.batchCount) * config.days));
      const vendor = pick(vendorRows.slice(0, 4), rng);
      const batchCode = `FLW-${gradeEntry.grade.toUpperCase()}-${String(index + 1).padStart(3, '0')}`;
      const unitCost = avgPrice * (gradeEntry.grade === 'indoor' ? 0.62 : gradeEntry.grade === 'deps' ? 0.58 : 0.54) * randBetween(rng, 0.94, 1.06);
      const low = unitCost * 0.92;
      const high = unitCost * 1.12;
      poRows.push({
        poNo: `PO-${batchCode}`,
        vendorId: vendor.id,
        status: 'received',
        expectedDate: addDays(intakeDate, -1),
        orderedAt: addDays(intakeDate, -4),
        receivedAt: intakeDate,
        orderedBy: managerId,
        total: money(qtyPerBatch * unitCost),
        buyerNotes: `${gradeEntry.label} purchase planning.`,
        internalNotes: isConsigned ? 'Consignment flower. COGS resolves at sale.' : 'Office-owned flower purchase.'
      });
      poLineRows.push({
        purchaseOrderId: '',
        itemId: item.id,
        productName: gradeEntry.label,
        category: 'Flower',
        tags: ['flower', gradeEntry.tag, ...(isConsigned ? ['consignment'] : []), ...(hasRange ? ['range-priced'] : [])],
        qty: qty(qtyPerBatch),
        receivedQty: qty(qtyPerBatch),
        uom: 'lb',
        unitCost: money(unitCost),
        unitPrice: money(avgPrice),
        sourceCode: batchCode,
        shorthand: `Flw/${gradeEntry.tag}`,
        legacyMarker: isConsigned ? 'C' : 'OFC',
        ownershipStatus: isConsigned ? 'C' : 'OFC',
        notes: hasRange ? `COGS range ${money(low)}-${money(high)}; transaction lines choose landed COGS inside range.` : 'Fixed COGS basis.',
        status: 'received'
      });
      batchRows.push({
        itemId: item.id,
        vendorId: vendor.id,
        batchCode,
        sourceCode: batchCode,
        shorthand: `Flw/${gradeEntry.tag}`,
        legacyMarker: isConsigned ? 'C' : 'OFC',
        name: gradeEntry.label,
        category: 'Flower',
        tags: ['flower', gradeEntry.tag, ...(isConsigned ? ['consignment'] : []), ...(hasRange ? ['range-priced'] : [])],
        intakeQty: qty(qtyPerBatch),
        availableQty: qty(qtyPerBatch),
        uom: 'lb',
        unitCost: money(unitCost),
        unitPrice: money(avgPrice),
        ticketCost: money(qtyPerBatch * unitCost),
        priceRange: hasRange ? `${money(low)}-${money(high)}` : null,
        location: `Vault-${1 + (index % 6)}`,
        lotCode: `LOT-${batchCode}`,
        intakeDate,
        notes: hasRange ? 'Range-priced consignment flower; landed COGS captured per transaction in pricing command results.' : 'Realistic demo flower batch.',
        ownershipStatus: isConsigned ? 'C' : 'OFC',
        arrivalConfirmed: true,
        arrivalStatus: 'arrived',
        mediaStatus: index % 4 === 0 ? 'in_progress' : 'done',
        status: 'posted',
        postedAt: intakeDate,
        createdAt: intakeDate,
        updatedAt: intakeDate
      });
    }
  }

  const nonFlowerItems = itemRows.filter((item) => item.category !== 'Flower');
  for (let index = 0; index < 36; index += 1) {
    const item = nonFlowerItems[index % nonFlowerItems.length];
    const unitPrice = Number((item.pricingRule as { avgSalePrice?: number }).avgSalePrice ?? 25);
    const unitCost = unitPrice * randBetween(rng, 0.55, 0.72);
    const intakeDate = daysAgo(config.days - Math.floor((index / 36) * config.days));
    const vendor = pick(vendorRows, rng);
    const batchCode = `NF-${String(index + 1).padStart(3, '0')}`;
    const qtyValue = item.category === 'Pre-roll' ? randBetween(rng, 5000, 10000) : randBetween(rng, 1200, 3000);
    poRows.push({
      poNo: `PO-${batchCode}`,
      vendorId: vendor.id,
      status: 'received',
      expectedDate: addDays(intakeDate, -1),
      orderedAt: addDays(intakeDate, -5),
      receivedAt: intakeDate,
      orderedBy: inventoryOperatorId,
      total: money(qtyValue * unitCost),
      buyerNotes: `${item.category} replenish.`,
      internalNotes: 'Non-flower demo product.'
    });
    poLineRows.push({
      purchaseOrderId: '',
      itemId: item.id,
      productName: item.name,
      category: item.category,
      tags: item.tags,
      qty: qty(qtyValue),
      receivedQty: qty(qtyValue),
      uom: item.category === 'Pre-roll' ? 'unit' : 'case',
      unitCost: money(unitCost),
      unitPrice: money(unitPrice),
      sourceCode: batchCode,
      shorthand: `${item.category}/demo`,
      legacyMarker: 'OFC',
      ownershipStatus: 'OFC',
      notes: 'Realistic non-flower supporting sale mix.',
      status: 'received'
    });
    batchRows.push({
      itemId: item.id,
      vendorId: vendor.id,
      batchCode,
      sourceCode: batchCode,
      shorthand: `${item.category}/demo`,
      legacyMarker: 'OFC',
      name: item.name,
      category: item.category,
      tags: item.tags,
      intakeQty: qty(qtyValue),
      availableQty: qty(qtyValue),
      uom: item.category === 'Pre-roll' ? 'unit' : 'case',
      unitCost: money(unitCost),
      unitPrice: money(unitPrice),
      ticketCost: money(qtyValue * unitCost),
      priceRange: null,
      location: `Shelf-${1 + (index % 5)}`,
      lotCode: `LOT-${batchCode}`,
      intakeDate,
      notes: 'Realistic non-flower batch.',
      ownershipStatus: 'OFC',
      arrivalConfirmed: true,
      arrivalStatus: 'arrived',
      mediaStatus: index % 5 === 0 ? 'open' : 'done',
      status: 'posted',
      postedAt: intakeDate,
      createdAt: intakeDate,
      updatedAt: intakeDate
    });
  }

  const insertedPurchaseOrders = await insertChunks(purchaseOrders, poRows, 250);
  poLineRows.forEach((line, index) => {
    line.purchaseOrderId = insertedPurchaseOrders[index].id;
  });
  const insertedPoLines = await insertChunks(purchaseOrderLines, poLineRows, 250);
  batchRows.forEach((batch, index) => {
    batch.purchaseOrderId = insertedPurchaseOrders[index].id;
    batch.purchaseOrderLineId = insertedPoLines[index].id;
  });
  const insertedBatches = await insertChunks(batches, batchRows, 250);
  const receiptRows: Insertable<typeof purchaseReceipts>[] = [];
  const billRows: Insertable<typeof vendorBills>[] = [];
  const vendorPaymentRows: Insertable<typeof vendorPayments>[] = [];
  for (const [index, batch] of insertedBatches.entries()) {
    const batchInput = batchRows[index];
    mutableBatches.push({
      id: batch.id,
      batchCode: batch.batchCode,
      vendorId: String(batch.vendorId),
      itemId: String(batch.itemId),
      itemName: batch.name,
      grade: gradeFromTags(batch.tags),
      category: batch.category,
      tags: batch.tags,
      ownershipStatus: batch.ownershipStatus,
      intakeQty: Number(batch.intakeQty),
      remainingQty: Number(batch.intakeQty),
      unitCost: Number(batch.unitCost),
      unitPrice: Number(batch.unitPrice),
      priceRange: batch.priceRange,
      createdAt: batch.createdAt
    });
    movementRows.push({ batchId: batch.id, kind: 'intake_posted', qtyDelta: batchInput.intakeQty ?? '0.000', reason: 'Realistic demo intake posting', createdAt: batch.createdAt });
    receiptRows.push({
      receiptNo: `RCPT-${batch.batchCode}`,
      vendorId: batch.vendorId,
      purchaseOrderId: batch.purchaseOrderId,
      status: 'posted',
      total: money(Number(batch.intakeQty) * Number(batch.unitCost)),
      createdAt: batch.createdAt,
      updatedAt: batch.createdAt
    });
    const billAmount = Number(batch.intakeQty) * Number(batch.unitCost);
    const paidShare = index % 7 === 0 ? 1 : index % 5 === 0 ? 0.5 : 0;
    billRows.push({
      vendorId: batch.vendorId,
      purchaseReceiptId: null,
      billNo: `VBILL-${batch.batchCode}`,
      amount: money(billAmount),
      amountPaid: money(Math.min(billAmount * paidShare, billAmount)),
      dueDate: addDays(batch.createdAt, batch.ownershipStatus === 'C' ? 14 : 10),
      status: paidShare === 1 ? 'paid' : paidShare > 0 ? 'partial' : index % 4 === 0 ? 'scheduled' : 'approved',
      scheduledFor: index % 4 === 0 ? addDays(new Date(), 2 + (index % 7)) : null,
      termsDays: batch.ownershipStatus === 'C' ? 14 : 10,
      consignmentTriggered: batch.ownershipStatus === 'C',
      dueReason: batch.ownershipStatus === 'C' ? 'Consignment depletion / payable trigger from sold flower.' : 'Office-owned purchase payable.',
      createdAt: batch.createdAt,
      updatedAt: batch.createdAt
    });
  }
  const insertedReceipts = await insertChunks(purchaseReceipts, receiptRows, 250);
  const receiptLineRows = insertedReceipts.map((receipt, index) => ({
    receiptId: receipt.id,
    batchId: insertedBatches[index].id,
    qty: insertedBatches[index].intakeQty,
    unitCost: insertedBatches[index].unitCost,
    subtotal: money(Number(insertedBatches[index].intakeQty) * Number(insertedBatches[index].unitCost))
  }));
  await insertChunks(purchaseReceiptLines, receiptLineRows, 250);
  billRows.forEach((bill, index) => {
    bill.purchaseReceiptId = insertedReceipts[index].id;
  });
  const insertedBills = await insertChunks(vendorBills, billRows, 250);
  for (const bill of insertedBills) {
    if (Number(bill.amountPaid) > 0) {
      vendorPaymentRows.push({
        vendorBillId: bill.id,
        amount: bill.amountPaid,
        method: Number(bill.amountPaid) > Number(bill.amount) * 0.9 ? 'wire' : 'cash',
        reference: `vendor-payout-${bill.billNo}`,
        status: 'posted',
        createdAt: addDays(bill.createdAt, 7)
      });
    }
  }
  await insertChunks(vendorPayments, vendorPaymentRows, 250);
  await insertChunks(inventoryMovements, movementRows, 500);
  return mutableBatches;
}

async function seedActiveOperatorWork(
  config: RealisticDemoConfig,
  rng: () => number,
  itemRows: Array<typeof items.$inferSelect>,
  vendorRows: Array<typeof vendors.$inferSelect>,
  customerRows: CustomerSeed[],
  mutableBatches: MutableBatch[],
  actorIds: { managerId: string; inventoryOperatorId: string; salesOperatorId: string; warehouseOperatorId: string }
) {
  const flowerItems = itemRows.filter((item) => item.category === 'Flower');
  const nonFlowerItems = itemRows.filter((item) => item.category !== 'Flower');
  const activePurchaseRows: Insertable<typeof purchaseOrders>[] = [];
  const activePurchaseLineRows: Insertable<typeof purchaseOrderLines>[] = [];
  const activeBatchRows: Insertable<typeof batches>[] = [];

  for (let index = 0; index < 8; index += 1) {
    const isFlower = index < 6;
    const item = isFlower ? flowerItems[index % flowerItems.length] : nonFlowerItems[index % nonFlowerItems.length];
    const vendor = vendorRows[index % vendorRows.length];
    const grade = isFlower ? (item.sku.includes('OUTDOOR') ? 'outdoor' : item.sku.includes('DEPS') ? 'deps' : 'indoor') : undefined;
    const avgSale = grade ? config.flowerAvgPrice[grade] : Number((item.pricingRule as { avgSalePrice?: number }).avgSalePrice ?? 45);
    const qtyValue = isFlower ? randBetween(rng, 12, 80) : randBetween(rng, 100, 600);
    const unitCost = avgSale * (isFlower ? randBetween(rng, 0.48, 0.66) : randBetween(rng, 0.55, 0.7));
    const isConsigned = isFlower && index % 4 !== 0;
    const status = index % 3 === 0 ? 'draft' : 'approved';
    const activeCode = index === 0 ? 'M15-ACTIVE-001' : `ACTIVE-${String(index + 1).padStart(3, '0')}`;
    activePurchaseRows.push({
      poNo: `PO-${activeCode}`,
      vendorId: vendor.id,
      status,
      expectedDate: addDays(new Date(), 1 + index),
      orderedAt: status === 'approved' ? daysAgo(1 + (index % 3)) : null,
      orderedBy: status === 'approved' ? actorIds.managerId : actorIds.inventoryOperatorId,
      total: money(qtyValue * unitCost),
      buyerNotes: status === 'draft' ? 'Draft buy being shaped before product arrives.' : 'Approved buy awaiting receipt.',
      internalNotes: isConsigned ? 'Active consignment purchase; receive before inventory posts.' : 'Active office-owned purchase.'
    });
    activePurchaseLineRows.push({
      purchaseOrderId: '',
      itemId: item.id,
      productName: item.name,
      category: item.category,
      tags: [...item.tags, ...(isConsigned ? ['consignment'] : []), ...(index % 2 === 0 ? ['range-priced'] : [])],
      qty: qty(qtyValue),
      receivedQty: '0.000',
      uom: isFlower ? 'lb' : item.category === 'Pre-roll' ? 'unit' : 'case',
      unitCost: money(unitCost),
      unitPrice: money(avgSale),
      sourceCode: activeCode,
      shorthand: isFlower ? `Flw/${grade === 'deps' ? 'mixed-light' : grade}` : `${item.category}/active`,
      legacyMarker: isConsigned ? 'C' : 'OFC',
      ownershipStatus: isConsigned ? 'C' : 'OFC',
      notes: index === 0 ? 'Ready to receive when product lands. Rich asked about 25 flex.' : status === 'draft' ? 'Open PO line for operator planning.' : 'Ready to receive when product lands.',
      status: 'planned'
    });
  }

  const insertedActivePurchaseOrders = await insertChunks(purchaseOrders, activePurchaseRows, 250);
  activePurchaseLineRows.forEach((line, index) => {
    line.purchaseOrderId = insertedActivePurchaseOrders[index].id;
  });
  const insertedActivePurchaseLines = await insertChunks(purchaseOrderLines, activePurchaseLineRows, 250);

  for (const [index, poLine] of insertedActivePurchaseLines.slice(0, 6).entries()) {
    const priceRange = index % 2 === 0 ? `${money(Number(poLine.unitCost) * 0.92)}-${money(Number(poLine.unitCost) * 1.12)}` : null;
    activeBatchRows.push({
      itemId: poLine.itemId,
      vendorId: insertedActivePurchaseOrders[index].vendorId,
      purchaseOrderId: insertedActivePurchaseOrders[index].id,
      purchaseOrderLineId: poLine.id,
      batchCode: `INTAKE-${String(index + 1).padStart(3, '0')}`,
      sourceCode: poLine.sourceCode,
      shorthand: poLine.shorthand,
      legacyMarker: poLine.legacyMarker,
      name: poLine.productName,
      category: poLine.category,
      tags: poLine.tags,
      intakeQty: poLine.qty,
      availableQty: '0.000',
      uom: poLine.uom,
      unitCost: poLine.unitCost,
      unitPrice: poLine.unitPrice,
      ticketCost: money(Number(poLine.qty) * Number(poLine.unitCost)),
      priceRange,
      location: 'Receiving',
      lotCode: `LOT-${poLine.sourceCode}`,
      intakeDate: index % 2 === 0 ? new Date() : addDays(new Date(), 1),
      notes: index === 0 ? 'Active ready intake row for receiving QA. Rich asked about 25 flex.' : index % 2 === 0 ? 'Active ready intake row for receiving QA.' : 'Draft intake row awaiting arrival confirmation.',
      ownershipStatus: poLine.ownershipStatus,
      arrivalConfirmed: index % 2 === 0,
      arrivalStatus: index % 2 === 0 ? 'arrived' : 'pending',
      mediaStatus: 'open',
      status: index % 2 === 0 ? 'ready' : 'draft',
      createdAt: daysAgo(index % 2),
      updatedAt: daysAgo(index % 2)
    });
  }
  await insertChunks(batches, activeBatchRows, 250);

  const activeOrderRows: Insertable<typeof salesOrders>[] = [];
  const activeLineRows: Insertable<typeof salesOrderLines>[] = [];
  const saleBatches = mutableBatches.filter((batch) => batch.remainingQty > 5).slice(0, 8);
  for (let index = 0; index < 8 && saleBatches[index]; index += 1) {
    const batch = saleBatches[index];
    const customer = customerRows[index % customerRows.length];
    const orderStatus = index % 2 === 0 ? 'draft' : 'confirmed';
    const qtyValue = Math.min(batch.remainingQty, batch.category === 'Flower' ? randBetween(rng, 2, 12) : randBetween(rng, 20, 80));
    const unitPrice = batch.unitPrice * randBetween(rng, 0.94, 1.06);
    activeOrderRows.push({
      orderNo: `SO-ACTIVE-${String(index + 1).padStart(3, '0')}`,
      customerId: customer.id,
      status: orderStatus,
      pricingStrategy: batch.priceRange ? 'range-preview' : 'standard',
      internalMargin: money(qtyValue * (unitPrice - batch.unitCost)),
      total: money(qtyValue * unitPrice),
      deliveryWindow: index % 2 === 0 ? 'Needs confirmation' : 'Ready this week',
      notes: orderStatus === 'draft' ? 'Active draft order for sales-grid testing.' : 'Active confirmed order ready to post.',
      packed: false,
      inventoryPosted: false,
      paymentFollowup: true,
      legacyStatusMarkers: customer.kind === 'whale' ? 'P,Iv' : 'M',
      validationIssues: [],
      createdAt: daysAgo(index % 3),
      updatedAt: daysAgo(index % 3)
    });
    activeLineRows.push({
      orderId: '',
      batchId: batch.id,
      itemName: batch.itemName,
      qty: qty(qtyValue),
      unitPrice: money(unitPrice),
      unitCost: money(batch.priceRange ? landedCogs(batch, rng) : batch.unitCost),
      sourceRowKey: batch.batchCode,
      legacyStatusMarker: batch.ownershipStatus === 'C' ? 'C' : 'OFC',
      packed: false,
      inventoryPosted: false,
      paymentFollowup: true,
      validationIssues: index % 5 === 0 ? ['Confirm buyer credit before posting.'] : [],
      status: orderStatus === 'confirmed' ? 'ready' : 'draft',
      createdAt: daysAgo(index % 3),
      updatedAt: daysAgo(index % 3)
    });
  }
  const insertedActiveOrders = await insertChunks(salesOrders, activeOrderRows, 250);
  activeLineRows.forEach((line, index) => {
    line.orderId = insertedActiveOrders[index].id;
  });
  await insertChunks(salesOrderLines, activeLineRows, 250);

  await insertChunks(payments, customerRows.slice(0, 6).map((customer, index) => {
    const isBuyerCredit = index % 2 === 1;
    const amount = isBuyerCredit ? randBetween(rng, 5_000, 18_000) : randBetween(rng, 8_000, 45_000);
    return {
      customerId: customer.id,
      method: index % 3 === 0 ? 'cash' : index % 3 === 1 ? 'wire' : 'crypto',
      amount: money(isBuyerCredit ? -amount : amount),
      unappliedAmount: money(isBuyerCredit ? amount : 0),
      reference: `active-payment-${index + 1}`,
      locationBucket: isBuyerCredit ? 'credit-memo' : 'cash-file-a',
      notes: isBuyerCredit ? 'Active buyer prepayment row ready for review.' : 'Active payment row ready for allocation review.',
      direction: isBuyerCredit ? 'buyer_credit' : 'money_in',
      category: isBuyerCredit ? 'buyer_credit' : 'client_payment',
      allocationIntent: isBuyerCredit ? 'unapplied' : 'fifo',
      impactPreview: 'Active work row for payment logging and allocation QA.',
      status: isBuyerCredit ? 'draft' : 'ready',
      createdAt: daysAgo(index),
      updatedAt: daysAgo(index)
    };
  }), 250);

  const openPickOrders = insertedActiveOrders.filter((order) => order.status === 'confirmed').slice(0, 3);
  await insertChunks(pickLists, openPickOrders.map((order, index) => ({
    pickNo: `PICK-ACTIVE-${String(index + 1).padStart(3, '0')}`,
    orderId: order.id,
    status: 'open',
    assignedTo: actorIds.warehouseOperatorId,
    labelFormat: index % 2 === 0 ? '4x6' : '2x1',
    unitsPerBag: 10,
    labelsPrinted: false,
    manifestPath: null,
    tracking: null,
    createdAt: new Date(),
    updatedAt: new Date()
  })), 250);

  await db.insert(commandJournal).values(commandRow('createSalesOrder', actorIds.salesOperatorId, 'Sam Sales', 'operator', { activeWork: true }, insertedActiveOrders.map((order) => order.id), new Date(), { activeDraftOrders: insertedActiveOrders.length }));
}

async function seedSalesAccountingAndFulfillment(
  config: RealisticDemoConfig,
  rng: () => number,
  mutableBatches: MutableBatch[],
  customerSeeds: CustomerSeed[],
  actorIds: { ownerId: string; managerId: string; salesOperatorId: string; warehouseOperatorId: string },
  customerBalances: Map<string, number>
) {
  const orderRows: Insertable<typeof salesOrders>[] = [];
  const lineRowsByOrder: Insertable<typeof salesOrderLines>[][] = [];
  const invoiceRows: Insertable<typeof invoices>[] = [];
  const ledgerRows: Insertable<typeof clientLedgerEntries>[] = [];
  const paymentRows: Insertable<typeof payments>[] = [];
  const allocationRows: Insertable<typeof paymentAllocations>[] = [];
  const movementRows: Insertable<typeof inventoryMovements>[] = [];
  const journalRows: Insertable<typeof commandJournal>[] = [];
  const targetTotalRevenue = (config.monthlyRevenue / 30) * config.days;
  let totalRevenue = 0;
  let flowerRevenue = 0;
  let orderIndex = 0;

  for (let day = config.days - 1; day >= 0; day -= 1) {
    const saleDate = daysAgo(day);
    const dailyTarget = (targetTotalRevenue / config.days) * randBetween(rng, 0.82, 1.22);
    let dailyRevenue = 0;
    while (dailyRevenue < dailyTarget && totalRevenue < targetTotalRevenue * 1.04) {
      const customer = rng() < 0.72 ? pick(customerSeeds.filter((row) => row.kind === 'whale'), rng) : pick(customerSeeds, rng);
      const isFlower = rng() < config.flowerRevenueShare;
      const lineCount = rng() < 0.18 ? 2 : 1;
      const orderLines: Insertable<typeof salesOrderLines>[] = [];
      let orderTotal = 0;
      let orderCost = 0;
      const rangeResolutions: Array<Record<string, unknown>> = [];
      for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        const batch = chooseBatch(mutableBatches, isFlower, rng);
        if (!batch) continue;
        const avg = batch.unitPrice;
        const unitPrice = avg * randBetween(rng, 0.92, 1.08);
        const desiredLineRevenue = Math.min(dailyTarget - dailyRevenue, customer.kind === 'whale' ? randBetween(rng, 18_000, 55_000) : randBetween(rng, 2_500, 14_000));
        const quantity = Math.min(batch.remainingQty, Math.max(batch.category === 'Flower' ? 1 : 12, desiredLineRevenue / unitPrice));
        if (quantity <= 0) continue;
        batch.remainingQty -= quantity;
        const landedCost = landedCogs(batch, rng);
        const lineTotal = quantity * unitPrice;
        orderTotal += lineTotal;
        orderCost += quantity * landedCost;
        if (batch.category === 'Flower') flowerRevenue += lineTotal;
        orderLines.push({
          orderId: '',
          batchId: batch.id,
          itemName: batch.itemName,
          qty: qty(quantity),
          unitPrice: money(unitPrice),
          unitCost: money(landedCost),
          sourceRowKey: batch.batchCode,
          legacyStatusMarker: batch.ownershipStatus === 'C' ? 'C' : 'OFC',
          packed: day > 3 && rng() < 0.72,
          inventoryPosted: true,
          paymentFollowup: rng() < 0.22,
          validationIssues: [],
          status: 'posted',
          createdAt: saleDate,
          updatedAt: saleDate
        });
        movementRows.push({ batchId: batch.id, kind: 'sale_posted', qtyDelta: qty(-quantity), reason: 'Realistic demo sale posting', createdAt: saleDate });
        if (batch.priceRange) {
          rangeResolutions.push({ batchCode: batch.batchCode, cogsRange: batch.priceRange, landedCogs: money(landedCost), salePrice: money(unitPrice) });
        }
      }
      if (!orderLines.length) break;
      const status = day <= 1 && rng() < 0.35 ? 'confirmed' : rng() < 0.18 ? 'fulfilled' : 'posted';
      const orderNo = `SO-REAL-${String(orderIndex + 1).padStart(5, '0')}`;
      const discount = rng() < 0.08 ? orderTotal * randBetween(rng, 0.008, 0.028) : 0;
      const invoiceTotal = orderTotal - discount;
      orderRows.push({
        orderNo,
        customerId: customer.id,
        status,
        pricingStrategy: rangeResolutions.length ? 'range-resolved' : customer.kind === 'whale' ? 'revolving-credit' : 'standard',
        internalMargin: money(orderTotal - orderCost),
        total: money(orderTotal),
        deliveryWindow: day <= 2 ? 'This week' : 'Completed',
        notes: rangeResolutions.length ? 'COGS range resolved per transaction; see seeded priceSalesOrder command result.' : 'Realistic posted sale.',
        packed: status === 'fulfilled',
        inventoryPosted: true,
        paymentFollowup: rng() < 0.24,
        legacyStatusMarkers: customer.kind === 'whale' ? 'P,Iv' : 'M',
        validationIssues: [],
        postedAt: saleDate,
        fulfilledAt: status === 'fulfilled' ? addDays(saleDate, 1) : null,
        createdAt: saleDate,
        updatedAt: saleDate
      });
      lineRowsByOrder.push(orderLines);
      if (status !== 'confirmed') {
        const dueDate = addDays(saleDate, customer.kind === 'whale' ? 21 : 14);
        const overdueBias = day > 28 && customer.kind === 'small' && rng() < 0.28;
        const paidRatio = customer.kind === 'whale' ? randBetween(rng, 0.25, 0.72) : overdueBias ? randBetween(rng, 0, 0.25) : pick([0, 0.35, 0.65, 1], rng);
        const paidAmount = invoiceTotal * paidRatio;
        invoiceRows.push({
          invoiceNo: `INV-REAL-${String(orderIndex + 1).padStart(5, '0')}`,
          customerId: customer.id,
          orderId: '',
          status: paidAmount >= invoiceTotal - 0.01 ? 'paid' : paidAmount > 0 ? 'partial' : 'open',
          total: money(invoiceTotal),
          amountPaid: money(Math.min(paidAmount, invoiceTotal)),
          dueDate: overdueBias ? addDays(saleDate, 10) : dueDate,
          createdAt: saleDate,
          updatedAt: addDays(saleDate, 1)
        });
        customerBalances.set(customer.id, (customerBalances.get(customer.id) ?? 0) + invoiceTotal - paidAmount);
        if (paidAmount > 0) {
          paymentRows.push({
            customerId: customer.id,
            method: rng() < 0.62 ? 'cash' : rng() < 0.82 ? 'wire' : 'crypto',
            amount: money(paidAmount),
            unappliedAmount: '0.00',
            reference: `${customer.kind === 'whale' ? 'revolving' : 'payment'}-${orderNo}`,
            locationBucket: rng() < 0.6 ? 'cash-file-a' : 'office-safe',
            notes: customer.kind === 'whale' ? 'Revolving credit payment received while taking more inventory.' : 'Applied customer payment.',
            direction: 'money_in',
            category: 'client_payment',
            allocationIntent: 'selected_invoice',
            impactPreview: `Applied to INV-REAL-${String(orderIndex + 1).padStart(5, '0')}.`,
            status: 'posted',
            createdAt: addDays(saleDate, Math.min(day, Math.floor(randBetween(rng, 0, 18)))),
            updatedAt: addDays(saleDate, Math.min(day, Math.floor(randBetween(rng, 0, 18))))
          });
        }
        if (discount > 0) {
          journalRows.push(commandRow('applyEarlyPayDiscount', actorIds.managerId, 'Maya Manager', 'manager', { invoiceNo: `INV-REAL-${String(orderIndex + 1).padStart(5, '0')}`, amount: money(discount) }, [], saleDate));
        }
      }
      if (rangeResolutions.length) {
        journalRows.push(commandRow('priceSalesOrder', actorIds.salesOperatorId, 'Sam Sales', 'operator', { orderNo, strategy: 'range-resolved' }, [], saleDate, { rangeResolutions }));
      }
      dailyRevenue += orderTotal;
      totalRevenue += orderTotal;
      orderIndex += 1;
    }
  }

  const insertedOrders = await insertChunks(salesOrders, orderRows, 250);
  const allLineRows: Insertable<typeof salesOrderLines>[] = [];
  const pickRows: Insertable<typeof pickLists>[] = [];
  const pickLineGroups: Insertable<typeof fulfillmentLines>[][] = [];
  let invoiceIndex = 0;
  let paymentIndex = 0;
  for (const [index, order] of insertedOrders.entries()) {
    for (const line of lineRowsByOrder[index]) {
      line.orderId = order.id;
      allLineRows.push(line);
    }
    if (invoiceRows[index]) {
      invoiceRows[index].orderId = order.id;
      ledgerRows.push({
        customerId: String(order.customerId),
        invoiceId: '',
        kind: 'invoice',
        amount: invoiceRows[index].total,
        balanceAfter: money(customerBalances.get(String(order.customerId)) ?? 0),
        note: order.orderNo,
        createdAt: order.createdAt
      });
      invoiceIndex += 1;
    }
    if (order.status === 'fulfilled' || (order.status === 'posted' && index % 3 === 0)) {
      pickRows.push({
        pickNo: `PICK-REAL-${String(index + 1).padStart(5, '0')}`,
        orderId: order.id,
        status: order.status === 'fulfilled' ? 'fulfilled' : 'open',
        assignedTo: actorIds.warehouseOperatorId,
        labelFormat: index % 2 ? '4x6' : '2x1',
        unitsPerBag: 10,
        labelsPrinted: order.status === 'fulfilled',
        manifestPath: `/tmp/terp-agro/manifests/${order.orderNo}.csv`,
        tracking: order.status === 'fulfilled' ? `TRK-${order.orderNo}` : null,
        createdAt: addDays(order.createdAt, 1),
        updatedAt: addDays(order.createdAt, 1)
      });
      pickLineGroups.push([]);
    }
  }
  const insertedLines = await insertChunks(salesOrderLines, allLineRows, 500);
  const insertedInvoices = await insertChunks(invoices, invoiceRows, 500);
  const insertedPayments = await insertChunks(payments, paymentRows, 500);
  for (const [index, invoice] of insertedInvoices.entries()) {
    if (ledgerRows[index]) ledgerRows[index].invoiceId = invoice.id;
    if (Number(invoice.amountPaid) > 0 && insertedPayments[paymentIndex]) {
      allocationRows.push({ paymentId: insertedPayments[paymentIndex].id, invoiceId: invoice.id, amount: invoice.amountPaid, createdAt: insertedPayments[paymentIndex].createdAt });
      ledgerRows.push({
        customerId: String(invoice.customerId),
        invoiceId: invoice.id,
        paymentId: insertedPayments[paymentIndex].id,
        kind: 'payment_allocation',
        amount: money(-Number(invoice.amountPaid)),
        balanceAfter: money(customerBalances.get(String(invoice.customerId)) ?? 0),
        note: 'Realistic payment allocation',
        createdAt: insertedPayments[paymentIndex].createdAt
      });
      paymentIndex += 1;
    }
  }
  const whaleCustomers = customerSeeds.filter((customer) => customer.kind === 'whale');
  for (let index = 0; index < whaleCustomers.length; index += 1) {
    const customer = whaleCustomers[index];
    const amount = randBetween(rng, 15_000, 75_000);
    const createdAt = daysAgo(5 + index * 9);
    const [payment] = await db.insert(payments).values({
      customerId: customer.id,
      method: 'wire',
      amount: money(-amount),
      unappliedAmount: money(amount),
      reference: `buyer-credit-${index + 1}`,
      locationBucket: 'credit-memo',
      notes: 'Buyer prepayment / credit held against future revolving purchases.',
      direction: 'buyer_credit',
      category: 'buyer_credit',
      allocationIntent: 'unapplied',
      impactPreview: 'Buyer credit available for future orders.',
      status: 'posted',
      createdAt,
      updatedAt: createdAt
    }).returning();
    customerBalances.set(customer.id, (customerBalances.get(customer.id) ?? 0) - amount);
    ledgerRows.push({ customerId: customer.id, paymentId: payment.id, kind: 'down_payment', amount: money(-amount), balanceAfter: money(customerBalances.get(customer.id) ?? 0), note: 'Buyer credit / prepayment', createdAt });
  }
  await insertChunks(paymentAllocations, allocationRows, 500);
  await insertChunks(clientLedgerEntries, ledgerRows, 500);
  await insertChunks(inventoryMovements, movementRows, 500);
  for (const batch of mutableBatches) {
    await db.update(batches).set({ availableQty: qty(Math.max(0, batch.remainingQty)), updatedAt: new Date() }).where(eq(batches.id, batch.id));
  }
  const insertedPicks = await insertChunks(pickLists, pickRows, 250);
  const fulfillmentRows: Insertable<typeof fulfillmentLines>[] = [];
  let lineCursor = 0;
  for (const pick of insertedPicks) {
    const count = 1 + (lineCursor % 2);
    for (let index = 0; index < count && insertedLines[lineCursor]; index += 1) {
      const line = insertedLines[lineCursor];
      fulfillmentRows.push({
        pickListId: pick.id,
        orderLineId: line.id,
        batchId: line.batchId,
        expectedQty: line.qty,
        actualQty: pick.status === 'fulfilled' ? line.qty : '0.000',
        actualWeight: pick.status === 'fulfilled' ? line.qty : '0.000',
        bagCode: pick.status === 'fulfilled' ? `BAG-${pick.pickNo}-${index + 1}` : null,
        status: pick.status === 'fulfilled' ? 'packed' : 'open',
        createdAt: pick.createdAt,
        updatedAt: pick.createdAt
      });
      lineCursor += 1;
    }
  }
  await insertChunks(fulfillmentLines, fulfillmentRows, 500);
  await insertChunks(commandJournal, journalRows.slice(0, 250), 500);
  await seedAccountingExtras(rng, customerSeeds, insertedInvoices, actorIds.managerId);
  return { orderCount: insertedOrders.length, invoiceCount: invoiceIndex, paymentCount: insertedPayments.length, totalRevenue, flowerRevenue };
}

async function seedAccountingExtras(rng: () => number, customerSeeds: CustomerSeed[], invoiceRows: Array<typeof invoices.$inferSelect>, managerId: string) {
  const overdueInvoices = invoiceRows.filter((invoice) => invoice.status !== 'paid' && invoice.dueDate < new Date()).slice(0, 12);
  await insertChunks(creditOverrides, overdueInvoices.filter((invoice) => Boolean(invoice.customerId)).slice(0, 8).map((invoice, index) => ({
    customerId: String(invoice.customerId),
    amount: money(randBetween(rng, 5_000, 35_000)),
    status: index % 3 === 0 ? 'pending' : index % 3 === 1 ? 'approved' : 'denied',
    reason: 'Realistic credit exception for overdue/revolving customer.',
    createdAt: addDays(invoice.dueDate, 1),
    updatedAt: addDays(invoice.dueDate, 1)
  })), 250);
  await insertChunks(invoiceDisputes, overdueInvoices.slice(0, 6).map((invoice, index) => ({
    invoiceId: invoice.id,
    status: index % 2 ? 'investigating' : 'open',
    reason: index % 2 ? 'Customer claims partial credit memo should apply.' : 'Short-paid invoice requires operator review.',
    resolution: null,
    createdAt: addDays(invoice.dueDate, 3),
    updatedAt: addDays(invoice.dueDate, 3)
  })), 250);
  await db.insert(correctionJournalEntries).values([
    { period: periodKey(daysAgo(32)), amount: '1850.00', memo: 'Vendor credit from overweight adjustment', status: 'posted', createdAt: daysAgo(31) },
    { period: periodKey(daysAgo(18)), amount: '-920.00', memo: 'Buyer credit correction after invoice dispute', status: 'posted', createdAt: daysAgo(17) }
  ]);
  await db.insert(commandJournal).values([
    commandRow('applyClientCredit', managerId, 'Maya Manager', 'manager', { customerId: customerSeeds[0]?.id, amount: '25000.00', reason: 'Whale revolving credit memo' }, [customerSeeds[0]?.id].filter(Boolean), daysAgo(8)),
    commandRow('createCorrectionJournalEntry', managerId, 'Maya Manager', 'manager', { memo: 'Vendor credit from overweight adjustment' }, [], daysAgo(31))
  ]);
}

async function seedMatchmaking(config: RealisticDemoConfig, rng: () => number, customerRows: CustomerSeed[], vendorRows: Array<typeof vendors.$inferSelect>, salesOperatorId: string) {
  const needs = await insertChunks(customerNeeds, customerRows.slice(0, 18).map((customer, index) => {
    const grade = pick(flowerGradeMix, rng);
    return {
      needCode: `NEED-REAL-${String(index + 1).padStart(3, '0')}`,
      customerId: customer.id,
      productName: `${grade.label} need`,
      category: 'Flower',
      tags: ['flower', grade.tag, customer.kind === 'whale' ? 'premium' : 'value'],
      qtyMin: qty(customer.kind === 'whale' ? randBetween(rng, 25, 90) : randBetween(rng, 4, 18)),
      qtyMax: qty(customer.kind === 'whale' ? randBetween(rng, 90, 180) : randBetween(rng, 18, 45)),
      targetPrice: money(config.flowerAvgPrice[grade.grade] * randBetween(rng, 0.9, 1.05)),
      neededBy: addDays(new Date(), 2 + (index % 24)),
      urgency: index % 5 === 0 ? 'high' : index % 4 === 0 ? 'watch' : 'normal',
      ownerId: salesOperatorId,
      notes: 'Need may not be in current stock; match against vendor stock before purchase.',
      status: 'open'
    };
  }), 250);
  const supplies = await insertChunks(vendorSupply, Array.from({ length: 26 }, (_, index) => {
    const grade = flowerGradeMix[index % flowerGradeMix.length];
    return {
      supplyCode: `VS-REAL-${String(index + 1).padStart(3, '0')}`,
      vendorId: vendorRows[index % vendorRows.length].id,
      productName: `${grade.label} vendor stock`,
      category: 'Flower',
      tags: ['flower', grade.tag, index % 2 ? 'premium' : 'value'],
      availableQty: qty(randBetween(rng, 20, 160)),
      askingPrice: money(config.flowerAvgPrice[grade.grade] * randBetween(rng, 0.75, 0.96)),
      availableDate: addDays(new Date(), 1 + (index % 18)),
      location: 'Vendor-held',
      grade: labelize(grade.grade),
      terms: index % 2 ? 'Consignment possible' : 'Office-owned buy preferred',
      notes: 'Vendor has this available but has not sold it to the office yet.',
      status: 'open'
    };
  }), 250);
  const matchRows = needs.flatMap((need, index) => {
    const supply = supplies.find((row) => row.tags.some((tag) => need.tags.includes(tag)) && row.category === need.category) ?? supplies[index % supplies.length];
    return [{
      customerNeedId: need.id,
      vendorSupplyId: supply.id,
      score: 72 + (index % 27),
      reasons: ['Category match', `Tags: ${need.tags.filter((tag) => supply.tags.includes(tag)).join(', ') || 'flower'}`, 'Vendor stock exists before purchase', 'Quantity can cover need'],
      status: index % 8 === 0 ? 'dismissed' : index % 6 === 0 ? 'accepted' : 'open',
      reviewedBy: index % 6 === 0 ? salesOperatorId : null,
      createdAt: daysAgo(index % config.days),
      updatedAt: daysAgo(index % config.days)
    }];
  });
  await insertChunks(matchmakingMatches, matchRows, 250);
}

async function seedConnectors(rng: () => number, customerRows: CustomerSeed[], warehouseOperatorId: string) {
  await insertChunks(connectorRequests, Array.from({ length: 36 }, (_, index) => {
    const source = pick(['vip', 'live-shopping', 'mobile-scan'], rng);
    return {
      source,
      requestType: source === 'mobile-scan' ? 'bag_scan' : source === 'live-shopping' ? 'cart_submit' : 'catalog_request',
      customerId: source === 'mobile-scan' ? null : customerRows[index % customerRows.length].id,
      payload: source === 'mobile-scan' ? { bagCode: `BAG-${index + 1}`, scanKind: 'pack_scan' } : { category: 'Flower', priceVisibility: 'customer', requestedQty: 10 + index },
      status: index % 9 === 0 ? 'rejected' : index % 4 === 0 ? 'approved' : 'open',
      routedTo: null,
      operatorNotes: index % 4 === 0 ? 'Reviewed without connector ledger authority.' : null,
      reviewHistory: index % 4 === 0 ? [{ status: 'approved', actorName: 'Sam Sales', at: daysAgo(index % 30).toISOString() }] : [],
      safetyNote: 'Connector request only; no ledger mutation until an operator posts the target workflow.',
      createdAt: daysAgo(index % 42),
      updatedAt: daysAgo(index % 42)
    };
  }), 250);
  const photoCandidates = await db.select().from(batches).limit(28);
  await insertChunks(photographyQueue, photoCandidates.map((batch, index) => ({
    batchId: batch.id,
    status: index % 3 === 0 ? 'done' : index % 3 === 1 ? 'in_progress' : 'open',
    requestedBy: warehouseOperatorId,
    notes: 'Realistic photo readiness row for catalog/finder QA.',
    createdAt: daysAgo(index % 30),
    updatedAt: daysAgo(index % 30)
  })), 250);
}

async function seedOperationalControls(
  config: RealisticDemoConfig,
  counts: { ownerId: string; managerId: string; orderCount: number; invoiceCount: number; paymentCount: number; batchCount: number; totalRevenue: number; flowerRevenue: number }
) {
  const lastMonth = periodKey(daysAgo(35));
  await db.insert(periodLocks).values({ period: lastMonth, status: 'locked', lockedBy: counts.ownerId, lockedAt: daysAgo(4) });
  await db.insert(archiveRuns).values({
    period: periodKey(daysAgo(65)),
    status: 'archived',
    controlTotals: { batches: Math.floor(counts.batchCount * 0.4), orders: Math.floor(counts.orderCount * 0.33), invoices: Math.floor(counts.invoiceCount * 0.33), payments: Math.floor(counts.paymentCount * 0.33), revenue: money(counts.totalRevenue * 0.33) },
    csvPath: '/tmp/terp-agro/archives/realistic-batches.csv',
    jsonlPath: '/tmp/terp-agro/archives/realistic-commands.jsonl',
    pdfPath: '/tmp/terp-agro/archives/realistic-summary.pdf',
    createdAt: daysAgo(3)
  });
  await db.insert(backupSnapshots).values({
    label: 'Realistic 100-day demo baseline',
    snapshot: {
      scenario: 'realistic_100d',
      config,
      counts,
      generatedAt: new Date().toISOString()
    },
    createdAt: new Date()
  });
  await db.insert(commandJournal).values(commandRow('backupNow', counts.ownerId, 'Evan Owner', 'owner', { scenario: 'realistic_100d' }, [], new Date(), { counts }));
}

function chooseBatch(batchesPool: MutableBatch[], isFlower: boolean, rng: () => number) {
  const candidates = batchesPool.filter((batch) => (isFlower ? batch.category === 'Flower' : batch.category !== 'Flower') && batch.remainingQty > 0.5);
  if (!candidates.length) return null;
  return pick(candidates, rng);
}

function landedCogs(batch: MutableBatch, rng: () => number) {
  if (!batch.priceRange) return batch.unitCost;
  const [low, high] = batch.priceRange.split('-').map(Number);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return batch.unitCost;
  return randBetween(rng, low, high);
}

function commandRow(commandName: string, actorId: string, actorName: string, actorRole: string, inputPayload: Record<string, unknown>, affectedIds: string[], createdAt: Date, result: Record<string, unknown> = {}) {
  return {
    commandName,
    idempotencyKey: `realistic-${commandName}-${createdAt.getTime()}-${Math.random().toString(36).slice(2)}`,
    actorId,
    actorName,
    actorRole,
    reason: 'Realistic demo scenario',
    inputPayload,
    status: 'ok',
    affectedIds,
    beforeSnapshot: {},
    afterSnapshot: {},
    result: { ok: true, affectedIds, ...result },
    createdAt
  };
}

async function insertChunks<T extends { $inferInsert: unknown; $inferSelect: unknown }>(table: T, rows: Array<T['$inferInsert']>, size = 500): Promise<Array<T['$inferSelect']>> {
  const inserted: Array<T['$inferSelect']> = [];
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    if (chunk.length) inserted.push(...((await db.insert(table as any).values(chunk as any).returning()) as Array<T['$inferSelect']>));
  }
  return inserted;
}

function numberEnv(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function ratioEnv(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
}

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

function randBetween(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng();
}

function money(value: number | string) {
  return Number(value).toFixed(2);
}

function qty(value: number | string) {
  return Number(value).toFixed(3);
}

function daysAgo(days: number) {
  return addDays(new Date(), -days);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function periodKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function gradeFromTags(tags: string[]): FlowerGrade | undefined {
  if (tags.includes('outdoor')) return 'outdoor';
  if (tags.includes('mixed-light') || tags.includes('deps')) return 'deps';
  if (tags.includes('indoor')) return 'indoor';
  return undefined;
}

function labelize(value: string) {
  return value
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function tagColor(slug: string) {
  if (['premium', 'flower', 'whale'].includes(slug)) return 'green';
  if (['outdoor', 'value', 'small'].includes(slug)) return 'gray';
  if (['mixed-light', 'deps', 'credit', 'matchmaking'].includes(slug)) return 'blue';
  if (['indoor', 'consignment', 'range-priced'].includes(slug)) return 'purple';
  if (['overdue', 'candy'].includes(slug)) return 'orange';
  return 'gray';
}

function firstName(index: number) {
  return ['Rhea', 'Marco', 'June', 'Talia', 'Omar', 'Nina', 'Cole', 'Vera', 'Ari', 'Lena', 'Samir', 'Jo', 'Paz', 'Mika', 'Eli', 'Noor', 'Ren', 'Ivy', 'Kai'][index % 19];
}
