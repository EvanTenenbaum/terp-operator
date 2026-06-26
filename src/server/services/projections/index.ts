// Issue #113 Phase 1 — Projector barrel + persisted-shape validators.
//
// validateExternalShape(json, kind) and validateInternalShape(json, kind)
// are kind-aware: they look up the kind's allowlist (exported by each
// per-kind projector file) and assert the JSON is a subset of it.
//
// They reject:
//   • non-objects and arrays at the top level
//   • the persisted-witness keys __EXTERNAL_PROJECTED__ and __INTERNAL_ONLY__
//     (which must NEVER be on disk — the witnesses are re-applied in memory
//     by the service loader, see Task 7)
//   • unknown top-level keys
//   • unknown nested keys in header, lines (each line), totals, footer
//   • for internal: also unknown nested keys in cogs, cogs.perLine (each
//     entry), margin, margin.perLine (each entry), diagnostics
//
// `undefined` values in the JSON object are tolerated by the validator —
// JSON.stringify drops them and JSONB never stores them, so a freshly-
// projected in-memory object that has explicit `undefined` properties is
// equivalent to one that omits them. The hashSnapshot/canonicalizeJson
// path (Task 5) is the load-bearing guard against `undefined` reaching
// disk.

import {
  externalAllowlist as poExternal,
  internalAllowlist as poInternal,
  purchaseFinalization,
  projectionVersion as purchaseFinalizationProjectionVersion,
} from './purchaseFinalization';
import {
  externalAllowlist as soExternal,
  internalAllowlist as soInternal,
  salesConfirmation,
  projectionVersion as salesConfirmationProjectionVersion,
} from './salesConfirmation';
import {
  externalAllowlist as invExternal,
  internalAllowlist as invInternal,
  invoice,
  projectionVersion as invoiceProjectionVersion,
} from './invoice';
import {
  externalAllowlist as payExternal,
  internalAllowlist as payInternal,
  paymentReceived,
  projectionVersion as paymentReceivedProjectionVersion,
} from './paymentReceived';
import {
  externalAllowlist as payoutExternal,
  internalAllowlist as payoutInternal,
  vendorPayout,
  projectionVersion as vendorPayoutProjectionVersion,
} from './vendorPayout';
import type { SnapshotKind } from './types';

export {
  purchaseFinalization,
  salesConfirmation,
  invoice,
  paymentReceived,
  vendorPayout,
  purchaseFinalizationProjectionVersion,
  salesConfirmationProjectionVersion,
  invoiceProjectionVersion,
  paymentReceivedProjectionVersion,
  vendorPayoutProjectionVersion,
};

// ---------------------------------------------------------------------------
// Allowlist registries
// ---------------------------------------------------------------------------

interface ExternalAllowlistShape {
  topLevel: readonly string[];
  header: readonly string[];
  line: readonly string[];
  totals: readonly string[];
  footer: readonly string[];
}

interface InternalAllowlistShape extends ExternalAllowlistShape {
  cogs: readonly string[];
  cogsLine: readonly string[];
  margin: readonly string[];
  marginLine: readonly string[];
  diagnostics: readonly string[];
}

const EXTERNAL_ALLOWLISTS: Record<SnapshotKind, ExternalAllowlistShape> = {
  purchase_finalization: poExternal,
  sales_confirmation: soExternal,
  invoice: invExternal,
  payment_received: payExternal,
  vendor_payout: payoutExternal,
  barter_settlement: {
    topLevel: ['kind', 'type', 'settlementNo', 'direction', 'amount', 'counterpartyType', 'note'],
    header: [],
    line: [],
    totals: [],
    footer: [],
  } as ExternalAllowlistShape,
};

