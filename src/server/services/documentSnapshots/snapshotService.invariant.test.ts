import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { db } from '../../db';
import { documentSnapshots } from '../../schema';

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

suite('document_snapshots active-row partial unique index', () => {
  it('blocks a second active (draft or finalized) row for the same subject', async () => {
    const subjectId = randomUUID();
    await db.insert(documentSnapshots).values({
      documentType: 'purchase_order', subjectId, version: 1, status: 'finalized',
      internalPayload: {}, externalPayload: {}, projectionVersion: 1
    });
    await expect(db.insert(documentSnapshots).values({
      documentType: 'purchase_order', subjectId, version: 2, status: 'draft',
      internalPayload: {}, externalPayload: {}, projectionVersion: 1
    })).rejects.toMatchObject({ message: expect.stringMatching(/unique|duplicate/i) });
  });
});
