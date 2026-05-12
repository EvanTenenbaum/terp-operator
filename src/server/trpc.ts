import { initTRPC, TRPCError } from '@trpc/server';
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

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson
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
