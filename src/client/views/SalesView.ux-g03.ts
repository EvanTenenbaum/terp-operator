/**
 * UX-G03 — daily-surface reachability for setDeliveryWindow and
 * applyClientCredit (audit §G).
 *
 * setDeliveryWindow: OrdersView already commits inline deliveryWindow edits
 * (OrdersView.tsx:65-66). The SalesView Sales Orders grid rendered the same
 * editable column WITHOUT an onCellCommit handler, so edits silently went
 * nowhere — `salesOrderCellCommand` backs the new handler (same command,
 * same payload shape as OrdersView).
 *
 * applyClientCredit: previously reachable only from the RowInspector Issue
 * sidecar — no daily-surface home. The Sale tray now carries a manager-gated
 * "Apply credit" control; the helpers below keep its gating and payload
 * logic pure and tested. Payload mirrors applyClientCreditPayloadSchema
 * (commandBus.ts:369): { customerId, amount, reason? }.
 */

export interface SalesOrderCellCommand {
  name: 'setDeliveryWindow';
  payload: Record<string, unknown>;
  description: string;
}

/** Command for an inline Sales Orders grid cell commit, or null to ignore. */
export function salesOrderCellCommand(
  field: string | undefined | null,
  orderId: unknown,
  newValue: unknown
): SalesOrderCellCommand | null {
  if (field !== 'deliveryWindow') return null;
  const id = String(orderId ?? '').trim();
  const deliveryWindow = String(newValue ?? '').trim();
  // setDeliveryWindowPayloadSchema requires a non-empty string.
  if (!id || !deliveryWindow) return null;
  return {
    name: 'setDeliveryWindow',
    payload: { orderId: id, deliveryWindow },
    description: 'Inline delivery window edit (sales view)'
  };
}

/**
 * Disabled-with-reason text for the Sale tray "Apply credit" button
 * (UX-D04 pattern). Returns null when the action is runnable.
 * applyClientCredit is manager-gated (commandCatalog commandMinRole).
 */
export function applyCreditDisabledReason(
  role: string | undefined,
  customerId: string,
  amount: string
): string | null {
  if (role !== 'manager' && role !== 'owner') return 'Manager role required to apply client credit';
  if (!customerId) return 'Pick a customer first';
  const value = Number(amount);
  if (!Number.isFinite(value) || value === 0) return 'Enter a non-zero credit amount';
  return null;
}

/** applyClientCredit payload (commandBus.ts applyClientCreditPayloadSchema). */
export function buildApplyCreditPayload(
  customerId: string,
  amount: string,
  reason: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    customerId,
    amount: Number(amount)
  };
  const trimmedReason = reason.trim();
  if (trimmedReason) payload.reason = trimmedReason;
  return payload;
}
