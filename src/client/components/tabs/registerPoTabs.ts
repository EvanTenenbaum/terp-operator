import { registerTabs } from './registry';
import { poDetailTab } from './PoDetailTab';
import { poLinesTab } from './PoLinesTab';
import { poLinkedIntakeTab } from './PoLinkedIntakeTab';
import { poVendorTab } from './PoVendorTab';

/**
 * Register all Purchase Order tabs in the global tab registry.
 * Idempotent — calling twice replaces the previous registration.
 */
export function registerPurchaseOrderTabs(): void {
  registerTabs('purchaseOrder', [poDetailTab, poLinesTab, poLinkedIntakeTab, poVendorTab]);
}
