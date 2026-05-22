export const PROJECTION_VERSION = 1 as const;

export const EXTERNAL_FIELDS = [
  'kind',
  'paymentDate',
  'amount',
  'method',
  'reference',
  'customerName',
  'notes',
] as const satisfies readonly string[];

export const INTERNAL_FIELDS = [
  ...EXTERNAL_FIELDS,
  'direction',
  'category',
  'allocationIntent',
  'status',
  'customerId',
] as const;

export function projectExternal(internal: unknown): { payload: Record<string, unknown>; projectionVersion: number } {
  if (!internal || typeof internal !== 'object') {
    throw new Error('customer_payment projection: internal payload must be an object');
  }
  const src = internal as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const field of EXTERNAL_FIELDS) {
    if (field in src) payload[field] = src[field];
  }
  return { payload, projectionVersion: PROJECTION_VERSION };
}

export function renderPlainTextExternal(external: Record<string, unknown>): string {
  const parts: string[] = [];
  parts.push(`Payment received from ${String(external.customerName ?? 'customer')}.`);
  parts.push(`Amount: $${String(external.amount ?? '0.00')}.`);
  parts.push(`Method: ${String(external.method ?? 'unknown')}.`);
  if (external.reference) parts.push(`Reference: ${String(external.reference)}.`);
  if (external.paymentDate) parts.push(`Date: ${String(external.paymentDate)}.`);
  if (external.notes) parts.push(`Notes: ${String(external.notes)}.`);
  return parts.join(' ');
}

export function renderPlainTextInternal(internal: Record<string, unknown>): string {
  return [
    'INTERNAL — DO NOT SEND',
    renderPlainTextExternal(internal),
    `Direction: ${String(internal.direction ?? 'money_in')}.`,
    `Category: ${String(internal.category ?? '—')}.`,
    `Status: ${String(internal.status ?? 'posted')}.`,
  ].join('\n');
}
