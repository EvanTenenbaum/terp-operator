import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../../server/routers';

export const trpc = createTRPCReact<AppRouter>();

export function trpcClient() {
  return trpc.createClient({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: import.meta.env.VITE_TRPC_URL ?? '/trpc',
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: 'include'
          });
        }
      })
    ]
  });
}
