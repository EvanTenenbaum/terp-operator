/**
 * Matchmaking domain — command handlers and helpers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.MM.EXTRACT.
 *
 * NOTE: this module intentionally imports helpers and schemas from
 * `@/server/services/commandBus`. commandBus.ts in turn re-imports the exported
 * matchmaking handlers from this module, which creates a circular import. This
 * is safe under ESM because every reference to those imported bindings lives
 * inside a function body — by the time runCommand() invokes a matchmaking
 * handler, commandBus.ts has fully evaluated and the live bindings are
 * resolved (same pattern as P1.PO.EXTRACT, P1.SAL.EXTRACT, P1.PAY.EXTRACT).
 *
 * Future cleanup (P2+): hoist the shared helpers to @/domains/shared/
 * and remove the cycle entirely.
 */

import { and, eq, or, sql } from 'drizzle-orm';

import {
  customerNeeds,
  matchmakingMatches,
  matchmakingSettings,
  vendorSupply,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult } from '../../shared/types';

// Helpers, schemas, and the Payload type are kept in commandBus.ts for this
// phase (see header comment).
import {
  requiredId,
  stringValue,
  tagValue,
  // Types
  type Payload,
} from '@/server/services/commandBus';

// ─── Private helpers ─────────────────────────────────────────────────────────

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(left.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  return right
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => token.length > 2 && leftTokens.has(token));
}

function scoreMatch(need: typeof customerNeeds.$inferSelect, supply: typeof vendorSupply.$inferSelect) {
  let score = 0;
  const reasons: string[] = [];
  if (need.category.toLowerCase() === supply.category.toLowerCase()) {
    score += 35;
    reasons.push('Category match');
  }
  const overlap = tagValue(need.tags).filter((tag) => tagValue(supply.tags).includes(tag));
  if (overlap.length) {
    score += Math.min(24, overlap.length * 8);
    reasons.push(`Tags: ${overlap.join(', ')}`);
  }
  if (tokenOverlap(need.productName, supply.productName)) {
    score += 10;
    reasons.push('Product wording overlaps');
  }
  if (Number(supply.availableQty) >= Number(need.qtyMin)) {
    score += 12;
    reasons.push('Quantity covers minimum');
  }
  if (need.targetPrice != null && supply.askingPrice != null && Number(supply.askingPrice) <= Number(need.targetPrice)) {
    score += 12;
    reasons.push('Ask is within target');
  }
  if (need.neededBy && supply.availableDate && new Date(supply.availableDate).getTime() <= new Date(need.neededBy).getTime()) {
    score += 7;
    reasons.push('Available before needed-by');
  }
  return { score, reasons };
}

