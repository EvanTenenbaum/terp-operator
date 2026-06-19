/**
 * Sales Orders domain — curated re-exports.
 *
 * Consumers (e.g. commandBus.runCommand switch) should import handlers from
 * this barrel rather than reaching into commands.ts directly.
 */

export {
  addSalesOrderLine,
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  postSalesOrder,
  priceSalesOrder,
  removeSalesOrderLine,
  reserveInventoryForOrder,
  resolveVendorApproval,
  setCustomerPricingRule,
  setDefaultPricingRule,
  setDeliveryWindow,
  setLineBelowFloorReason,
  setLineLandedCost,
  updateSalesOrderLine,
} from './commands';
