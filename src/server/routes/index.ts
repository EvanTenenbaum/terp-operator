import type { Express } from 'express';

/**
 * Register custom Express HTTP routes that are outside the tRPC surface.
 *
 * Used for endpoints that need multipart/binary handling (file uploads)
 * or streaming responses (media serving with HTTP range requests).
 *
 * tRPC remains the primary API surface; this is only for the binary edge.
 */
export function registerHttpRoutes(app: Express): void {
  // Phase 1 will register:
  //   app.use('/api/upload', uploadRouter);   // multipart upload
  //   app.use('/api/media',  mediaRouter);    // authenticated streaming
  //
  // Phase 0 leaves this empty so app.ts can import the function without
  // pulling in route handlers that don't exist yet.
}
