# Photography Module Phase 0 Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the foundation (file-upload deps, Express route scaffolding, auth integration, file-storage utility, migration plan) so Phase 1 of the Photography Module can implement true file upload to replace the current URL-attach placeholder.

**Architecture:** The current photography flow is URL-only (a tRPC command stores a URL string in `batches.photoUrl`). Phase 0 keeps that working untouched. It adds parallel scaffolding for true file upload: a dedicated Express route subtree at `/api/upload/*` and `/api/media/*` for binary streams, registered alongside the existing tRPC mount in `src/server/app.ts`. Auth uses the existing `getSessionUser` from `src/server/auth.ts` and `canRole` from `src/server/rbac.ts` — no new auth layer. Metadata operations (after the binary lands) stay in tRPC commands in Phase 1+.

**Tech Stack:** TypeScript, Node 18+, Express, tRPC, Drizzle (PostgreSQL), vitest, multer (new), sharp (new, with libheif for HEIC), file-type (new), express-rate-limit (new for HTTP rate limiting; the existing `src/server/rateLimiter.ts` is in-memory login-only and stays as-is).

---

## Why this rework (vs the 2026-05-17 plan)

The 2026-05-17 Phase 0 plan (`docs/superpowers/plans/2026-05-17-photography-module-phase-0-fixes.md`) was written against assumed codebase structure that does not match current state. Verified mismatches:

| 2026-05-17 plan assumed | Current codebase reality |
|---|---|
| `src/server/auth/session.ts` exports `getSessionUser` | `src/server/auth.ts` (flat file) exports `getSessionUser` |
| `src/server/auth/roles.ts` exports `canRole` | `src/server/rbac.ts` exports `canRole`, `assertRole`, `assertCommandAccess` |
| ViewSchema has 4 values: `'all','active','archived','processors'` | ViewSchema in `src/server/routers/queries.ts:11` has 16 values including `inventory`, `orders`, `sales`, etc. No `'all'`, no `'processors'` only; not the values claimed |
| Migrations at 0015; new ones at 0016-0018 | Latest is 0032; new ones must start at 0033 |
| `src/server/middleware/` exists or convention is established | Folder does not exist; no Express middleware lives outside `src/server/auth.ts` and `src/server/app.ts` itself |
| `src/server/routes/` exists or convention is established | Folder does not exist; custom Express routes (`/api/health`, `/api/client-config`) are inlined in `src/server/app.ts` |
| There are live security vulnerabilities in placeholder upload/media routes | **No upload/media routes exist**; existing photography is URL-string via tRPC `attachBatchPhoto` command |
| Tests live in `tests/unit/` | Tests live in `src/tests/` and `src/server/services/*.test.ts` (colocated). Vitest config excludes `tests/e2e/**` only |

This plan corrects all of the above and removes the false "security fix" framing.

---

## Task 0.1: Install file-upload dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto-updated)
- Create: `README-PHOTOGRAPHY.md` (deployment notes)

- [ ] **Step 1: Install Node packages**

```bash
pnpm add multer sharp file-type express-rate-limit
pnpm add -D @types/multer
```

- [ ] **Step 2: Install system dependency for HEIC support**

macOS (developer machines):
```bash
brew install libheif
```

Ubuntu/Debian (production / Docker):
```bash
apt-get install -y libheif-dev libvips-dev
```

- [ ] **Step 3: Verify sharp can read HEIC**

```bash
node -e "const sharp = require('sharp'); console.log('HEIC support:', sharp.format.heif ? 'YES' : 'NO')"
```

Expected output: `HEIC support: YES`

If it prints `NO`, sharp was installed before libheif. Rebuild:
```bash
pnpm rebuild sharp
```

- [ ] **Step 4: Create deployment notes file**

Create `README-PHOTOGRAPHY.md`:
```markdown
# Photography Module Deployment

## System Dependencies

### macOS (developer machines)
brew install libheif

### Ubuntu/Debian (production / Docker)
apt-get install -y libheif-dev libvips-dev

If sharp is already installed, rebuild it after libheif:
pnpm rebuild sharp

## Node Dependencies
pnpm add multer sharp file-type express-rate-limit
pnpm add -D @types/multer

## Verification
node -e "const sharp = require('sharp'); console.log('HEIC:', sharp.format.heif ? 'OK' : 'MISSING')"

## Dockerfile changes
Add libheif and libvips to the apt-get line in Dockerfile.
```

