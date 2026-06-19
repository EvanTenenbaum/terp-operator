/**
 * Purchase Orders domain — curated re-exports.
 *
 * Consumers (e.g. commandBus.runCommand switch) should import handlers from
 * this barrel rather than reaching into commands.ts directly.
 */

export {
  addPurchaseOrderLine,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  finalizePurchaseOrder,
  postPurchaseReceipt,
  receivePurchaseOrder,
  recordVendorPrepayment,
  removePurchaseOrderLine,
  unfinalizePurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderLine,
} from './commands';
