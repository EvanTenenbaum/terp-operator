import { initTRPC, TRPCError } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import superjson from 'superjson';
import type { Request, Response } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { getSessionUser } from './auth';

export interface TrpcContext {
  req: Request;
  res: Response;
  io: SocketServer;
  user: Awaited<ReturnType<typeof getSessionUser>>;
}

export async function createContext({
  req,
  res,
  io
}: {
  req: Request;
  res: Response;
  io: SocketServer;
}): Promise<TrpcContext> {
  return {
    req,
    res,
    io,
    user: await getSessionUser(req)
  };
}

/**
 * Heuristic detector for Postgres / Drizzle errors. We deliberately err on
 * the side of "scrub" — anything that *looks* like a SQL fragment is
 * replaced with an opaque "Database error" message tagged with a request id
 * so server-side logs can correlate. TRPCError instances (validation,
 * authorization, business-rule errors) and plain Error instances thrown by
 * application code are passed through unchanged.
 *
 * Fixes #24 / DYN-H1: authenticated callers were able to enumerate table
 * names, column names, and constraint names by deliberately triggering
 * unique-violations and reading the resulting tRPC envelope message.
 */
export function looksLikePostgresError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // node-postgres errors carry a `code` (e.g. '23505' unique_violation),
  // `severity`, and `routine`. Drizzle wraps the same fields.
  const candidate = err as { code?: unknown; severity?: unknown; routine?: unknown; constructor?: { name?: string } };
  if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) return true;
  if (typeof candidate.severity === 'string' && candidate.severity.length > 0) return true;
  if (typeof candidate.routine === 'string' && candidate.routine.length > 0) return true;
  if (candidate.constructor?.name === 'DrizzleError' || candidate.constructor?.name === 'DrizzleQueryError') return true;
  return false;
}

const SQL_LEAK_REGEX = /(insert\s+into|update\s+.+\s+set|select\s+.+\s+from|delete\s+from|on\s+conflict|values\s*\(|duplicate\s+key|unique\s+constraint|"[a-z_]+_idx"|relation\s+"[a-z_]+")/i;

export function messageLooksLikeSql(message: unknown): boolean {
  if (typeof message !== 'string') return false;
  return SQL_LEAK_REGEX.test(message);
}

/**
 * Scrub a thrown error into a client-safe message + opaque request id.
 *
 * Used by the tRPC errorFormatter (for thrown errors) AND by the
 * commandBus catch path (for errors that are returned in CommandResult.toast,
 * which bypass the formatter). Without this, an authenticated caller can
 * still enumerate schema by triggering FK/unique violations from inside a
 * command and reading the leaked SQL via result.toast (#24 H1 follow-up).
 *
 * If the error doesn't look like a Postgres error, returns its message
 * verbatim so application-level errors ("Reason must be at least 3
 * characters.") are preserved.
 */
export function scrubDatabaseError(error: unknown): { safeMessage: string; requestId: string | null } {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Command failed.';
  const isPg = looksLikePostgresError(error) || messageLooksLikeSql(message);
  if (!isPg) return { safeMessage: message, requestId: null };
  const requestId = randomUUID();
  // eslint-disable-next-line no-console
  console.error(`[command-error] request id=${requestId}`, {
    message,
    pgCode: (error as { code?: string } | undefined)?.code,
    stack: error instanceof Error ? error.stack : undefined
  });
  return { safeMessage: `Database error (request id: ${requestId})`, requestId };
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // TRPCError instances are application-level errors (validation,
    // authorization, business rules). Their .cause may be a Postgres error
    // — scrub only that case.
    const cause = error.cause;
    const isPgError = looksLikePostgresError(cause) || messageLooksLikeSql((cause as Error | undefined)?.message);
    const messageLeaksSql = messageLooksLikeSql(shape.message);

    if (isPgError || messageLeaksSql) {
      const requestId = randomUUID();
      // Preserve full details server-side; the client only gets the opaque id.
      // Use console.error so the logs still capture stack + cause for triage.
      // eslint-disable-next-line no-console
      console.error(`[trpc-error] request id=${requestId}`, {
        code: error.code,
        message: error.message,
        causeMessage: (cause as Error | undefined)?.message,
        causeStack: (cause as Error | undefined)?.stack,
        pgCode: (cause as { code?: string } | undefined)?.code
      });
      return {
        ...shape,
        message: `Database error (request id: ${requestId})`,
        data: {
          ...shape.data,
          // Strip cause/stack-like fields if a transport ever surfaces them.
          stack: undefined
        }
      };
    }

    return shape;
  }
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in first.' });
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
