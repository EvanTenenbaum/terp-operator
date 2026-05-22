import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env, isProd } from './env';
import { sessionMiddleware, getSessionUser } from './auth';

let _io: Server | null = null;

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: isProd
      ? undefined
      : {
          origin: env.APP_ORIGIN,
          credentials: true
        }
  });

  // Wrap session middleware for Socket.io
  io.use((socket, next) => {
    const req = socket.request as any;
    const res = {} as any; // Socket.io doesn't provide a response object
    sessionMiddleware(req, res, async (err?: any) => {
      if (err) return next(err);

      // Check if user is authenticated
      try {
        const user = await getSessionUser(req);
        if (!user) {
          return next(new Error('Authentication required'));
        }
        // Store user info on socket for later use
        socket.data.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  });

  _io = io;
  return io;
}

/**
 * CAP-030 / TER-1518 — Emit a pick-queue or pick-order event to subscribed clients.
 *
 * Called from commandBus after mutations that affect pick state. Safe to call even
 * if the socket server hasn't been initialized (e.g., in unit tests) — it no-ops.
 *
 * Clients that don't receive a socket event still reconcile via react-query's
 * staleness interval (30s for pickQueue, 10s for pickListWithLines).
 */
export function emitPickEvent(
  event: 'pick:queue' | `pick:order:${string}`,
  payload: Record<string, unknown>
): void {
  if (!_io) return;
  _io.emit(event, payload);
}

/**
 * CAP-030 / TER-1518 — Helper to emit both pick:queue and pick:order:{orderId}
 * for commands that affect a specific order's pick list.
 */
export function emitPickOrderAndQueue(orderId: string, payload: Record<string, unknown>): void {
  emitPickEvent('pick:queue', payload);
  emitPickEvent(`pick:order:${orderId}`, payload);
}
