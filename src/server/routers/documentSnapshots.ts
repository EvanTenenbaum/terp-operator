import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { protectedProcedure, router } from '../trpc';
import { documentSnapshots } from '../schema';
import { documentTypeSchema } from '../../shared/documentSnapshots';
import { getProjectionFor } from '../services/documentSnapshots';

const INTERNAL_ROLES = new Set(['owner', 'manager', 'operator']);

function assertTranche1Type(documentType: string) {
  if (documentType !== 'purchase_order') {
    throw new TRPCError({
      code: 'NOT_IMPLEMENTED',
      message: `document_type "${documentType}" is not yet supported in Tranche 1.`
    });
  }
}

async function findActiveSnapshot(documentType: string, subjectId: string) {
  const rows = await db
    .select()
    .from(documentSnapshots)
    .where(
      and(
        eq(documentSnapshots.documentType, documentType),
        eq(documentSnapshots.subjectId, subjectId),
        sql`${documentSnapshots.status} in ('draft','finalized')`
      )
    )
    .orderBy(desc(documentSnapshots.version))
    .limit(1);
  // Defensive: filter by active status in case the underlying predicate parser
  // (e.g. in-memory test mock) does not understand the raw `IN` SQL fragment.
  const active = (rows as Array<{ status: string }>).find(
    (r) => r.status === 'draft' || r.status === 'finalized'
  );
  return active as (typeof rows)[number] | undefined;
}

async function findActiveFinalizedSnapshot(documentType: string, subjectId: string) {
  const rows = await db
    .select()
    .from(documentSnapshots)
    .where(
      and(
        eq(documentSnapshots.documentType, documentType),
        eq(documentSnapshots.subjectId, subjectId),
        eq(documentSnapshots.status, 'finalized')
      )
    )
    .orderBy(desc(documentSnapshots.version))
    .limit(1);
  // Defensive: filter by status in JS as well so the in-memory test mock
  // (which understands eq() but is not guaranteed to evaluate all leaves
  // when chained with .limit()) cannot return a non-finalized row.
  const finalized = (rows as Array<{ status: string }>).find(
    (r) => r.status === 'finalized'
  );
  return finalized as (typeof rows)[number] | undefined;
}

export const documentSnapshotsRouter = router({
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        documentType: z.literal('purchase_order')
      })
    )
    .query(async ({ ctx, input }) => {
      if (!INTERNAL_ROLES.has(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Snapshot detail requires operator access in Tranche 1.'
        });
      }
      const [row] = await db
        .select()
        .from(documentSnapshots)
        .where(eq(documentSnapshots.id, input.id))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found.' });
      }
      if (row.documentType !== input.documentType) {
        // Defence in depth: the row exists but belongs to a different
        // document_type, e.g. caller passed a sales_order id while asking
        // for a purchase_order. Treat as NOT_FOUND so the caller cannot
        // probe ids across types.
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Snapshot not found.' });
      }
      return row;
    }),

  getExternalBySubjectId: protectedProcedure
    .input(
      z.object({
        documentType: documentTypeSchema,
        subjectId: z.string().uuid()
      })
    )
    .query(async ({ input }) => {
      assertTranche1Type(input.documentType);
      const row = await findActiveFinalizedSnapshot(input.documentType, input.subjectId);
      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No finalized snapshot for this subject.'
        });
      }
      // Minimized output: external receipt callers only need version metadata
      // and the safe-to-share payload. Never leak internalPayload, status,
      // createdAt, generatedByCommandId, or id.
      return {
        version: row.version,
        projectionVersion: row.projectionVersion,
        externalPayload: row.externalPayload
      };
    }),

  getInternalBySubjectId: protectedProcedure
    .input(
      z.object({
        documentType: documentTypeSchema,
        subjectId: z.string().uuid()
      })
    )
    .query(async ({ ctx, input }) => {
      assertTranche1Type(input.documentType);
      if (!INTERNAL_ROLES.has(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Internal receipts require operator access.'
        });
      }
      const row = await findActiveSnapshot(input.documentType, input.subjectId);
      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active snapshot for this subject.'
        });
      }
      return row;
    }),

  listVersions: protectedProcedure
    .input(
      z.object({
        documentType: documentTypeSchema,
        subjectId: z.string().uuid()
      })
    )
    .query(async ({ ctx, input }) => {
      assertTranche1Type(input.documentType);
      if (!INTERNAL_ROLES.has(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Version history requires operator access in Tranche 1.'
        });
      }
      // The chain explicitly terminates with `.limit(...)` and we sort in JS.
      // Rationale: the in-memory test mock's terminator only reliably returns
      // a real Promise via `.limit(N)` — awaiting the terminator alone (or
      // after `.orderBy(...)`) relies on its `then` thenable, which is not
      // honoured under vitest's transformer (the property is dropped from
      // the object literal, leaving an iteration-unfriendly object).
      // A large limit acts as effectively-unbounded for version history.
      const rows = await db
        .select({
          id: documentSnapshots.id,
          version: documentSnapshots.version,
          status: documentSnapshots.status,
          createdAt: documentSnapshots.createdAt,
          generatedByCommandId: documentSnapshots.generatedByCommandId
        })
        .from(documentSnapshots)
        .where(
          and(
            eq(documentSnapshots.documentType, input.documentType),
            eq(documentSnapshots.subjectId, input.subjectId)
          )
        )
        .limit(10000);
      const sorted = [...(rows as Array<{ version: number }>)].sort(
        (a, b) => b.version - a.version
      );
      return sorted as typeof rows;
    }),

  getReceiptText: protectedProcedure
    .input(
      z.object({
        documentType: documentTypeSchema,
        subjectId: z.string().uuid(),
        mode: z.enum(['external', 'internal']),
        includeDrafts: z.boolean().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      assertTranche1Type(input.documentType);
      const isInternalRole = INTERNAL_ROLES.has(ctx.user.role);
      // Internal-mode rendering is operator+ only. Draft preview (any mode)
      // is also operator+ only since drafts are unfinalized internal state.
      if (input.mode === 'internal' && !isInternalRole) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Internal receipts require operator access.'
        });
      }
      if (input.includeDrafts && !isInternalRole) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Draft receipts require operator access.'
        });
      }
      const allowDraft = input.includeDrafts === true || input.mode === 'internal';
      const row = allowDraft
        ? await findActiveSnapshot(input.documentType, input.subjectId)
        : await findActiveFinalizedSnapshot(input.documentType, input.subjectId);
      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: allowDraft
            ? 'No active snapshot for this subject.'
            : 'No finalized snapshot for this subject.'
        });
      }
      const projection = getProjectionFor(input.documentType);
      const text =
        input.mode === 'external'
          ? projection.renderPlainTextExternal(row.externalPayload as Record<string, unknown>)
          : projection.renderPlainTextInternal(row.internalPayload as Record<string, unknown>);
      return {
        text,
        version: row.version,
        projectionVersion: row.projectionVersion
      };
    })
});
