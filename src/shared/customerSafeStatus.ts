/**
 * customerSafeStatus — shared customer-safe ("external-safe") status copy.
 *
 * UX-U01 / UX-N02 (Loop-8 non-negotiable, docs/ux-audit-2026-06-12.md §N/§U):
 * support operators need a one-click "Copy status summary (customer-safe)"
 * that tells the status story WITHOUT cost, margin, or internal notes.
 *
 * This module is the single gating authority for customer-facing status text
 * built from operator rows:
 *
 *   - `isCustomerSafeKey` / `sanitizeCustomerSafe` — field-level gate.
 *     Mirrors the CATALOG_HEADERS stance in src/client/utils/salesExport.ts
 *     ("must NEVER include cost, margin, or other internal fields"). The
 *     catalog/offer surfaces (UX-F01 / UX-R03) reuse this same approach.
 *   - `buildOrderStatusSummary` — whitelist-only order status story used by
 *     the ContextDrawer order Timeline tab (EntityTimelineTab).
 *   - `buildCustomerSafeRelationshipStatus` / `buildVendorSafeRelationshipStatus`
 *     — the exact text previously inlined in RelationshipDrawer's
 *     "Copy external-safe status" action (converged here per UX-N02).
 *
 * Defense in depth: summary builders read ONLY whitelisted fields, and the
 * source object is additionally passed through `sanitizeCustomerSafe` so a
 * future whitelist mistake still cannot leak a forbidden field.
 */

/** Substring patterns that mark a field as internal-only. */
const FORBIDDEN_KEY_PATTERN = /(cost|margin|floor|landed|profit|payout|internal|snapshot|payload)/i;

/** Exact field names that are internal-only regardless of pattern. */
const FORBIDDEN_KEYS = new Set([
  'notes',
  'note',
  'reason',
  'buyernotes',
  'operatornotes',
  'discrepancynotes',
  'impactpreview',
  'duereason',
  'error',
  'result',
  'creditlimit',
  'headroom',
  'unappliedamount',
  'validationissues',
  'legacystatusmarkers',
  'legacystatusmarker',
  'legacymarker',
  'pricingrule',
  'pricingstrategy'
]);

/** True when a field name is safe to surface in customer-facing copy. */
export function isCustomerSafeKey(key: string): boolean {
  if (FORBIDDEN_KEY_PATTERN.test(key)) return false;
  if (FORBIDDEN_KEYS.has(key.toLowerCase())) return false;
  return true;
}

/**
 * Returns a deep copy of `input` with every forbidden field removed
 * (recursively, including objects nested in arrays). Never mutates input.
 */
export function sanitizeCustomerSafe(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isCustomerSafeKey(key)) continue;
    out[key] = sanitizeValue(value);
  }
  return out;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return sanitizeCustomerSafe(value as Record<string, unknown>);
  }
  return value;
}

/** Money formatting shared with RelationshipDrawer's previous inline copy. */
export function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function textValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function dateValue(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US');
}

function numberValue(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Minimal event shape the order summary accepts (timeline events qualify). */
export interface CustomerSafeTimelineEvent {
  eventType: string;
  label: string;
  occurredAt: string | Date | null;
  status?: string | null;
}

/**
 * Customer-safe order status story (UX-N02). Whitelist-only: order number,
 * status, placed date, customer-facing total, delivery window, fulfillment
 * marks, and recent activity labels. Cost, margin, and internal notes are
 * structurally excluded (never read) AND stripped by sanitizeCustomerSafe.
 */
export function buildOrderStatusSummary(
  order: Record<string, unknown>,
  events: CustomerSafeTimelineEvent[] = []
): string {
  const safe = sanitizeCustomerSafe(order);
  const lines: string[] = [];
  const orderNo = textValue(safe.orderNo) || 'Order';
  const status = textValue(safe.status);
  lines.push(status ? `${orderNo} — ${status}` : orderNo);
  const placed = dateValue(safe.createdAt);
  if (placed) lines.push(`Placed: ${placed}`);
  const total = numberValue(safe.total);
  if (total != null) lines.push(`Order total: $${formatMoney(total)}`);
  const delivery = textValue(safe.deliveryWindow);
  if (delivery) lines.push(`Delivery window: ${delivery}`);
  if (safe.packed === true) lines.push('Packed: yes');
  const fulfilled = dateValue(safe.fulfilledAt);
  if (fulfilled) lines.push(`Fulfilled: ${fulfilled}`);
  const recent = events
    .slice(0, 6)
    .map((event) => {
      const when = dateValue(event.occurredAt);
      const suffix = event.status ? ` (${event.status})` : '';
      return `- ${when ? `${when} — ` : ''}${event.label}${suffix}`;
    });
  if (recent.length) {
    lines.push('Recent activity:');
    lines.push(...recent);
  }
  return lines.join('\n');
}

/** A document reference line: "SO-1001 posted". */
export interface SafeDocRef {
  refNo: string;
  status: string;
}

function docList(rows: SafeDocRef[]): string {
  return rows.slice(0, 3).map((row) => `${row.refNo} ${row.status}`).join(', ') || 'none';
}

/**
 * Customer-side external-safe relationship status. Output format is byte-for-
 * byte identical to the text RelationshipDrawer previously built inline.
 */
export function buildCustomerSafeRelationshipStatus(input: {
  name: string;
  openBalance: number;
  orders?: SafeDocRef[];
  invoices?: SafeDocRef[];
}): string {
  return [
    input.name,
    `Open balance: $${formatMoney(input.openBalance)}`,
    `Recent orders: ${docList(input.orders ?? [])}`,
    `Recent invoices: ${docList(input.invoices ?? [])}`
  ].join('\n');
}

/**
 * Vendor-side external-safe relationship status. Output format is byte-for-
 * byte identical to the text RelationshipDrawer previously built inline.
 */
export function buildVendorSafeRelationshipStatus(input: {
  name: string;
  openPayables: number;
  scheduledPayoutCount: number;
  bills?: SafeDocRef[];
}): string {
  return [
    input.name,
    `Open payables: $${formatMoney(input.openPayables)}`,
    `Scheduled payouts: ${input.scheduledPayoutCount}`,
    `Recent bills: ${docList(input.bills ?? [])}`
  ].join('\n');
}
