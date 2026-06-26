// Barrel module — OperationsViews was split into per-view files (UX-T01).
// Every previously-exported symbol is re-exported here so existing imports
// (App.tsx, tests) keep working unchanged.
export { PurchaseOrdersView } from './PurchaseOrdersView';
export { OrdersView } from './OrdersView';
export { PaymentsView } from './PaymentsView';
export { InventoryView } from './InventoryView';
export { ClientLedgerView } from './ClientLedgerView';
export { VendorPayablesView } from './VendorPayablesView';
export { FulfillmentView } from './FulfillmentView';
export { ConnectorsView } from './ConnectorsView';
export { RecoveryView } from './RecoveryView';
export { PurchaseReceiptsView } from './PurchaseReceiptsView';
export { CloseoutView } from './CloseoutView';
export { SettingsView } from './SettingsView';
export { BarterView } from './BarterView';
export { InvoiceDisputesView } from './InvoiceDisputesView';
