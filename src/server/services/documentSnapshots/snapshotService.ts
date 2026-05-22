import { and, desc, eq, sql } from 'drizzle-orm';
import {
  documentSnapshots,
  purchaseOrderLines,
  purchaseOrders,
  vendors,
  type DocumentSnapshot
} from '../../schema';
import { buildPurchaseOrderInternalPayload } from './poInternalBuilder';
import { getProjectionFor } from './index';

type Tx = any;

const DOCUMENT_TYPE_PO = 'purchase_order' as const;

async function lockSubject(tx: Tx, documentType: string, subjectId: string): Promise<void> {
  const key = `document_snapshot:${documentType}:${subjectId}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

async function selectActiveSnapshotFor(
  tx: Tx,
  documentType: string,
  subjectId: string
): Promise<DocumentSnapshot | null> {
  const rows = await tx
    .select()
    .from(documentSnapshots)
    .where(
      and(
        eq(documentSnapshots.documentType, documentType),
        eq(documentSnapshots.subjectId, subjectId),
        sql`${documentSnapshots.status} in ('draft','finalized')`
      )
    )
    .for('update')
    .limit(1);
  // Defensive: filter by active status in case the underlying predicate parser
  // (e.g. in-memory mock) does not understand the raw `IN` SQL fragment.
  const active = (rows as DocumentSnapshot[]).find(
    (r) => r.status === 'draft' || r.status === 'finalized'
  );
  return active ?? null;
}

async function selectMaxVersionFor(
  tx: Tx,
  documentType: string,
  subjectId: string
): Promise<number> {
  const rows = await tx
    .select({ version: documentSnapshots.version })
    .from(documentSnapshots)
    .where(
      and(
        eq(documentSnapshots.documentType, documentType),
        eq(documentSnapshots.subjectId, subjectId)
      )
    )
    .orderBy(desc(documentSnapshots.version))
    .limit(1);
  // Defensive: compute max in case the mock does not honour orderBy.
  let max = 0;
  for (const r of rows as Array<{ version?: number }>) {
    if (typeof r.version === 'number' && r.version > max) max = r.version;
  }
  return max;
}

async function loadPurchaseOrderBundle(tx: Tx, purchaseOrderId: string) {
  const [po] = await tx
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .limit(1);
  if (!po) throw new Error('Purchase order not found.');
  const lines = await tx
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
  const vendor = po.vendorId
    ? (
        await tx
          .select()
          .from(vendors)
          .where(eq(vendors.id, po.vendorId))
          .limit(1)
      )[0] ?? null
    : null;
  return { po, lines, vendor };
}

export async function createFinalizedSnapshotForPurchaseOrder(
  tx: Tx,
  purchaseOrderId: string,
  commandId: string
) {
  await lockSubject(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  const { po, lines, vendor } = await loadPurchaseOrderBundle(tx, purchaseOrderId);
  const projection = getProjectionFor(DOCUMENT_TYPE_PO);
  const internalPayload = buildPurchaseOrderInternalPayload({ purchaseOrder: po, vendor, lines });
  const { payload: externalPayload, projectionVersion } = projection.projectExternal(internalPayload);

  const prior = await selectActiveSnapshotFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  if (prior && prior.status === 'finalized') {
    throw new Error(
      'Purchase order is already finalized; unfinalize before refinalizing.'
    );
  }
  if (prior && prior.status === 'draft') {
    await tx
      .update(documentSnapshots)
      .set({
        status: 'finalized',
        internalPayload,
        externalPayload,
        projectionVersion,
        generatedByCommandId: commandId,
        updatedAt: new Date()
      })
      .where(eq(documentSnapshots.id, prior.id));
    return {
      snapshotId: prior.id as string,
      version: prior.version as number,
      consumedDraftId: prior.id as string
    };
  }
  const nextVersion = (await selectMaxVersionFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId)) + 1;
  const [row] = await tx
    .insert(documentSnapshots)
    .values({
      documentType: DOCUMENT_TYPE_PO,
      subjectId: purchaseOrderId,
      version: nextVersion,
      status: 'finalized',
      internalPayload,
      externalPayload,
      projectionVersion,
      generatedByCommandId: commandId
    })
    .returning();
  return {
    snapshotId: row.id as string,
    version: row.version as number,
    consumedDraftId: null
  };
}

export async function voidActiveSnapshotForPurchaseOrder(
  tx: Tx,
  purchaseOrderId: string,
  _commandId: string
) {
  await lockSubject(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  const active = await selectActiveSnapshotFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  if (!active) return { voidedId: null };
  await tx
    .update(documentSnapshots)
    .set({ status: 'void', updatedAt: new Date() })
    .where(eq(documentSnapshots.id, active.id));
  return { voidedId: active.id as string };
}

export async function saveOrUpdateDraftSnapshotForPurchaseOrder(
  tx: Tx,
  purchaseOrderId: string,
  commandId: string
) {
  await lockSubject(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  const { po, lines, vendor } = await loadPurchaseOrderBundle(tx, purchaseOrderId);
  const projection = getProjectionFor(DOCUMENT_TYPE_PO);
  const internalPayload = buildPurchaseOrderInternalPayload({ purchaseOrder: po, vendor, lines });
  const { payload: externalPayload, projectionVersion } = projection.projectExternal(internalPayload);

  const active = await selectActiveSnapshotFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  if (active && active.status === 'finalized') {
    throw new Error(
      'Cannot save a draft receipt while a finalized snapshot is active for this purchase order.'
    );
  }
  if (active && active.status === 'draft') {
    await tx
      .update(documentSnapshots)
      .set({
        internalPayload,
        externalPayload,
        projectionVersion,
        generatedByCommandId: commandId,
        updatedAt: new Date()
      })
      .where(eq(documentSnapshots.id, active.id));
    return { snapshotId: active.id as string, created: false };
  }
  const nextVersion = (await selectMaxVersionFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId)) + 1;
  const [row] = await tx
    .insert(documentSnapshots)
    .values({
      documentType: DOCUMENT_TYPE_PO,
      subjectId: purchaseOrderId,
      version: nextVersion,
      status: 'draft',
      internalPayload,
      externalPayload,
      projectionVersion,
      generatedByCommandId: commandId
    })
    .returning();
  return { snapshotId: row.id as string, created: true };
}

export async function abandonDraftSnapshotForPurchaseOrder(
  tx: Tx,
  purchaseOrderId: string,
  _commandId: string
) {
  await lockSubject(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  const active = await selectActiveSnapshotFor(tx, DOCUMENT_TYPE_PO, purchaseOrderId);
  if (!active || active.status !== 'draft') return { voidedId: null };
  await tx
    .update(documentSnapshots)
    .set({ status: 'void', updatedAt: new Date() })
    .where(eq(documentSnapshots.id, active.id));
  return { voidedId: active.id as string };
}
