/**
 * Sales Orders command definitions — barrel.
 *
 * Importing this module triggers defineCommand() side effects that
 * populate the command registry. No explicit re-exports needed;
 * each command file self-registers.
 */
import './addSalesOrderLine';
import './cancelSalesOrder';
import './confirmSalesOrder';
import './createSalesOrder';
import './postSalesOrder';
import './priceSalesOrder';
import './removeSalesOrderLine';
import './repriceOrder';
import './reserveInventoryForOrder';
import './resolveVendorApproval';
import './setCustomerPricingRule';
import './setDefaultPricingRule';
import './setDeliveryWindow';
import './setLineBelowFloorReason';
import './setLineLandedCost';
import './updateSalesOrderLine';