- [ ] **Step 5: Verify TypeScript still compiles**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml README-PHOTOGRAPHY.md
git commit -m "feat(photography): install multer, sharp, file-type, express-rate-limit"
```

---

## Task 0.2: Create requireOperator Express middleware

**Files:**
- Create: `src/server/middleware/requireOperator.ts`
- Create: `src/tests/requireOperator.test.ts`

**Note:** This task creates the `src/server/middleware/` folder — a new convention. Justification: file-upload routes are HTTP-binary (multipart), which is outside tRPC's preferred surface, so they live in Express. A dedicated middleware folder keeps the Express-only auth helper findable.

- [ ] **Step 1: Write failing test**

Create `src/tests/requireOperator.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireOperator } from '../server/middleware/requireOperator';

vi.mock('../server/auth', () => ({
  getSessionUser: vi.fn()
}));

import { getSessionUser } from '../server/auth';

describe('requireOperator middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
    vi.mocked(getSessionUser).mockReset();
  });

  it('returns 401 when there is no session user', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    await requireOperator(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is below operator role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u1', name: 'Viewer', email: 'v@example.com', role: 'viewer'
    });

    await requireOperator(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Operator access required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the user to req and calls next() for an operator', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u2', name: 'Op', email: 'op@example.com', role: 'operator'
    });

    await requireOperator(req as Request, res as Response, next);

    expect((req as any).user).toEqual({
      id: 'u2', name: 'Op', email: 'op@example.com', role: 'operator'
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() for roles above operator (manager, owner)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u3', name: 'Mgr', email: 'm@example.com', role: 'manager'
    });

    await requireOperator(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when getSessionUser throws', async () => {
    vi.mocked(getSessionUser).mockRejectedValue(new Error('DB down'));

    await requireOperator(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication check failed' });
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- requireOperator.test.ts
```

Expected: FAIL with "Cannot find module" or similar.

- [ ] **Step 3: Create the middleware folder**

```bash
mkdir -p src/server/middleware
```

- [ ] **Step 4: Write the middleware**

Create `src/server/middleware/requireOperator.ts`:
```typescript
import type { Request, Response, NextFunction } from 'express';
import { getSessionUser } from '../auth';
import { canRole } from '../rbac';
import type { SessionUser } from '../../shared/types';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function requireOperator(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await getSessionUser(req);

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!canRole(user.role, 'operator')) {
      res.status(403).json({ error: 'Operator access required' });
      return;
    }

    req.user = user;
    next();
  } catch (_error) {
    res.status(500).json({ error: 'Authentication check failed' });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- requireOperator.test.ts
```

Expected: PASS, all 5 cases green.

- [ ] **Step 6: Verify TypeScript still compiles**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/middleware/requireOperator.ts src/tests/requireOperator.test.ts
git commit -m "feat(photography): add requireOperator Express middleware"
```

---

## Task 0.3: Create Express routes registration scaffolding

**Files:**
- Create: `src/server/routes/index.ts`
- Modify: `src/server/app.ts` (registration call only — actual route handlers come in Phase 1)

**Note:** This task creates the `src/server/routes/` folder for HTTP routes that aren't tRPC. Currently `app.ts` inlines `/api/health` and `/api/client-config`. This task does not move those — it adds a new mount point alongside them for `/api/upload/*` and `/api/media/*` to land in Phase 1.

- [ ] **Step 1: Create the routes folder**

```bash
mkdir -p src/server/routes
```

- [ ] **Step 2: Create the registration scaffold**

Create `src/server/routes/index.ts`:
```typescript
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
```

- [ ] **Step 3: Wire registration into app.ts**

Open `src/server/app.ts`. After the line `app.use(sessionMiddleware);` (around line 35), and before the `app.get('/api/health', ...)` block, add the import at the top and the call after session middleware:

At the top of the file with the other imports:
```typescript
import { registerHttpRoutes } from './routes';
```

Inside `createApp()` after `app.use(sessionMiddleware);`:
```typescript
  registerHttpRoutes(app);
```

The relevant section should look like:
```typescript
  app.use(express.json({ limit: '4mb' }));
  app.use(sessionMiddleware);
  registerHttpRoutes(app);  // <-- new line

  app.get('/api/health', async (_req, res) => {
    res.json(await getHealth());
  });
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 5: Verify dev server still starts**

```bash
pnpm dev
```

In another terminal:
```bash
curl http://localhost:5173/api/health
```

Expected: existing health JSON response. Photography routes do not exist yet, this only verifies the new registration call did not break the boot path.

Stop the dev server (`Ctrl+C`) before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/index.ts src/server/app.ts
git commit -m "feat(photography): scaffold HTTP route registration for upload/media"
```

---

## Task 0.4: Add 'photography' to the queries viewSchema enum

**Files:**
- Modify: `src/server/routers/queries.ts:11`

**Note:** The 2026-05-17 plan claimed the enum had 4 values. Actual enum has 16. This task adds one more (`'photography'`) for the MediaView Phase 1 will build.

- [ ] **Step 1: Inspect the current enum**

Open `src/server/routers/queries.ts` at line 11. Current:
```typescript
const viewSchema = z.enum(['reports', 'intake', 'purchaseOrders', 'sales', 'matchmaking', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'connectors', 'recovery', 'closeout', 'referees', 'processors']);
```

- [ ] **Step 2: Add 'photography'**

Replace with:
```typescript
const viewSchema = z.enum(['reports', 'intake', 'purchaseOrders', 'sales', 'matchmaking', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'connectors', 'recovery', 'closeout', 'referees', 'processors', 'photography']);
```

- [ ] **Step 3: Search for any ViewKey or related type that lists views**

```bash
grep -rn "ViewKey\|'reports'.*'processors'" src/shared/ src/server/ 2>/dev/null
```

If any union type or record explicitly enumerates the views, add `'photography'` to it. If `grid: ... view: viewSchema` is the only consumer, no further change is needed.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: zero errors. If there is an exhaustive switch on view names elsewhere (e.g. in `gridSql(view)` at line 852 or `deterministicHeaders` at line 1024), the compiler will require a `case 'photography':` branch. Add a minimal stub for now:

```typescript
case 'photography': return /* TODO Phase 1: real photography grid SQL */ '';
```

Search:
```bash
grep -n "case 'inventory'" src/server/routers/queries.ts
```

Mirror the same pattern for the new case and leave it returning an empty string or stub — Phase 1 fills it in.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/queries.ts
git commit -m "feat(photography): add photography to queries viewSchema enum"
```

---

## Task 0.5: Plan migration numbering (no migrations created in Phase 0)

**Files:**
- Modify: `docs/superpowers/plans/2026-05-18-photography-module-phase-0-rework.md` (this file, to record the decision)

**Note:** The 2026-05-17 plan claimed migrations should be 0016-0018. The actual next number is 0033. No migrations are CREATED in Phase 0 — this task only locks in numbering for Phase 1.

- [ ] **Step 1: Confirm current latest migration**

```bash
ls migrations/*.sql | sort | tail -1
```

Expected: `migrations/0032_add_composite_indexes.sql`

- [ ] **Step 2: Record Phase 1 migration numbering decision**

The following numbers are reserved for Phase 1:

| Number | Filename | Purpose |
|---|---|---|
| 0033 | `0033_create_batch_media.sql` | Main `batch_media` table with all indexes and unique constraints |
| 0034 | `0034_create_media_policies.sql` | `media_retention_policies` + `media_cleanup_log` tables |
| 0035 | `0035_create_batch_media_summary_view.sql` | `batch_media_summary` computed view |

Rollback companions will live at:
- `migrations/rollback/0033_drop_batch_media.sql`
- `migrations/rollback/0034_drop_policies.sql`
- `migrations/rollback/0035_drop_view.sql`

- [ ] **Step 3: Add a top-of-file comment to Phase 1 plan**

Open `docs/superpowers/plans/2026-05-17-photography-module.md`. Add at the very top, before any other content:

```markdown
> **MIGRATION RENUMBERING (decided 2026-05-18):** Use 0033/0034/0035 instead of any older 0043/0044/0045 or 0016/0017/0018 references found in this document. The current head migration is 0032.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-17-photography-module.md
git commit -m "docs(photography): record Phase 1 migration numbering (0033-0035)"
```

---

## Task 0.6: Create disk-space check utility

**Files:**
- Create: `src/server/utils/diskSpace.ts`
- Create: `src/tests/diskSpace.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/diskSpace.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  statfs: vi.fn()
}));

import { statfs } from 'node:fs/promises';
import { checkDiskSpace } from '../server/utils/diskSpace';

describe('checkDiskSpace', () => {
  beforeEach(() => {
    vi.mocked(statfs).mockReset();
  });

  it('throws when usage is above 90 percent', async () => {
    vi.mocked(statfs).mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 50 // 5% free → 95% used
    } as any);

    await expect(checkDiskSpace('/storage', 1024))
      .rejects.toThrow(/Disk usage critical/);
  });

  it('throws when available space is less than 1.5x required', async () => {
    vi.mocked(statfs).mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 100 // ~400KB available
    } as any);

    await expect(checkDiskSpace('/storage', 1024 * 1024)) // require 1 MB
      .rejects.toThrow(/Insufficient disk space/);
  });

  it('resolves when there is sufficient headroom', async () => {
    vi.mocked(statfs).mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 500 // 50% free, ~2 MB
    } as any);

    await expect(checkDiskSpace('/storage', 100 * 1024))
      .resolves.toBeUndefined();
  });

  it('does not throw if statfs itself fails (best-effort)', async () => {
    vi.mocked(statfs).mockRejectedValue(new Error('ENOENT'));

    await expect(checkDiskSpace('/no/such/path', 100))
      .resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- diskSpace.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the utility**

Create `src/server/utils/diskSpace.ts`:
```typescript
import { statfs } from 'node:fs/promises';

const USAGE_LIMIT_PERCENT = 90;
const REQUIRED_HEADROOM_MULTIPLIER = 1.5; // require 1.5x the file size for thumbnails/temp

export async function checkDiskSpace(path: string, requiredBytes: number): Promise<void> {
  let stats;
  try {
    stats = await statfs(path);
  } catch {
    return;
  }

  const totalBytes = stats.blocks * stats.bsize;
  const availableBytes = stats.bavail * stats.bsize;
  const usagePercent = totalBytes === 0 ? 100 : 100 - (availableBytes / totalBytes) * 100;

  if (usagePercent > USAGE_LIMIT_PERCENT) {
    throw new Error(
      `Disk usage critical: ${usagePercent.toFixed(1)}%. Free up space before uploading.`
    );
  }

  const requiredWithHeadroom = requiredBytes * REQUIRED_HEADROOM_MULTIPLIER;
  if (availableBytes < requiredWithHeadroom) {
    throw new Error(
      `Insufficient disk space. Required (with headroom): ${(requiredWithHeadroom / 1024 / 1024).toFixed(1)}MB, ` +
      `available: ${(availableBytes / 1024 / 1024).toFixed(1)}MB`
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- diskSpace.test.ts
```

Expected: PASS, all 4 cases green.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/utils/diskSpace.ts src/tests/diskSpace.test.ts
git commit -m "feat(photography): add disk-space pre-flight utility"
```

---

## Task 0.7: Create HTTP rate limiters for upload/media routes

**Files:**
- Create: `src/server/middleware/httpRateLimiters.ts`

**Note:** The existing `src/server/rateLimiter.ts` is in-memory and used only for login attempts. It stays. This task adds express-rate-limit instances for HTTP file-upload routes; they live in `middleware/` to keep route-only concerns separate from the login limiter.

- [ ] **Step 1: Create the file**

Create `src/server/middleware/httpRateLimiters.ts`:
```typescript
import rateLimit from 'express-rate-limit';

/**
 * Upload limiter: 50 successful uploads per 15 minutes per user (or IP if unauthenticated).
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many uploads. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  skipFailedRequests: true
});

/**
 * Media serving limiter: 200 successful requests per minute per user (more lenient than upload).
 */
export const mediaServeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  skipFailedRequests: true
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: zero errors. (If `req.user` type is unknown, the `requireOperator` middleware from Task 0.2 already added the global declaration that fixes this.)

- [ ] **Step 3: Commit**

```bash
git add src/server/middleware/httpRateLimiters.ts
git commit -m "feat(photography): add HTTP rate limiters for upload and media routes"
```

---

## Task 0.8: Plan rollback migrations directory (Phase 0 creates the directory + README only)

**Files:**
- Create: `migrations/rollback/README.md`

**Note:** Phase 0 does NOT create the actual rollback SQL files — those will be created alongside their forward migrations in Phase 1 (0033/0034/0035 ↔ rollback/0033/0034/0035). This task creates the directory and documents the procedure so Phase 1 has a clear pattern to follow.

- [ ] **Step 1: Create the rollback directory**

```bash
mkdir -p migrations/rollback
```

- [ ] **Step 2: Write the rollback README**

Create `migrations/rollback/README.md`:
```markdown
# Migration Rollback Procedures

Each forward migration in `migrations/NNNN_*.sql` may have a paired rollback at `migrations/rollback/NNNN_*.sql`. Rollbacks are NOT run automatically — they are executed manually only when a full feature reversal is required.

## Photography Module rollbacks (Phase 1 will create these)

- `0033_drop_batch_media.sql` — drops `batch_media` and all its indexes (DESTRUCTIVE: deletes all media records)
- `0034_drop_policies.sql` — drops `media_retention_policies` and `media_cleanup_log`
- `0035_drop_view.sql` — drops the `batch_media_summary` view

## Procedure

1. Stop the application.
2. Back up the database and the storage directory:
   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   tar -czf media_$(date +%Y%m%d).tar.gz storage/media/
   ```
3. Run rollbacks in **reverse** order:
   ```bash
   psql $DATABASE_URL -f migrations/rollback/0035_drop_view.sql
   psql $DATABASE_URL -f migrations/rollback/0034_drop_policies.sql
   psql $DATABASE_URL -f migrations/rollback/0033_drop_batch_media.sql
   ```
4. Verify:
   ```bash
   psql $DATABASE_URL -c "\d batch_media"   # should report: relation does not exist
   ```
5. Revert the application code (`git revert <commit>`) and redeploy.

## DO NOT run rollbacks without:
- A current backup
- Operator (Evan) approval
- A documented reason
```

- [ ] **Step 3: Commit**

```bash
git add migrations/rollback/README.md
git commit -m "docs(migrations): add rollback directory and procedure README"
```

---

## Task 0.9: Create file-storage scaffold utility

**Files:**
- Create: `src/server/utils/mediaStorage.ts`
- Create: `src/tests/mediaStorage.test.ts`

**Note:** Phase 0 only scaffolds the path-resolution and UUID-safety helpers. Actual `saveFile`, `deleteFile`, and `generateThumbnails` are implemented in Phase 1 once `batch_media` exists.

- [ ] **Step 1: Write failing test**

Create `src/tests/mediaStorage.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveBatchMediaPath, isSafeUuid } from '../server/utils/mediaStorage';

describe('isSafeUuid', () => {
  it('accepts a canonical lowercase UUID', () => {
    expect(isSafeUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects strings with path-traversal characters', () => {
    expect(isSafeUuid('../../../etc/passwd')).toBe(false);
    expect(isSafeUuid('550e8400-e29b-41d4-a716-446655440000/..')).toBe(false);
    expect(isSafeUuid('550e8400-e29b-41d4-a716-446655440000\\bad')).toBe(false);
  });

  it('rejects empty and obviously wrong input', () => {
    expect(isSafeUuid('')).toBe(false);
    expect(isSafeUuid('not-a-uuid')).toBe(false);
    expect(isSafeUuid('550e8400-e29b-41d4-a716')).toBe(false);
  });
});

describe('resolveBatchMediaPath', () => {
  it('builds a path under the storage root', () => {
    const p = resolveBatchMediaPath('/srv/storage', '550e8400-e29b-41d4-a716-446655440000');
    expect(p.startsWith('/srv/storage/')).toBe(true);
    expect(p.endsWith('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('throws when the batchId is not a safe UUID', () => {
    expect(() => resolveBatchMediaPath('/srv/storage', '../etc'))
      .toThrow(/invalid batchId/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- mediaStorage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the utility**

Create `src/server/utils/mediaStorage.ts`:
```typescript
import path from 'node:path';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isSafeUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function resolveBatchMediaPath(storageRoot: string, batchId: string): string {
  if (!isSafeUuid(batchId)) {
    throw new Error(`invalid batchId: not a canonical UUID`);
  }
  const resolved = path.resolve(storageRoot, batchId);
  const normalizedRoot = path.resolve(storageRoot);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`invalid batchId: resolved path escapes storage root`);
  }
  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- mediaStorage.test.ts
```

Expected: PASS, all 5 cases green.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/utils/mediaStorage.ts src/tests/mediaStorage.test.ts
git commit -m "feat(photography): scaffold mediaStorage utility with UUID-safe paths"
```

---

## Task 0.10: Verification and Phase 1 readiness checklist

**Files:**
- Create: `docs/PHOTOGRAPHY_MODULE.md`

- [ ] **Step 1: Create the module overview doc**

Create `docs/PHOTOGRAPHY_MODULE.md`:
```markdown
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
```

- [ ] **Step 2: Run the full verification suite**

```bash
pnpm typecheck && pnpm test
```

Expected: zero TypeScript errors; all tests pass (existing tests + the new ones from Tasks 0.2, 0.6, 0.9).

- [ ] **Step 3: Verify the dev server still boots**

```bash
pnpm dev
```

In another terminal:
```bash
curl http://localhost:5173/api/health
```

Expected: existing health JSON. Stop the dev server (`Ctrl+C`) before continuing.

- [ ] **Step 4: Commit**

```bash
git add docs/PHOTOGRAPHY_MODULE.md
git commit -m "docs(photography): add module overview with Phase 0/1 status"
```

- [ ] **Step 5: Confirm Phase 0 readiness checklist**

```
- [ ] All deps installed (Task 0.1)
- [ ] requireOperator middleware passes 5 unit tests (Task 0.2)
- [ ] HTTP route registration scaffold wired into app.ts (Task 0.3)
- [ ] 'photography' added to viewSchema enum (Task 0.4)
- [ ] Migration numbering documented for Phase 1 (Task 0.5)
- [ ] diskSpace utility passes 4 unit tests (Task 0.6)
- [ ] HTTP rate limiters file exists and compiles (Task 0.7)
- [ ] Rollback directory + README exists (Task 0.8)
- [ ] mediaStorage utility passes 5 unit tests (Task 0.9)
- [ ] PHOTOGRAPHY_MODULE.md documents what Phase 0 added (Task 0.10)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` green
- [ ] `pnpm dev` boots
```

Once all items are checked, Phase 0 is done. **Do not start Phase 1 until this checklist is complete.**

---

## Estimated time

| Task | Estimate |
|---|---|
| 0.1 Deps + libheif | 45 min (longer if sharp rebuild is needed) |
| 0.2 requireOperator | 90 min (test + impl) |
| 0.3 Routes scaffold | 30 min |
| 0.4 viewSchema enum | 20 min (longer if exhaustive switches need stubs) |
| 0.5 Migration numbering | 10 min |
| 0.6 diskSpace utility | 60 min |
| 0.7 HTTP rate limiters | 20 min |
| 0.8 Rollback README | 15 min |
| 0.9 mediaStorage scaffold | 75 min |
| 0.10 Verification + overview doc | 30 min |

**Total: ~6.5 hours** (slightly tighter than the 2026-05-17 plan's 10-12 hr estimate because this rework removes work that was duplicating existing infrastructure: no auth folder creation, no fresh session.ts, no separate roles.ts).

---

## What this plan deliberately does NOT do

- Does not touch existing `attachBatchPhoto` command or `photographyQueue` table — Phase 1 will decide whether to keep them in parallel or migrate.
- Does not create migrations 0033-0035 — that is Phase 1.
- Does not create upload/media route handlers — that is Phase 1.
- Does not modify `Dockerfile` to install libheif system-side — the README documents what's needed; the Dockerfile change is a deployment task tracked separately.
- Does not change anything about Pricing Rules (#39 / #42) — those are deferred per the prioritization decision.
