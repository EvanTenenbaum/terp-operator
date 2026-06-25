/**
 * Matchmaking domain — Zod schemas.
 *
 * Extracted from helpers in commandBus.ts (P1.MM.EXTRACT).
 * Each schema matches the payload shape of the corresponding command.
 */

import { z } from 'zod';

export const updateMatchmakingSettingsPayloadSchema = z.object({
  matchQualityFloor: z.coerce.number().optional(),
  workQueueThreshold: z.coerce.number().optional(),
}).passthrough();

export const noteMatchmakingOutreachPayloadSchema = z.object({
  matchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  note: z.string().optional(),
}).passthrough();

export const dismissMatchmakingWorkQueueItemPayloadSchema = z.object({
  itemId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const reopenMatchmakingMatchPayloadSchema = z.object({
  matchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const acceptMatchmakingMatchPayloadSchema = z.object({
  matchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const dismissMatchmakingMatchPayloadSchema = z.object({
  matchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();
