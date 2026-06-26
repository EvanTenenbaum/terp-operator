/**
 * Architecture fitness test: command registry integrity.
 *
 * Prevents the shotgun-surgery regression described in docs/engineering-plans/
 * grid-rows-repair-split/04-backend-command-registry.md. A 30-line test
 * outlasts a 3-page convention doc.
 *
 * Phase 1 (current): parity check for migrated purchase-orders commands.
 * Phase 2+ (after domain-by-domain rollout): tighten to forbid switch(name)
 *   in commandBus.ts and enforce full catalog↔registry parity.
 *
 * Pattern: same spirit as scripts/check-backend-frontend-parity.mjs but
 * as a proper Vitest test so CI catches drift immediately.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Short-circuit DB import chain so the test doesn't need Postgres.
vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

// ── Migrated commands (purchase-orders domain) ────────────────────────────────

const PO_COMMAND_NAMES = [
  'addPurchaseOrderLine',
  'approvePurchaseOrder',
  'cancelPurchaseOrder',
  'createPurchaseOrder',
  'finalizePurchaseOrder',
  'postPurchaseReceipt',
  'receivePurchaseOrder',
  'recordVendorPrepayment',
  'removePurchaseOrderLine',
  'unfinalizePurchaseOrder',
  'updatePurchaseOrder',
  'updatePurchaseOrderLine',
];

// ── Catalog parity ───────────────────────────────────────────────────────────

describe('command registry ↔ catalog parity (PO domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/purchase-orders/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered PO command exists in the catalog', () => {
    const registeredPO = registryNames.filter(n => PO_COMMAND_NAMES.includes(n));
    for (const name of registeredPO) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every PO catalog entry has a registered handler', () => {
    const catalogPO = catalogNames.filter(n => PO_COMMAND_NAMES.includes(n));
    for (const name of catalogPO) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered command is duplicated', () => {
    const poRegistered = registryNames.filter(n => PO_COMMAND_NAMES.includes(n));
    const unique = new Set(poRegistered);
    expect(unique.size).toBe(poRegistered.length);
  });
});

// ── Migrated commands (inventory domain) ────────────────────────────────

const INVENTORY_COMMAND_NAMES = [
  'setInventoryStatus',
  'transferInventoryLocation',
  'transferInventoryOwnership',
];

// ── Catalog parity (Inventory) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (Inventory domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/inventory/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Inventory command exists in the catalog', () => {
    const registeredInv = registryNames.filter(n => INVENTORY_COMMAND_NAMES.includes(n));
    for (const name of registeredInv) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Inventory catalog entry has a registered handler', () => {
    const catalogInv = catalogNames.filter(n => INVENTORY_COMMAND_NAMES.includes(n));
    for (const name of catalogInv) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Inventory command is duplicated', () => {
    const invRegistered = registryNames.filter(n => INVENTORY_COMMAND_NAMES.includes(n));
    const unique = new Set(invRegistered);
    expect(unique.size).toBe(invRegistered.length);
  });
});

// ── Migrated commands (intake domain) ────────────────────────────────

const INTAKE_COMMAND_NAMES = [
  'createBatch',
  'updateBatch',
  'deleteBatch',
  'rejectBatch',
  'flagBatch',
  'verifyAllIntake',
  'adjustBatchQuantity',
  'setBatchPrice',
  'setBatchLotInfo',
  'importBatchesCsv',
  'createCustomerSheetSnapshot',
];

// ── Catalog parity (Intake) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (Intake domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/intake/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Intake command exists in the catalog', () => {
    const registeredIntake = registryNames.filter(n => INTAKE_COMMAND_NAMES.includes(n));
    for (const name of registeredIntake) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Intake catalog entry has a registered handler', () => {
    const catalogIntake = catalogNames.filter(n => INTAKE_COMMAND_NAMES.includes(n));
    for (const name of catalogIntake) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Intake command is duplicated', () => {
    const intakeRegistered = registryNames.filter(n => INTAKE_COMMAND_NAMES.includes(n));
    const unique = new Set(intakeRegistered);
    expect(unique.size).toBe(intakeRegistered.length);
  });
});

// ── Migrated commands (sales-orders domain) ──────────────────────────

const SALES_ORDER_COMMAND_NAMES = [
  'createSalesOrder',
  'addSalesOrderLine',
  'updateSalesOrderLine',
  'removeSalesOrderLine',
  'reserveInventoryForOrder',
  'priceSalesOrder',
  'confirmSalesOrder',
  'cancelSalesOrder',
  'postSalesOrder',
  'setDeliveryWindow',
  'setLineLandedCost',
  'setLineBelowFloorReason',
  'resolveVendorApproval',
  'setCustomerPricingRule',
  'setDefaultPricingRule',
  'repriceOrder',
];

// ── Catalog parity (Sales Orders) ───────────────────────────────────────

describe('command registry ↔ catalog parity (Sales Orders domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/sales-orders/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Sales Orders command exists in the catalog', () => {
    const registeredSO = registryNames.filter(n => SALES_ORDER_COMMAND_NAMES.includes(n));
    for (const name of registeredSO) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Sales Orders catalog entry has a registered handler', () => {
    const catalogSO = catalogNames.filter(n => SALES_ORDER_COMMAND_NAMES.includes(n));
    for (const name of catalogSO) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Sales Orders command is duplicated', () => {
    const soRegistered = registryNames.filter(n => SALES_ORDER_COMMAND_NAMES.includes(n));
    const unique = new Set(soRegistered);
    expect(unique.size).toBe(soRegistered.length);
  });
});

// ── Migrated commands (payments domain) ──────────────────────────────────────

const PAYMENTS_COMMAND_NAMES = [
  'applyClientCredit',
  'logPayment',
  'allocatePayment',
  'unallocatePayment',
  'refundPayment',
  'markPaymentUnapplied',
  'applyDiscount',
  'markUserFeeCollected',
];

// ── Catalog parity (Payments) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (Payments domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/payments/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Payments command exists in the catalog', () => {
    const registeredPay = registryNames.filter(n => PAYMENTS_COMMAND_NAMES.includes(n));
    for (const name of registeredPay) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Payments catalog entry has a registered handler', () => {
    const catalogPay = catalogNames.filter(n => PAYMENTS_COMMAND_NAMES.includes(n));
    for (const name of catalogPay) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Payments command is duplicated', () => {
    const payRegistered = registryNames.filter(n => PAYMENTS_COMMAND_NAMES.includes(n));
    const unique = new Set(payRegistered);
    expect(unique.size).toBe(payRegistered.length);
  });
});

// ── Migrated commands (pick domain) ──────────────────────────────────────────

const PICK_COMMAND_NAMES = [
  'allocateOrderToFulfillment',
  'recordWeighAndPack',
  'releaseLineForPicking',
  'releaseLinesForPicking',
  'recallLineFromPicking',
  'returnPickedUnits',
  'printLabels',
  'createPickList',
  'adjustFulfillmentLine',
];

// ── Catalog parity (Pick) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (Pick domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/pick/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Pick command exists in the catalog', () => {
    const registeredPick = registryNames.filter(n => PICK_COMMAND_NAMES.includes(n));
    for (const name of registeredPick) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Pick catalog entry has a registered handler', () => {
    const catalogPick = catalogNames.filter(n => PICK_COMMAND_NAMES.includes(n));
    for (const name of catalogPick) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Pick command is duplicated', () => {
    const pickRegistered = registryNames.filter(n => PICK_COMMAND_NAMES.includes(n));
    const unique = new Set(pickRegistered);
    expect(unique.size).toBe(pickRegistered.length);
  });
});

// ── Migrated commands (vendor-management domain) ──────────────────────────

const VENDOR_COMMAND_NAMES = [
  'createVendor',
  'createVendorBill',
  'approveVendorBill',
  'createVendorSupply',
  'updateVendorSupply',
  'updateVendor',
  'updateProcessor',
  'scheduleVendorPayment',
  'recordVendorPayment',
  'voidVendorPayment',
];

// ── Catalog parity (Vendor Management) ─────────────────────────────────────

describe('command registry ↔ catalog parity (Vendor Management domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/vendor-management/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Vendor Management command exists in the catalog', () => {
    const registeredVM = registryNames.filter(n => VENDOR_COMMAND_NAMES.includes(n));
    for (const name of registeredVM) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Vendor Management catalog entry has a registered handler', () => {
    const catalogVM = catalogNames.filter(n => VENDOR_COMMAND_NAMES.includes(n));
    for (const name of catalogVM) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Vendor Management command is duplicated', () => {
    const vmRegistered = registryNames.filter(n => VENDOR_COMMAND_NAMES.includes(n));
    const unique = new Set(vmRegistered);
    expect(unique.size).toBe(vmRegistered.length);
  });
});


// ── Migrated commands (contacts domain) ──────────────────────────────────────

const CONTACTS_COMMAND_NAMES = [
  'createContact',
  'updateContact',
  'archiveContact',
  'addContactRole',
  'linkContactToExistingEntity',
  'linkContactToUser',
  'createAppointment',
  'updateAppointment',
  'cancelAppointment',
  'completeAppointment',
];

// ── Catalog parity (Contacts) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (Contacts domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/contacts/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Contacts command exists in the catalog', () => {
    const registeredCT = registryNames.filter(n => CONTACTS_COMMAND_NAMES.includes(n));
    for (const name of registeredCT) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Contacts catalog entry has a registered handler', () => {
    const catalogCT = catalogNames.filter(n => CONTACTS_COMMAND_NAMES.includes(n));
    for (const name of catalogCT) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Contacts command is duplicated', () => {
    const ctRegistered = registryNames.filter(n => CONTACTS_COMMAND_NAMES.includes(n));
    const unique = new Set(ctRegistered);
    expect(unique.size).toBe(ctRegistered.length);
  });
});

// ── Migrated commands (credit domain) ───────────────────────────────────────

const CREDIT_COMMAND_NAMES = [
  'bulkRevertCustomersToEngine',
  'createCreditEngineStance',
  'deleteCreditEngineStance',
  'disableCreditEngineForCustomer',
  'enableCreditEngineForCustomer',
  'revertCustomerCreditToEngine',
  'setCreditEngineConfig',
  'setCustomerCreditLimit',
  'setCustomerEngineMax',
  'setCustomerStance',
  'snoozeCustomerCreditReminder',
  'updateCreditEngineStance',
];

// ── Catalog parity (Credit) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (Credit domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/credit/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Credit command exists in the catalog', () => {
    const registeredCredit = registryNames.filter(n => CREDIT_COMMAND_NAMES.includes(n));
    for (const name of registeredCredit) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Credit catalog entry has a registered handler', () => {
    const catalogCredit = catalogNames.filter(n => CREDIT_COMMAND_NAMES.includes(n));
    for (const name of catalogCredit) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Credit command is duplicated', () => {
    const creditRegistered = registryNames.filter(n => CREDIT_COMMAND_NAMES.includes(n));
    const unique = new Set(creditRegistered);
    expect(unique.size).toBe(creditRegistered.length);
  });
});

// ── Migrated commands (matchmaking domain) ──────────────────────────────────

const MATCHMAKING_COMMAND_NAMES = [
  'acceptMatchmakingMatch',
  'dismissMatchmakingMatch',
  'reopenMatchmakingMatch',
  'updateMatchmakingSettings',
  'noteMatchmakingOutreach',
  'dismissMatchmakingWorkQueueItem',
];

// ── Catalog parity (Matchmaking) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (Matchmaking domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/matchmaking/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Matchmaking command exists in the catalog', () => {
    const registeredMM = registryNames.filter(n => MATCHMAKING_COMMAND_NAMES.includes(n));
    for (const name of registeredMM) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Matchmaking catalog entry has a registered handler', () => {
    const catalogMM = catalogNames.filter(n => MATCHMAKING_COMMAND_NAMES.includes(n));
    for (const name of catalogMM) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Matchmaking command is duplicated', () => {
    const mmRegistered = registryNames.filter(n => MATCHMAKING_COMMAND_NAMES.includes(n));
    const unique = new Set(mmRegistered);
    expect(unique.size).toBe(mmRegistered.length);
  });
});

// ── Migrated commands (media domain) ──────────────────────────────────────────

const MEDIA_COMMAND_NAMES = [
  'attachBatchPhoto',
  'deleteBatchMedia',
  'publishBatchMedia',
  'setBatchMediaRole',
  'uploadBatchMedia',
  'mintPhotoUploadToken',
  'revokePhotoUploadToken',
];

// ── Catalog parity (Media) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (Media domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/media/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered Media command exists in the catalog', () => {
    const registeredMedia = registryNames.filter(n => MEDIA_COMMAND_NAMES.includes(n));
    for (const name of registeredMedia) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every Media catalog entry has a registered handler', () => {
    const catalogMedia = catalogNames.filter(n => MEDIA_COMMAND_NAMES.includes(n));
    for (const name of catalogMedia) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered Media command is duplicated', () => {
    const mediaRegistered = registryNames.filter(n => MEDIA_COMMAND_NAMES.includes(n));
    const unique = new Set(mediaRegistered);
    expect(unique.size).toBe(mediaRegistered.length);
  });
});

// ── Migrated commands (system domain) ──────────────────────────────────────

const SYSTEM_COMMAND_NAMES = [
  'applyTags',
  'acknowledgeWarehouseAlert',
  'cancelFulfillmentLine',
  'markOrderFulfilled',
  'approveConnectorRequest',
  'rejectConnectorRequest',
  'routeConnectorRequest',
  'createCorrectionJournalEntry',
  'postTransactionLedgerRow',
  'upsertTransactionType',
  'reverseCommandById',
  'documentCommandFailure',
  'restoreFromBackupPoint',
  'postPeriodAdjustments',
  'lockPeriod',
  'archivePeriod',
  'createCustomerNeed',
  'updateCustomerNeed',
  'setItemAlias',
  'createReferee',
  'updateReferee',
  'addRefereeRelationship',
  'updateRefereeRelationship',
  'deactivateRefereeRelationship',
  'voidRefereeCredit',
  'createPaymentProcessor',
  'updateProcessorFeeStatus',
  'updateSystemSetting',
  'createItem',
  'updateItem',
  'toggleItemStatus',
  'resolveInvoiceDispute',
  'rejectInvoiceDispute',
  'approveMergeCandidate',
  'dismissMergeCandidate',
];

// ── Catalog parity (System) ─────────────────────────────────────────────────

describe('command registry ↔ catalog parity (System domain)', () => {
  let registryNames: string[];
  let catalogNames: string[];

  beforeAll(async () => {
    // Import triggers defineCommand side effects (populates registry).
    await import('@/domains/system/commandDefs');
    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    registryNames = getRegisteredNames();

    // Read catalog from source to avoid circular imports.
    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  });

  it('every registered System command exists in the catalog', () => {
    const registeredSys = registryNames.filter(n => SYSTEM_COMMAND_NAMES.includes(n));
    for (const name of registeredSys) {
      expect(catalogNames).toContain(name);
    }
  });

  it('every System catalog entry has a registered handler', () => {
    const catalogSys = catalogNames.filter(n => SYSTEM_COMMAND_NAMES.includes(n));
    for (const name of catalogSys) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered System command is duplicated', () => {
    const sysRegistered = registryNames.filter(n => SYSTEM_COMMAND_NAMES.includes(n));
    const unique = new Set(sysRegistered);
    expect(unique.size).toBe(sysRegistered.length);
  });
});

// ── Future gates (enabled — full migration complete) ─────────────────────────

describe('command registry — full migration gates', () => {
  it('commandBus.ts contains no switch(name) statement in runCommand', () => {
    const commandBusPath = path.resolve(__dirname, '../server/services/commandBus.ts');
    const source = fs.readFileSync(commandBusPath, 'utf-8');
    // The runCommand function should not contain any switch(name) statement.
    // Extract the runCommand function body.
    const funcMatch = source.match(/export async function runCommand[\s\S]*?^export async function applyTags/m);
    if (funcMatch) {
      expect(funcMatch[0]).not.toMatch(/switch\s*\(\s*name\s*\)/);
    }
  });

  it('every catalog command has a registered handler', async () => {
    // Load all domain barrels to populate the registry.
    await import('@/domains/purchase-orders/commandDefs');
    await import('@/domains/inventory/commandDefs');
    await import('@/domains/intake/commandDefs');
    await import('@/domains/media/commandDefs');
    await import('@/domains/sales-orders/commandDefs');
    await import('@/domains/payments/commandDefs');
    await import('@/domains/pick/commandDefs');
    await import('@/domains/vendor-management/commandDefs');
    await import('@/domains/contacts/commandDefs');
    await import('@/domains/credit/commandDefs');
    await import('@/domains/matchmaking/commandDefs');
    await import('@/domains/system/commandDefs');

    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    const registryNames = getRegisteredNames();

    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    const catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

    for (const name of catalogNames) {
      expect(registryNames).toContain(name);
    }
  });

  it('no registered command is missing from the catalog', async () => {
    await import('@/domains/purchase-orders/commandDefs');
    await import('@/domains/inventory/commandDefs');
    await import('@/domains/intake/commandDefs');
    await import('@/domains/media/commandDefs');
    await import('@/domains/sales-orders/commandDefs');
    await import('@/domains/payments/commandDefs');
    await import('@/domains/pick/commandDefs');
    await import('@/domains/vendor-management/commandDefs');
    await import('@/domains/contacts/commandDefs');
    await import('@/domains/credit/commandDefs');
    await import('@/domains/matchmaking/commandDefs');
    await import('@/domains/system/commandDefs');

    const { getRegisteredNames } = await import('@/server/services/commandRegistry');
    const registryNames = getRegisteredNames();

    const catalogPath = path.resolve(__dirname, '../shared/commandCatalog.ts');
    const catalogSource = fs.readFileSync(catalogPath, 'utf-8');
    const match = catalogSource.match(/export const commandNames = \[([\s\S]*?)\]/);
    if (!match) throw new Error('Could not parse commandNames from catalog.');
    const catalogNames = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

    for (const name of registryNames) {
      expect(catalogNames).toContain(name);
    }
  });
});
