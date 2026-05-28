/**
 * GH #329 — Socket room scoping.
 *
 * Centralises the socket.io connection and exposes:
 *   - All the existing command/pick/sales event handlers (moved from App.tsx)
 *   - subscribeOrder / unsubscribeOrder so views can opt-in to per-order rooms
 *
 * The provider is mounted inside AppContent (desktop shell only).
 * Mobile shell has its own path and does not use this provider.
 */
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '../api/trpc';
import { invalidateAffectedQueries } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface SocketContextValue {
  /** Emit order:subscribe so the server adds this socket to the order room. */
  subscribeOrder: (orderId: string) => void;
  /** Emit order:unsubscribe so the server removes this socket from the order room. */
  unsubscribeOrder: (orderId: string) => void;
}

const SocketContext = createContext<SocketContextValue>({
  subscribeOrder: () => {},
  unsubscribeOrder: () => {},
});

export function useOrderSocket(): SocketContextValue {
  return useContext(SocketContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SocketProvider({ children }: { children: ReactNode }) {
  const me = trpc.auth.me.useQuery();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const isCellEditing = useUiStore((state) => state.isCellEditing);

  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  // GH #409: accumulate affectedIds that arrived while a cell was being edited.
  const pendingPeerIds = useRef<string[]>([]);
  // Prevents repeated "updating" toasts for a single editing session.
  const peerToastShownRef = useRef(false);

  // GH #409: flush deferred peer invalidations the moment the operator finishes editing.
  useEffect(() => {
    if (!isCellEditing && pendingPeerIds.current.length > 0) {
      const ids = pendingPeerIds.current;
      pendingPeerIds.current = [];
      peerToastShownRef.current = false;
      void invalidateAffectedQueries(queryClient, ids);
    }
  }, [isCellEditing, queryClient]);

  useEffect(() => {
    if (!me.data) return;
    const currentUserId = me.data.id;
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? '/', { withCredentials: true });
    socketRef.current = socket;

    // Peer command:completed events are batched into a 2-second debounce window
    // to prevent toast storms during high-tempo workflows. GH #408.
    let peerCompletedQueue: string[] = [];
    let peerCompletedTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPeerCompletedToasts = () => {
      const n = peerCompletedQueue.length;
      if (n === 1) {
        pushToast(peerCompletedQueue[0], 'success');
      } else if (n > 1) {
        pushToast(`${n} team actions completed`, 'success');
      }
      peerCompletedQueue = [];
      peerCompletedTimer = null;
    };

    // command:completed — server now emits only to 'authenticated' room (GH #329).
    socket.on('command:completed', (event: { toast?: string; actorId?: string; affectedIds?: string[] }) => {
      const ids = event.affectedIds ?? [];
      // GH #409: defer invalidation while a cell is being edited.
      if (useUiStore.getState().isCellEditing) {
        pendingPeerIds.current = [...pendingPeerIds.current, ...ids];
        if (!peerToastShownRef.current) {
          pushToast('Inventory updated by another user — will refresh when you finish editing', 'info');
          peerToastShownRef.current = true;
        }
      } else {
        void invalidateAffectedQueries(queryClient, ids);
      }
      // GH #408: debounce peer completion toasts.
      if (event.toast && event.actorId !== currentUserId) {
        peerCompletedQueue.push(event.toast);
        if (peerCompletedTimer) clearTimeout(peerCompletedTimer);
        peerCompletedTimer = setTimeout(flushPeerCompletedToasts, 2000);
      }
    });

    // command:failed — server now emits only to 'authenticated' room (GH #329).
    socket.on('command:failed', (event: { toast?: string; actorId?: string; affectedIds?: string[] }) => {
      if (event.toast && event.actorId !== currentUserId) pushToast(event.toast, 'error');
      void invalidateAffectedQueries(queryClient, event.affectedIds ?? []);
    });

    // pick:queue — server emits to 'authenticated' room (GH #329).
    socket.on('pick:queue', () => {
      void queryClient.invalidateQueries({
        predicate: (query) => JSON.stringify(query.queryKey).includes('pickQueue'),
      });
    });

    // pick:order:{orderId} — server emits to 'order:{orderId}' room (GH #329).
    // sales:order:{orderId}:line:changed — server emits to 'order:{orderId}' room.
    // Clients receive these only for orders they have explicitly subscribed to via
    // subscribeOrder() below.
    socket.onAny((event: string) => {
      if (event.startsWith('pick:order:')) {
        const orderId = event.slice('pick:order:'.length);
        if (orderId) void invalidateAffectedQueries(queryClient, [orderId]);
      }
      if (event.startsWith('sales:order:') && event.endsWith(':line:changed')) {
        const parts = event.split(':'); // ['sales', 'order', orderId, 'line', 'changed']
        const orderId = parts[2];
        if (orderId) {
          void invalidateAffectedQueries(queryClient, [orderId]);
          void queryClient.invalidateQueries({
            predicate: (q) => {
              try {
                return JSON.stringify(q.queryKey).includes('pickQueue');
              } catch {
                return false;
              }
            },
          });
        }
      }
    });

    return () => {
      if (peerCompletedTimer) clearTimeout(peerCompletedTimer);
      socket.close();
      socketRef.current = null;
    };
  }, [me.data, pushToast, queryClient]);

  // Stable callbacks — socketRef is stable, so no dependency needed.
  const subscribeOrder = useCallback((orderId: string) => {
    if (orderId) socketRef.current?.emit('order:subscribe', { orderId });
  }, []);

  const unsubscribeOrder = useCallback((orderId: string) => {
    if (orderId) socketRef.current?.emit('order:unsubscribe', { orderId });
  }, []);

  return (
    <SocketContext.Provider value={{ subscribeOrder, unsubscribeOrder }}>
      {children}
    </SocketContext.Provider>
  );
}
