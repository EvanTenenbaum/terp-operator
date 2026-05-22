import type { DocumentType } from '../../../shared/documentSnapshots';
import * as poProjection from './poProjection';
import * as customerPaymentProjection from './customerPaymentProjection';
import * as vendorPayoutProjection from './vendorPayoutProjection';

export interface ProjectionModule {
  EXTERNAL_FIELDS: readonly string[];
  PROJECTION_VERSION: number;
  projectExternal: (internal: unknown) => { payload: Record<string, unknown>; projectionVersion: number };
  renderPlainTextExternal: (external: Record<string, unknown>) => string;
  renderPlainTextInternal: (internal: Record<string, unknown>) => string;
}

// Getters route every property access through the live `poProjection` module
// namespace so tests can `vi.spyOn(poProjection, 'projectExternal')` and have
// the spy take effect in production callers. Without getters, REGISTRY would
// freeze the original function reference at module-load time.
const REGISTRY: Partial<Record<DocumentType, ProjectionModule>> = {
  purchase_order: {
    get EXTERNAL_FIELDS() { return poProjection.EXTERNAL_FIELDS; },
    get PROJECTION_VERSION() { return poProjection.PROJECTION_VERSION; },
    get projectExternal() { return poProjection.projectExternal; },
    get renderPlainTextExternal() { return poProjection.renderPlainTextExternal; },
    get renderPlainTextInternal() { return poProjection.renderPlainTextInternal; }
  } as ProjectionModule,
  customer_payment: {
    get EXTERNAL_FIELDS() { return customerPaymentProjection.EXTERNAL_FIELDS; },
    get PROJECTION_VERSION() { return customerPaymentProjection.PROJECTION_VERSION; },
    get projectExternal() { return customerPaymentProjection.projectExternal; },
    get renderPlainTextExternal() { return customerPaymentProjection.renderPlainTextExternal; },
    get renderPlainTextInternal() { return customerPaymentProjection.renderPlainTextInternal; }
  } as ProjectionModule,
  vendor_payout: {
    get EXTERNAL_FIELDS() { return vendorPayoutProjection.EXTERNAL_FIELDS; },
    get PROJECTION_VERSION() { return vendorPayoutProjection.PROJECTION_VERSION; },
    get projectExternal() { return vendorPayoutProjection.projectExternal; },
    get renderPlainTextExternal() { return vendorPayoutProjection.renderPlainTextExternal; },
    get renderPlainTextInternal() { return vendorPayoutProjection.renderPlainTextInternal; }
  } as ProjectionModule,
};

export function hasProjectionFor(documentType: DocumentType): boolean {
  return Boolean(REGISTRY[documentType]);
}

export function getProjectionFor(documentType: DocumentType): ProjectionModule {
  const entry = REGISTRY[documentType];
  if (!entry) throw new Error(`No projection registered for document_type "${documentType}"`);
  return entry;
}
