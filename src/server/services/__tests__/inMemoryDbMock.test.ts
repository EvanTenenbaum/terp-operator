import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState,
} from './inMemoryDbMock';
import { documentSnapshots } from '../../schema';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const SNAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_TYPE = 'purchase_order';
const SUBJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('inMemoryDbMock', () => {
  let state: InMemoryState;
  let tx: ReturnType<typeof makeMockedDb>['tx'];

  beforeEach(() => {
    state = createInMemoryState();
    ({ tx } = makeMockedDb(state));
  });

  it('select with eq+eq where finds matching row', async () => {
    state.documentSnapshots.push({
      id: SNAP_ID,
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 1,
      status: 'draft',
    });
    const rows = await tx
      .select()
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.documentType, DOC_TYPE),
          eq(documentSnapshots.subjectId, SUBJECT_ID),
        ),
      )
      .for('update')
      .limit(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(SNAP_ID);
  });

  it('select with eq+eq where does not return non-matching rows', async () => {
    state.documentSnapshots.push({
      id: SNAP_ID,
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 1,
      status: 'draft',
    });
    state.documentSnapshots.push({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      documentType: 'sales_order',
      subjectId: SUBJECT_ID,
      version: 1,
      status: 'draft',
    });
    const rows = await tx
      .select()
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.documentType, DOC_TYPE),
          eq(documentSnapshots.subjectId, SUBJECT_ID),
        ),
      )
      .for('update')
      .limit(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(SNAP_ID);
  });

  it('insert returning appends to state', async () => {
    const newRow = {
      id: SNAP_ID,
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 1,
      status: 'finalized',
      internalPayload: {},
      externalPayload: {},
      projectionVersion: 1,
      generatedByCommandId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await tx
      .insert(documentSnapshots)
      .values(newRow)
      .returning();
    expect(result).toHaveLength(1);
    expect(state.documentSnapshots).toHaveLength(1);
  });

  it('update set where mutates matching row', async () => {
    state.documentSnapshots.push({
      id: SNAP_ID,
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 1,
      status: 'draft',
    });
    await tx
      .update(documentSnapshots)
      .set({ status: 'finalized' })
      .where(eq(documentSnapshots.id, SNAP_ID));
    expect(state.documentSnapshots[0]!.status).toBe('finalized');
  });

  it('update does not mutate non-matching rows', async () => {
    const OTHER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    state.documentSnapshots.push({
      id: SNAP_ID,
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 1,
      status: 'draft',
    });
    state.documentSnapshots.push({
      id: OTHER_ID,
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 2,
      status: 'draft',
    });
    await tx
      .update(documentSnapshots)
      .set({ status: 'finalized' })
      .where(eq(documentSnapshots.id, SNAP_ID));
    expect(state.documentSnapshots[0]!.status).toBe('finalized');
    expect(state.documentSnapshots[1]!.status).toBe('draft');
  });

  it('execute records advisory lock key', async () => {
    const key = `document_snapshot:purchase_order:${SUBJECT_ID}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
    expect(state.advisoryLocks).toContain(`purchase_order:${SUBJECT_ID}`);
  });

  it('resetInMemoryState clears all arrays', () => {
    state.documentSnapshots.push({ id: SNAP_ID });
    state.advisoryLocks.push('x');
    resetInMemoryState(state);
    expect(state.documentSnapshots).toHaveLength(0);
    expect(state.advisoryLocks).toHaveLength(0);
  });

  it('db.transaction runs fn with tx and returns result', async () => {
    const { db } = makeMockedDb(state);
    state.documentSnapshots.push({
      id: SNAP_ID,
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 1,
      status: 'draft',
    });
    const result = await db.transaction(async (innerTx) => {
      const rows = await innerTx
        .select()
        .from(documentSnapshots)
        .where(eq(documentSnapshots.id, SNAP_ID))
        .for('update')
        .limit(1);
      return rows[0];
    });
    expect((result as Record<string, unknown>)?.id).toBe(SNAP_ID);
  });

  it('select with orderBy and limit returns correct rows', async () => {
    state.documentSnapshots.push({
      id: SNAP_ID,
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 2,
      status: 'finalized',
    });
    state.documentSnapshots.push({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      documentType: DOC_TYPE,
      subjectId: SUBJECT_ID,
      version: 1,
      status: 'finalized',
    });
    const rows = await tx
      .select()
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.documentType, DOC_TYPE),
          eq(documentSnapshots.subjectId, SUBJECT_ID),
        ),
      )
      .orderBy(desc(documentSnapshots.version))
      .limit(1);
    // Both rows match; limit(1) returns first
    expect(rows).toHaveLength(1);
  });

  it('createInMemoryState produces independent state instances', () => {
    const s1 = createInMemoryState();
    const s2 = createInMemoryState();
    s1.documentSnapshots.push({ id: 'x' });
    expect(s2.documentSnapshots).toHaveLength(0);
  });
});
