# Photography Module

## Status
Phase 0 (foundation) complete. Phase 1 (DB + upload route + serving route) pending.

## What exists today (after Phase 0)
- Dependencies installed: multer, sharp, file-type, express-rate-limit (+ system libheif)
- `src/server/middleware/requireOperator.ts` — Express auth helper using existing `auth.ts` and `rbac.ts`
- `src/server/middleware/httpRateLimiters.ts` — upload/media HTTP rate limiters
- `src/server/routes/index.ts` — Express HTTP route registration scaffold (empty handlers)
- `src/server/utils/diskSpace.ts` — pre-flight disk-space check
- `src/server/utils/mediaStorage.ts` — UUID-safe path resolver
- `migrations/rollback/README.md` — rollback procedure
- `viewSchema` enum has `'photography'`
- Phase 1 migrations reserved at 0033/0034/0035

## What did NOT change in Phase 0
- The current URL-attach flow still works:
  - `photographyQueue` table (created earlier)
  - `attachBatchPhoto` tRPC command in `commandBus.ts`
  - `PhotographyQueuePanel` React component
- All existing tests still pass

## Phase 1 will add
- Migrations 0033/0034/0035: `batch_media`, `media_retention_policies`, `batch_media_summary`
- Real upload route at `POST /api/upload/media` (Express, multer, requireOperator, uploadRateLimiter)
- Real serving route at `GET /api/media/:id` (Express, requireOperator, mediaServeRateLimiter, streaming with range support)
- tRPC commands: `uploadBatchMedia`, `setBatchMediaRole`, `publishBatchMedia`, `deleteBatchMedia`
- Unit + integration tests
- E2E test for upload flow

## Feature flag
`ENABLE_PHOTOGRAPHY` — when `false`, the upload and media routes register but return 503. Phase 1 wires this; Phase 0 does nothing with it.

## Architecture decision: Express for binary, tRPC for metadata
Binary streams (multipart upload, media serving with range requests) are a poor fit for tRPC. Photography uses a small Express route subtree (`/api/upload/*` and `/api/media/*`) for binary I/O only. All metadata operations (set primary, publish, delete, query) stay in tRPC commands so the auth/authorization patterns stay consistent with the rest of the app.