function bestSupplyMatchesForNeed(need: typeof customerNeeds.$inferSelect, supplies: Array<typeof vendorSupply.$inferSelect>) {
  const scored = supplies
    .map((supply) => ({ supply, ...scoreMatch(need, supply) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
  const candidates = scored.filter((match) => match.score >= 35);
  return candidates.length ? candidates : scored.slice(0, 1);
}

// ─── Exported matchmaking helpers (used by other domains) ────────────────────

export async function createBestMatches(tx: Tx, need: typeof customerNeeds.$inferSelect, supplies: Array<typeof vendorSupply.$inferSelect>) {
  const chosen = bestSupplyMatchesForNeed(need, supplies);
  if (!chosen.length) return [];
  const existingRows = await tx.select().from(matchmakingMatches).where(eq(matchmakingMatches.customerNeedId, need.id));
  const existingBySupply = new Map<string, typeof matchmakingMatches.$inferSelect>(
    (existingRows as Array<typeof matchmakingMatches.$inferSelect>).map((row) => [row.vendorSupplyId, row])
  );
  const affected: string[] = [];
  for (const match of chosen) {
    const existing = existingBySupply.get(match.supply.id);
    if (existing && existing.status !== 'open') continue;
    if (existing) {
      await tx
        .update(matchmakingMatches)
        .set({ score: Math.min(100, match.score), reasons: match.reasons, status: 'open', updatedAt: new Date() })
        .where(eq(matchmakingMatches.id, existing.id));
      affected.push(existing.id);
    } else {
      const [row] = await tx.insert(matchmakingMatches).values({
        customerNeedId: need.id,
        vendorSupplyId: match.supply.id,
        score: Math.min(100, match.score),
        reasons: match.reasons,
        status: 'open'
      }).returning();
      affected.push(row.id);
    }
  }
  return affected;
}

export async function createBestMatchesForSupply(tx: Tx, supply: typeof vendorSupply.$inferSelect, needs: Array<typeof customerNeeds.$inferSelect>) {
  const chosen = needs
    .map((need) => ({ need, ...scoreMatch(need, supply) }))
    .filter((match) => match.score > 0);
  if (!chosen.length) return [];
  const existingRows = await tx.select().from(matchmakingMatches).where(eq(matchmakingMatches.vendorSupplyId, supply.id));
  const existingByNeed = new Map<string, typeof matchmakingMatches.$inferSelect>(
    (existingRows as Array<typeof matchmakingMatches.$inferSelect>).map((row) => [row.customerNeedId, row])
  );
  const affected: string[] = [];
  for (const match of chosen) {
    const existing = existingByNeed.get(match.need.id);
    if (existing && existing.status !== 'open') continue;
    if (existing) {
      await tx
        .update(matchmakingMatches)
        .set({ score: Math.min(100, match.score), reasons: match.reasons, status: 'open', updatedAt: new Date() })
        .where(eq(matchmakingMatches.id, existing.id));
      affected.push(existing.id);
    } else {
      const [row] = await tx.insert(matchmakingMatches).values({
        customerNeedId: match.need.id,
        vendorSupplyId: supply.id,
        score: Math.min(100, match.score),
        reasons: match.reasons,
        status: 'open'
      }).returning();
      affected.push(row.id);
    }
  }
  return affected;
}

export async function rebuildMatchesForNeed(tx: Tx, needId: string) {
  const [need] = await tx.select().from(customerNeeds).where(eq(customerNeeds.id, needId)).limit(1);
  if (!need) throw new Error('Customer need not found.');
  await tx.delete(matchmakingMatches).where(and(eq(matchmakingMatches.customerNeedId, needId), eq(matchmakingMatches.status, 'open')));
  if (need.status !== 'open') return [];
  const supplies = await tx.select().from(vendorSupply).where(eq(vendorSupply.status, 'open'));
  return createBestMatches(tx, need, supplies);
}

export async function rebuildMatchesForSupply(tx: Tx, supplyId: string) {
  const [supply] = await tx.select().from(vendorSupply).where(eq(vendorSupply.id, supplyId)).limit(1);
  if (!supply) throw new Error('Vendor stock row not found.');
  await tx.delete(matchmakingMatches).where(and(eq(matchmakingMatches.vendorSupplyId, supplyId), eq(matchmakingMatches.status, 'open')));
  if (supply.status !== 'open') return [];
  const needs = await tx.select().from(customerNeeds).where(eq(customerNeeds.status, 'open'));
  return createBestMatchesForSupply(tx, supply, needs);
}

// ─── Matchmaking command handlers ────────────────────────────────────────────

export async function updateMatchmakingSettings(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const floor = payload.matchQualityFloor != null ? Number(payload.matchQualityFloor) : undefined;
  const threshold = payload.workQueueThreshold != null ? Number(payload.workQueueThreshold) : undefined;

  const [current] = await tx.select().from(matchmakingSettings).limit(1);
  const effectiveFloor = floor ?? current?.matchQualityFloor ?? 35;
  const effectiveThreshold = threshold ?? current?.workQueueThreshold ?? 75;

  if (effectiveThreshold < effectiveFloor) {
    throw new Error('Work queue threshold must be ≥ match quality floor.');
  }

  const values: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId };
  if (floor != null) values.matchQualityFloor = floor;
  if (threshold != null) values.workQueueThreshold = threshold;
  if (payload.historyLookbackDays != null) values.historyLookbackDays = Number(payload.historyLookbackDays);
  if (payload.repeatThreshold != null) values.repeatThreshold = Number(payload.repeatThreshold);
  if (payload.gapFloorQty != null) values.gapFloorQty = Number(payload.gapFloorQty);
  if (payload.showClientsColumn != null) values.showClientsColumn = Boolean(payload.showClientsColumn);
  if (payload.showVendorsColumn != null) values.showVendorsColumn = Boolean(payload.showVendorsColumn);
  if (payload.workQueueEnabled != null) values.workQueueEnabled = Boolean(payload.workQueueEnabled);

  if (current) {
    await tx.update(matchmakingSettings).set(values).where(eq(matchmakingSettings.id, current.id));
  } else {
    await tx.insert(matchmakingSettings).values({ ...values } as typeof matchmakingSettings.$inferInsert);
  }

  return { ok: true, commandId, affectedIds: [], toast: 'Matchmaking settings updated.' };
}

export async function noteMatchmakingOutreach(
  tx: Tx,
  payload: Payload,
  _userId: string,
  commandId: string
): Promise<CommandResult> {
  const entityType = String(payload.entityType ?? '');
  const entityId = requiredId(payload.entityId, 'entityId');
  const context = String(payload.context ?? '');
  const leg = Number(payload.leg ?? 0);

  if (!['customer', 'vendor'].includes(entityType)) {
    throw new Error('entityType must be customer or vendor');
  }
  if (![2, 3].includes(leg)) {
    throw new Error('leg must be 2 or 3');
  }
  if (!context) {
    throw new Error('context (category slug or batch id) is required');
  }

  return {
    ok: true,
    commandId,
    affectedIds: [entityId],
    toast: `Outreach noted. This suggestion will be hidden for 30 days.`,
  };
}

export async function dismissMatchmakingWorkQueueItem(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const itemType = String(payload.itemType ?? '');
  const itemId = String(payload.itemId ?? '');

  if (!['match', 'opportunity'].includes(itemType)) {
    throw new Error('itemType must be match or opportunity');
  }

  if (itemType === 'opportunity' && payload.entityType && payload.entityId && payload.context) {
    // Re-route to noteMatchmakingOutreach logic for opportunity items.
    // IMPORTANT: the command journal entry is written by the command bus with
    // command_name = 'dismissMatchmakingWorkQueueItem'. The Leg 2/3 snooze queries
    // in matchmakingOpportunities check BOTH command names, so this is safe.
    return noteMatchmakingOutreach(tx, {
      entityType: payload.entityType,
      entityId: payload.entityId,
      context: payload.context,
      leg: payload.leg,
    }, userId, commandId);
  }

  return {
    ok: true,
    commandId,
    affectedIds: itemId ? [itemId] : [],
    toast: 'Removed from work queue for 30 days.',
  };
}

export async function reopenMatchmakingMatch(tx: Tx, payload: Payload, userId: string, commandId: string): Promise<CommandResult> {
  const matchId = requiredId(payload.matchId ?? payload.id, 'matchId');
  const [match] = await tx.select().from(matchmakingMatches).where(eq(matchmakingMatches.id, matchId)).limit(1);
  if (!match) throw new Error('Match not found.');
  if (match.status === 'open') {
    throw new Error(`Match ${matchId} is already open; nothing to reopen.`);
  }
  await tx.update(matchmakingMatches).set({ status: 'open', reviewedBy: userId, updatedAt: new Date() }).where(eq(matchmakingMatches.id, matchId));

  // Revert need to open if no other accepted match exists for this need
  const [otherAcceptedForNeed] = await tx
    .select({ id: matchmakingMatches.id })
    .from(matchmakingMatches)
    .where(
      and(
        eq(matchmakingMatches.customerNeedId, match.customerNeedId),
        eq(matchmakingMatches.status, 'accepted'),
        sql`${matchmakingMatches.id} <> ${matchId}`
      )
    )
    .limit(1);
  if (!otherAcceptedForNeed) {
    await tx.update(customerNeeds)
      .set({ status: 'open', updatedAt: new Date() })
      .where(eq(customerNeeds.id, match.customerNeedId));
  }

  // Revert supply to open if no other accepted match exists for this supply
  const [otherAcceptedForSupply] = await tx
    .select({ id: matchmakingMatches.id })
    .from(matchmakingMatches)
    .where(
      and(
        eq(matchmakingMatches.vendorSupplyId, match.vendorSupplyId),
        eq(matchmakingMatches.status, 'accepted'),
        sql`${matchmakingMatches.id} <> ${matchId}`
      )
    )
    .limit(1);
  if (!otherAcceptedForSupply) {
    await tx.update(vendorSupply)
      .set({ status: 'open', updatedAt: new Date() })
      .where(eq(vendorSupply.id, match.vendorSupplyId));
  }

  return { ok: true, commandId, affectedIds: [matchId, match.customerNeedId, match.vendorSupplyId], toast: 'Match reopened.' };
}

export async function reviewMatchmakingMatch(tx: Tx, payload: Payload, status: 'accepted' | 'dismissed', userId: string, commandId: string): Promise<CommandResult> {
  const matchId = requiredId(payload.matchId ?? payload.id, 'matchId');
  const [match] = await tx.select().from(matchmakingMatches).where(eq(matchmakingMatches.id, matchId)).limit(1);
  if (!match) throw new Error('Match not found.');
  if (match.status !== 'open') {
    throw new Error(`Match ${matchId} is already ${match.status} — use reopenMatchmakingMatch first to change its status.`);
  }
  await tx.update(matchmakingMatches).set({ status, reviewedBy: userId, updatedAt: new Date() }).where(eq(matchmakingMatches.id, matchId));
  const affected = new Set([matchId, match.customerNeedId, match.vendorSupplyId]);
  if (status === 'accepted') {
    const siblingMatches = await tx
      .update(matchmakingMatches)
      .set({ status: 'dismissed', reviewedBy: userId, updatedAt: new Date() })
      .where(
        and(
          eq(matchmakingMatches.status, 'open'),
          or(eq(matchmakingMatches.customerNeedId, match.customerNeedId), eq(matchmakingMatches.vendorSupplyId, match.vendorSupplyId)),
          sql`${matchmakingMatches.id} <> ${matchId}`
        )
      )
      .returning({ id: matchmakingMatches.id });
    for (const row of siblingMatches) affected.add(row.id);
    await tx.update(customerNeeds).set({ status: 'matched', updatedAt: new Date() }).where(eq(customerNeeds.id, match.customerNeedId));
    await tx.update(vendorSupply).set({ status: 'held_for_match', updatedAt: new Date() }).where(eq(vendorSupply.id, match.vendorSupplyId));
  }
  return { ok: true, commandId, affectedIds: [...affected], toast: status === 'accepted' ? 'Match accepted. Use existing PO, intake, and sales workspaces for consequences.' : 'Match dismissed.' };
}