const INTERNAL_ALLOWLISTS: Record<SnapshotKind, InternalAllowlistShape> = {
  purchase_finalization: poInternal,
  sales_confirmation: soInternal,
  invoice: invInternal,
  payment_received: payInternal,
  vendor_payout: payoutInternal,
  barter_settlement: {
    topLevel: ['kind', 'settlementNo', 'direction', 'counterpartyType', 'settlementAmount', 'costBasis', 'gainLoss', 'valueOverridden', 'lineCount', 'createdAt'],
    header: [],
    line: ['batchId', 'productName', 'qty', 'unitCost', 'lineSettlementAmount'],
    totals: [],
    footer: [],
    cogs: [],
    cogsLine: [],
    margin: [],
    marginLine: [],
    diagnostics: [],
  } as InternalAllowlistShape,
};

const BANNED_WITNESS_KEYS = ['__EXTERNAL_PROJECTED__', '__INTERNAL_ONLY__'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function ownKeys(obj: Record<string, unknown>): string[] {
  // Iterate own enumerable keys only. We do NOT want inherited junk.
  return Object.keys(obj);
}

function assertNoBannedWitness(
  obj: Record<string, unknown>,
  path: string,
  kind: SnapshotKind,
): void {
  for (const banned of BANNED_WITNESS_KEYS) {
    if (banned in obj) {
      throw new Error(
        `validateShape(${kind}): persisted witness key '${banned}' is forbidden on disk at ${path}`,
      );
    }
  }
}

function assertKeysSubset(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  kind: SnapshotKind,
): void {
  for (const k of ownKeys(obj)) {
    if (!allowed.includes(k)) {
      throw new Error(
        `validateShape(${kind}): key '${k}' at ${path} is not in the allowlist`,
      );
    }
  }
}

function assertNestedObject(
  value: unknown,
  allowed: readonly string[],
  path: string,
  kind: SnapshotKind,
): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new Error(
      `validateShape(${kind}): expected object at ${path}, got ${describe(value)}`,
    );
  }
  assertNoBannedWitness(value, path, kind);
  assertKeysSubset(value, allowed, path, kind);
}

function assertNestedArrayOfObjects(
  value: unknown,
  allowed: readonly string[],
  path: string,
  kind: SnapshotKind,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(
      `validateShape(${kind}): expected array at ${path}, got ${describe(value)}`,
    );
  }
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (!isPlainObject(entry)) {
      throw new Error(
        `validateShape(${kind}): expected object at ${path}[${i}], got ${describe(entry)}`,
      );
    }
    assertNoBannedWitness(entry, `${path}[${i}]`, kind);
    assertKeysSubset(entry, allowed, `${path}[${i}]`, kind);
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function assertHeaderValueTypes(
  header: Record<string, unknown>,
  path: string,
  kind: SnapshotKind,
): void {
  const { dateISO, documentNo } = header;
  if (dateISO !== undefined && typeof dateISO !== 'string') {
    throw new Error(
      `validateShape(${kind}): ${path}.dateISO must be a string, got ${describe(dateISO)}`,
    );
  }
  if (documentNo !== undefined && typeof documentNo !== 'string') {
    throw new Error(
      `validateShape(${kind}): ${path}.documentNo must be a string, got ${describe(documentNo)}`,
    );
  }
}

function assertTotalsValueTypes(
  totals: Record<string, unknown>,
  path: string,
  kind: SnapshotKind,
): void {
  const { subtotal, total } = totals;
  if (subtotal !== undefined && typeof subtotal !== 'number') {
    throw new Error(
      `validateShape(${kind}): ${path}.subtotal must be a number, got ${describe(subtotal)}`,
    );
  }
  if (total !== undefined && typeof total !== 'number') {
    throw new Error(
      `validateShape(${kind}): ${path}.total must be a number, got ${describe(total)}`,
    );
  }
}

