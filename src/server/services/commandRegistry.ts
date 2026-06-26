/**
 * Command Registry — self-registering command definitions.
 *
 * Replaces the 143-case switch in commandBus.ts with a discoverable registry.
 * Each domain module calls defineCommand() at import time. The bus dispatches
 * via Map lookup; the switch is retained as a fallback for unmigrated domains.
 *
 * Contract:
 *   - defineCommand receives { name, input, rbac, reversal?, handler }
 *   - handler receives ONE ctx: { tx, user, commandId, reason }
 *   - Duplicate names throw at registration time (fail fast).
 */

import type { Tx } from '@/server/db';
import type { CommandResult, SessionUser } from '@/shared/types';
import type { z } from 'zod';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommandContext {
  tx: Tx;
  user: SessionUser;
  commandId: string;
  reason?: string;
}

export interface CommandDefinition {
  name: string;
  input: z.ZodTypeAny;
  rbac: { minimumRole: string };
  reversal?: { disposition: string; guidance: string };
  handler: (ctx: CommandContext, payload: unknown) => Promise<CommandResult>;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, CommandDefinition>();

/**
 * Register a command. Must be called at module import time (top-level).
 * Throws if a command with the same name is already registered.
 */
export function defineCommand(def: CommandDefinition): CommandDefinition {
  if (registry.has(def.name)) {
    throw new Error(
      `Command "${def.name}" is already registered. ` +
      `Duplicate defineCommand calls are not allowed.`
    );
  }
  registry.set(def.name, def);
  return def;
}

/**
 * Look up a registered command by name. Returns undefined if not found.
 */
export function getCommand(name: string): CommandDefinition | undefined {
  return registry.get(name);
}

/**
 * All currently registered command names.
 */
export function getRegisteredNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * True if the command is registered (migrated to defineCommand).
 */
export function isRegistered(name: string): boolean {
  return registry.has(name);
}
