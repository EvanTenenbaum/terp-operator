/**
 * UX-F06 — Referee inline prompt helpers for SalesView.
 *
 * When a customer has an active referee relationship, the Sale Builder
 * shows a one-line pill at confirm time so credit accrual is never silently
 * missed. These pure helpers are extracted for testability.
 */

/**
 * Derive the active referee relationships for a specific customer.
 * Filters the full refereeRelationships reference list (which already
 * contains only active=true rows from the server) to customer-type
 * relationships for the given customerId.
 */
export function deriveCustomerRefereeRelationships(
  refereeRelationships: Array<{
    id: string;
    refereeId: string;
    refereeName: string;
    entityType: string;
    entityId: string;
    feeType: string;
    feePercentage: number | null;
    feeFixedAmount: number | null;
    applyByDefault: boolean;
    active: boolean;
  }>,
  customerId: string
): typeof refereeRelationships {
  if (!customerId) return [];
  return refereeRelationships.filter(
    (rel) => rel.entityType === 'customer' && rel.entityId === customerId
  );
}

/**
 * Build the confirmSalesOrder command payload.
 * Includes refereeRelationshipId and logRefereeCredit=true when a
 * relationship has been selected; otherwise returns orderId only.
 */
export function buildConfirmPayload(
  orderId: string,
  refereeRelationshipId: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = { orderId };
  if (refereeRelationshipId) {
    payload.refereeRelationshipId = refereeRelationshipId;
    payload.logRefereeCredit = true;
  }
  return payload;
}