function assertLinesValueTypes(
  lines: unknown[],
  kind: SnapshotKind,
): void {
  for (let i = 0; i < lines.length; i++) {
    const entry = lines[i];
    if (!isPlainObject(entry)) continue; // structural error caught by assertNestedArrayOfObjects
    const line = entry as Record<string, unknown>;
    if (line.qty !== undefined && typeof line.qty !== 'number') {
      throw new Error(
        `validateShape(${kind}): lines[${i}].qty must be a number, got ${describe(line.qty)}`,
      );
    }
    if (line.subtotal !== undefined && typeof line.subtotal !== 'number') {
      throw new Error(
        `validateShape(${kind}): lines[${i}].subtotal must be a number, got ${describe(line.subtotal)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Public validators
// ---------------------------------------------------------------------------

export function validateExternalShape(
  json: unknown,
  kind: SnapshotKind,
): asserts json is Record<string, unknown> {
  if (!isPlainObject(json)) {
    throw new Error(
      `validateExternalShape(${kind}): expected JSON object at root, got ${describe(json)}`,
    );
  }
  const allow = EXTERNAL_ALLOWLISTS[kind];
  if (!allow) {
    throw new Error(`validateExternalShape: no allowlist for kind=${kind}`);
  }
  assertNoBannedWitness(json, '<root>', kind);
  assertKeysSubset(json, allow.topLevel, '<root>', kind);
  assertNestedObject(json.header, allow.header, 'header', kind);
  assertNestedArrayOfObjects(json.lines, allow.line, 'lines', kind);
  assertNestedObject(json.totals, allow.totals, 'totals', kind);
  assertNestedObject(json.footer, allow.footer, 'footer', kind);
  // Value-type checks for load-bearing scalar fields (GH #153)
  if (isPlainObject(json.header)) assertHeaderValueTypes(json.header, 'header', kind);
  if (isPlainObject(json.totals)) assertTotalsValueTypes(json.totals, 'totals', kind);
  if (Array.isArray(json.lines)) assertLinesValueTypes(json.lines as unknown[], kind);
}

export function validateInternalShape(
  json: unknown,
  kind: SnapshotKind,
): asserts json is Record<string, unknown> {
  if (!isPlainObject(json)) {
    throw new Error(
      `validateInternalShape(${kind}): expected JSON object at root, got ${describe(json)}`,
    );
  }
  const allow = INTERNAL_ALLOWLISTS[kind];
  if (!allow) {
    throw new Error(`validateInternalShape: no allowlist for kind=${kind}`);
  }
  assertNoBannedWitness(json, '<root>', kind);
  assertKeysSubset(json, allow.topLevel, '<root>', kind);
  assertNestedObject(json.header, allow.header, 'header', kind);
  assertNestedArrayOfObjects(json.lines, allow.line, 'lines', kind);
  assertNestedObject(json.totals, allow.totals, 'totals', kind);
  assertNestedObject(json.footer, allow.footer, 'footer', kind);
  // cogs / margin / diagnostics
  if (json.cogs !== undefined) {
    assertNestedObject(json.cogs, allow.cogs, 'cogs', kind);
    const cogs = json.cogs as Record<string, unknown>;
    assertNestedArrayOfObjects(cogs.perLine, allow.cogsLine, 'cogs.perLine', kind);
  }
  if (json.margin !== undefined) {
    assertNestedObject(json.margin, allow.margin, 'margin', kind);
    const margin = json.margin as Record<string, unknown>;
    assertNestedArrayOfObjects(
      margin.perLine,
      allow.marginLine,
      'margin.perLine',
      kind,
    );
  }
  if (json.diagnostics !== undefined) {
    assertNestedObject(
      json.diagnostics,
      allow.diagnostics,
      'diagnostics',
      kind,
    );
  }
  // Value-type checks for load-bearing scalar fields (GH #153)
  if (isPlainObject(json.header)) assertHeaderValueTypes(json.header, 'header', kind);
  if (isPlainObject(json.totals)) assertTotalsValueTypes(json.totals, 'totals', kind);
  if (Array.isArray(json.lines)) assertLinesValueTypes(json.lines as unknown[], kind);
}
