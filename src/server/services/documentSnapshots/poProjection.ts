export const PROJECTION_VERSION = 1 as const;

export const EXTERNAL_FIELDS = [
  'poNo',
  'vendorName',
  'vendorAlias',
  'expectedDate',
  'paymentTerms',
  'prepaymentAmount',
  'externalNotes',
  'finalizedAt',
  'total',
  'lines'
] as const;

export const EXTERNAL_LINE_FIELDS = [
  'productName',
  'category',
  'qty',
  'uom',
  'unitCost',
  'costRangeLow',
  'costRangeHigh',
  'externalNotes'
] as const;

const REQUIRED_HEADER_KEYS = ['poNo', 'paymentTerms', 'total', 'lines'] as const;

export function assertExternalLineShape(line: Record<string, unknown>): void {
  for (const key of Object.keys(line)) {
    if (!(EXTERNAL_LINE_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`PO external projection: line contains non-allowlisted key "${key}"`);
    }
  }
}

export function projectExternal(internal: unknown): { payload: Record<string, unknown>; projectionVersion: number } {
  if (!internal || typeof internal !== 'object') {
    throw new Error('PO external projection: internal payload must be an object');
  }
  const src = internal as Record<string, unknown>;
  for (const key of REQUIRED_HEADER_KEYS) {
    if (!(key in src)) {
      throw new Error(`PO external projection: missing required key "${key}"`);
    }
  }
  const linesIn = Array.isArray(src.lines) ? (src.lines as Array<Record<string, unknown>>) : [];
  const lines = linesIn.map((line) => {
    const projected: Record<string, unknown> = {};
    for (const k of EXTERNAL_LINE_FIELDS) {
      if (k in line) projected[k] = line[k];
    }
    assertExternalLineShape(projected);
    return projected;
  });
  const payload: Record<string, unknown> = {};
  for (const k of EXTERNAL_FIELDS) {
    if (k === 'lines') {
      payload.lines = lines;
    } else if (k in src) {
      payload[k] = src[k];
    } else {
      payload[k] = null;
    }
  }
  return { payload, projectionVersion: PROJECTION_VERSION };
}

function fmtMoney(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
}
function fmtQty(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(3).replace(/\.?0+$/, '') : '0';
}
function fmtDate(value: unknown): string {
  if (!value) return 'not set';
  try {
    return new Date(String(value)).toISOString().slice(0, 10);
  } catch {
    return String(value);
  }
}

export function renderPlainTextExternal(external: Record<string, unknown>): string {
  const lines = (external.lines as Array<Record<string, unknown>> | undefined) ?? [];
  const headerParts: string[] = [];
  headerParts.push(`Purchase Order ${String(external.poNo ?? '')} for ${String(external.vendorName ?? 'vendor')}.`);
  if (external.vendorAlias) headerParts.push(`Vendor alias: ${String(external.vendorAlias)}.`);
  headerParts.push(`Expected delivery: ${fmtDate(external.expectedDate)}.`);
  headerParts.push(`Payment terms: ${String(external.paymentTerms ?? 'not set')}.`);
  if (Number(external.prepaymentAmount ?? 0) > 0) {
    headerParts.push(`Prepayment: ${fmtMoney(external.prepaymentAmount)}.`);
  }
  if (external.finalizedAt) headerParts.push(`Finalized: ${fmtDate(external.finalizedAt)}.`);
  if (external.externalNotes) headerParts.push(`Notes: ${String(external.externalNotes)}`);
  const lineParts = lines.map((line, idx) => {
    const range = (line.costRangeLow != null && line.costRangeHigh != null)
      ? ` (Vendor price range: ${fmtMoney(line.costRangeLow)}–${fmtMoney(line.costRangeHigh)})`
      : '';
    const note = line.externalNotes ? `. Line note: ${String(line.externalNotes)}` : '';
    return `${idx + 1}. ${String(line.productName ?? '')} — ${String(line.category ?? '')}, ${fmtQty(line.qty)} ${String(line.uom ?? '')} at Vendor unit price ${fmtMoney(line.unitCost)}${range}${note}.`;
  });
  return [headerParts.join(' '), '', 'Lines:', ...lineParts, '', `Total: ${fmtMoney(external.total)}.`].join('\n');
}

export function renderPlainTextInternal(internal: Record<string, unknown>): string {
  const lines = (internal.lines as Array<Record<string, unknown>> | undefined) ?? [];
  const headerParts: string[] = [];
  headerParts.push('INTERNAL — DO NOT SEND');
  headerParts.push(`Purchase Order ${String(internal.poNo ?? '')} for ${String(internal.vendorName ?? 'vendor')}.`);
  if (internal.vendorAlias) headerParts.push(`Vendor alias: ${String(internal.vendorAlias)}.`);
  headerParts.push(`Status: ${String(internal.status ?? 'unknown')}.`);
  headerParts.push(`Expected delivery: ${fmtDate(internal.expectedDate)}.`);
  headerParts.push(`Payment terms: ${String(internal.paymentTerms ?? 'not set')}.`);
  if (Number(internal.prepaymentAmount ?? 0) > 0) {
    headerParts.push(`Prepayment: ${fmtMoney(internal.prepaymentAmount)}.`);
  }
  if (internal.buyerNotes) headerParts.push(`Buyer notes: ${String(internal.buyerNotes)}.`);
  if (internal.internalNotes) headerParts.push(`Internal notes: ${String(internal.internalNotes)}.`);
  if (internal.externalNotes) headerParts.push(`External notes: ${String(internal.externalNotes)}.`);
  const lineParts = lines.map((line, idx) => {
    const range = (line.costRangeLow != null && line.costRangeHigh != null)
      ? ` (vendor range: ${fmtMoney(line.costRangeLow)}–${fmtMoney(line.costRangeHigh)})`
      : '';
    const resale = Number(line.unitPrice ?? 0) > 0 ? ` | Resale/markup: ${fmtMoney(line.unitPrice)}` : '';
    const ext = line.externalNotes ? ` | External line note: ${String(line.externalNotes)}` : '';
    const intn = line.internalNotes ? ` | Internal line note: ${String(line.internalNotes)}` : '';
    const generic = line.notes ? ` | Note: ${String(line.notes)}` : '';
    return `${idx + 1}. ${String(line.productName ?? '')} — ${String(line.category ?? '')}, ${fmtQty(line.qty)} ${String(line.uom ?? '')} at vendor ${fmtMoney(line.unitCost)}${range}${resale}${ext}${intn}${generic}.`;
  });
  return [
    headerParts.join('\n'),
    '',
    'Lines:',
    ...lineParts,
    '',
    `Total: ${fmtMoney(internal.total)}.`
  ].join('\n');
}
