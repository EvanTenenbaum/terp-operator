import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env, isProd } from './env';
import { sessionMiddleware, getSessionUser } from './auth';
import { ratelimit } from './utils/ratelimit';

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

  // GH #329: Connection handler — join 'authenticated' room and wire up
  // order-specific room subscription protocol.
  io.on('connection', (socket) => {
    // Every successfully-authenticated socket joins the shared 'authenticated'
    // room. Command-bus broadcasts target this room instead of the whole namespace
    // so unauthenticated or mid-handshake sockets cannot receive them.
    socket.join('authenticated');

    // Order-specific room protocol:
    // Clients call socket.emit('order:subscribe', { orderId }) when they open an
    // order view and socket.emit('order:unsubscribe', { orderId }) when they leave.
    // This allows pick:order:* and sales:order:*:line:changed events to be scoped
    // to only the clients that are actively viewing a given order.
    //
    // GH #446: RBAC — only operator-level roles (owner, manager, operator) may
    // subscribe to order rooms. Viewer role is excluded. Rate limiting prevents
    // rapid subscribe/unsubscribe abuse via the shared sliding-window ratelimit.
    socket.on('order:subscribe', async ({ orderId }: { orderId: string }) => {
      if (!orderId) return;

      const user = socket.data.user;
      // Role check: viewers cannot subscribe to order-specific rooms
      if (!user || user.role === 'viewer') {
        return;
      }

      // Rate limiting: prevent rapid subscription abuse
      const { success } = await ratelimit.limit(`order:sub:${user.id}`, { limit: 20, window: '1m' });
      if (!success) {
        console.warn(`[sockets] order:subscribe rate limit exceeded for user ${user.id}`);
        return;
      }

      socket.join(`order:${orderId}`);
    });
    socket.on('order:unsubscribe', async ({ orderId }: { orderId: string }) => {
      if (!orderId) return;

      const user = socket.data.user;
      // Rate limiting: prevent rapid unsubscription abuse
      if (user?.id) {
        const { success } = await ratelimit.limit(`order:unsub:${user.id}`, { limit: 20, window: '1m' });
        if (!success) {
          console.warn(`[sockets] order:unsubscribe rate limit exceeded for user ${user.id}`);
          return;
        }
      }

      socket.leave(`order:${orderId}`);
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
 * pick:queue    → 'authenticated' room   (all operators need queue updates)
 * pick:order:*  → 'order:{orderId}' room (only clients subscribed to that order)
 *
 * Clients that don't receive a socket event still reconcile via react-query's
 * staleness interval (30s for pickQueue, 10s for pickListWithLines).
 */
export function emitPickEvent(
  event: 'pick:queue' | `pick:order:${string}`,
  payload: Record<string, unknown>
): void {
  if (!_io) return;
  if (event === 'pick:queue') {
    // All authenticated operators need to know when the pick queue roster changes.
    _io.to('authenticated').emit(event, payload);
  } else {
    // pick:order:{orderId} — only clients that have subscribed to this order's room.
    const orderId = event.slice('pick:order:'.length);
    _io.to(`order:${orderId}`).emit(event, payload);
  }
}

/**
 * CAP-030 / TER-1518 — Helper to emit both pick:queue and pick:order:{orderId}
 * for commands that affect a specific order's pick list.
 */
export function emitPickOrderAndQueue(orderId: string, payload: Record<string, unknown>): void {
  emitPickEvent('pick:queue', payload);
  emitPickEvent(`pick:order:${orderId}`, payload);
}

/**
 * Real-time sales ↔ pick coordination — emit a sales:order:*:line:changed event.
 * Called from commandBus after mutations that affect a released/picked line.
 * Gracefully no-ops if socket server is not initialized.
 *
 * GH #329: scoped to 'order:{orderId}' room instead of broadcasting to all clients.
 * Clients subscribe via socket.emit('order:subscribe', { orderId }).
 */
export function emitSalesLineEvent(
  orderId: string,
  payload: { kind: string; lineId?: string; at: string }
): void {
  if (!_io) return;
  _io.to(`order:${orderId}`).emit(`sales:order:${orderId}:line:changed`, payload);
}

/**
 * GH #288 — Returns the actual socket server health instead of a hardcoded 'ok'.
 * Returns 'ok' when the Socket.io Server has been initialized (accepts connections),
 * 'degraded' if it has not been set up yet or errored.
 */
export function getSocketHealth(): 'ok' | 'degraded' {
  try {
    return _io != null ? 'ok' : 'degraded';
  } catch {
    return 'degraded';
  }
}
