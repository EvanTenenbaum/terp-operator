# Photography Module - Phase 0: Critical Fixes

**BLOCKING WORK** - Complete all tasks in this phase BEFORE starting Phase 1 of the main implementation plan.

**Reference:**
- Main plan: `docs/superpowers/plans/2026-05-17-photography-module.md`
- Review findings: `docs/superpowers/plans/2026-05-17-photography-module-review-consolidated.md`

**Time Estimate:** 12-16 hours

---

## Task 0.1: Install Dependencies

**Files:**
- Modify: `package.json`
- Create: `README-PHOTOGRAPHY.md` (deployment notes)

- [ ] **Step 1: Install Node packages**

```bash
pnpm add multer sharp file-type express-rate-limit
pnpm add -D @types/multer
```

- [ ] **Step 2: Install system dependencies for HEIC support**

macOS:
```bash
brew install libheif
```

Ubuntu/Debian:
```bash
apt-get install libheif-dev libvips-dev
```

- [ ] **Step 3: Verify sharp HEIC support**

```bash
node -e "const sharp = require('sharp'); console.log('HEIC support:', sharp.format.heif || sharp.format.heic ? 'YES' : 'NO')"
```

Expected output: `HEIC support: YES`

- [ ] **Step 4: Document deployment requirements**

Create `README-PHOTOGRAPHY.md`:
```markdown
# Photography Module Deployment

## System Dependencies

### macOS
brew install libheif

### Ubuntu/Debian
apt-get install libheif-dev libvips-dev

## Node Dependencies
pnpm add multer sharp file-type express-rate-limit
pnpm add -D @types/multer

## Verification
node -e "const sharp = require('sharp'); console.log('HEIC:', sharp.format.heif || sharp.format.heic ? 'OK' : 'MISSING')"
```

---

## Task 0.2: Create Authentication Middleware

**Files:**
- Create: `src/server/middleware/requireOperator.ts`
- Create: `tests/unit/requireOperator.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/requireOperator.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { requireOperator } from '../../src/server/middleware/requireOperator';

describe('requireOperator middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: any;

  beforeEach(() => {
    req = { session: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    next = vi.fn();
  });

  it('should return 401 if user not authenticated', async () => {
    await requireOperator(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if user is not an operator', async () => {
    req.session = { user: { id: '123', role: 'customer' } };
    
    await requireOperator(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Operator access required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach user to request and call next if authenticated operator', async () => {
    req.session = { user: { id: '123', role: 'operator' } };
    
    await requireOperator(req as Request, res as Response, next);
    
    expect(req.user).toEqual({ id: '123', role: 'operator' });
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- requireOperator.test.ts
```

Expected: FAIL - Cannot find module 'requireOperator'

- [ ] **Step 3: Write minimal implementation**

Create `src/server/middleware/requireOperator.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { getSessionUser } from '../auth/session';
import { canRole } from '../auth/roles';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        [key: string]: any;
      };
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
  } catch (error) {
    res.status(500).json({ error: 'Authentication check failed' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- requireOperator.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/middleware/requireOperator.ts tests/unit/requireOperator.test.ts
git commit -m "feat(auth): add requireOperator middleware for route protection"
```

---

## Task 0.3: Create Routes Directory and Registration Pattern

**Files:**
- Create: `src/server/routes/index.ts`
- Modify: `src/server/app.ts`

- [ ] **Step 1: Create routes directory**

```bash
mkdir -p src/server/routes
```

- [ ] **Step 2: Create routes index file**

Create `src/server/routes/index.ts`:
```typescript
import { Express } from 'express';

/**
 * Register all custom Express routes
 * Called by app.ts during server initialization
 */
export function registerRoutes(app: Express): void {
  // Routes will be imported and registered here
  // Example:
  // import { uploadRoute } from './uploadRoute';
  // import { mediaRoute } from './mediaRoute';
  // app.use('/api/upload', uploadRoute);
  // app.use('/api/media', mediaRoute);
  
  console.log('Custom routes registered');
}
```

- [ ] **Step 3: Modify app.ts to register routes**

Find the section in `src/server/app.ts` where middleware is set up, add:

```typescript
import { registerRoutes } from './routes';

// ... existing middleware setup

// Register custom routes
registerRoutes(app);

// ... tRPC setup
```

- [ ] **Step 4: Verify routes registration**

```bash
npm run dev
```

Expected console output: `Custom routes registered`

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/index.ts src/server/app.ts
git commit -m "feat(server): add routes directory and registration pattern"
```

---

## Task 0.4: Fix ViewSchema Location

**Files:**
- Modify: `src/server/routers/queries.ts`

- [ ] **Step 1: Locate viewSchema enum**

Open `src/server/routers/queries.ts` and find the viewSchema definition (around line 11).

Current:
```typescript
const viewSchema = z.enum(['all', 'active', 'archived', 'processors']);
```

- [ ] **Step 2: Add 'photography' to enum**

```typescript
const viewSchema = z.enum(['all', 'active', 'archived', 'processors', 'photography']);
```

- [ ] **Step 3: Update ViewKey type if it exists**

If there's a `ViewKey` type exported from this file, update it to include 'photography'.

If `ViewKey` is in `src/shared/types.ts`, update there as well:
```typescript
export type ViewKey = 'all' | 'active' | 'archived' | 'processors' | 'photography';
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run type-check
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/queries.ts src/shared/types.ts
git commit -m "feat(queries): add photography view to viewSchema enum"
```

---

## Task 0.5: Fix Migration Numbering

**Files:**
- Rename migrations from plan

- [ ] **Step 1: Check last migration number**

```bash
ls migrations/*.sql | tail -1
```

If last is `0015_payment_processors.sql`, next should be `0016`.

- [ ] **Step 2: Plan migration numbers**

When creating migrations in Phase 1, use:
- `0016_create_batch_media.sql` (was 0043)
- `0017_create_media_policies.sql` (was 0044)
- `0018_create_batch_media_view.sql` (was 0045)

**Note:** This is a planning step only. Actual migrations will be created in Phase 1.

- [ ] **Step 3: Document in plan**

Update main implementation plan to use correct migration numbers (0016, 0017, 0018).

---

## Task 0.6: Create Disk Space Check Utility

**Files:**
- Create: `src/server/utils/diskSpace.ts`
- Create: `tests/unit/diskSpace.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/diskSpace.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { checkDiskSpace } from '../../src/server/utils/diskSpace';

describe('checkDiskSpace', () => {
  it('should throw if disk usage >90%', async () => {
    // Mock statfs to return 95% usage
    vi.mock('fs/promises', () => ({
      statfs: vi.fn().mockResolvedValue({
        blocks: 1000,
        bsize: 4096,
        bavail: 50  // 5% available
      })
    }));

    await expect(checkDiskSpace('/storage', 1024))
      .rejects.toThrow('Disk usage critical');
  });

  it('should throw if insufficient space for required bytes', async () => {
    vi.mock('fs/promises', () => ({
      statfs: vi.fn().mockResolvedValue({
        blocks: 1000,
        bsize: 4096,
        bavail: 100  // ~400KB available
      })
    }));

    // Require 1MB (need 1.5x = 1.5MB)
    await expect(checkDiskSpace('/storage', 1024 * 1024))
      .rejects.toThrow('Insufficient disk space');
  });

  it('should pass if sufficient space available', async () => {
    vi.mock('fs/promises', () => ({
      statfs: vi.fn().mockResolvedValue({
        blocks: 1000,
        bsize: 4096,
        bavail: 500  // 50% available, ~2MB
      })
    }));

    await expect(checkDiskSpace('/storage', 100 * 1024))
      .resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- diskSpace.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

Create `src/server/utils/diskSpace.ts`:
```typescript
import { statfs } from 'fs/promises';

/**
 * Check if sufficient disk space is available
 * @param path - Path to check (e.g., storage directory)
 * @param requiredBytes - Required space in bytes
 * @throws Error if disk usage >90% or insufficient space
 */
export async function checkDiskSpace(
  path: string,
  requiredBytes: number
): Promise<void> {
  try {
    const stats = await statfs(path);
    const totalBytes = stats.blocks * stats.bsize;
    const availableBytes = stats.bavail * stats.bsize;
    const usagePercent = 100 - (availableBytes / totalBytes * 100);
    
    if (usagePercent > 90) {
      throw new Error(
        `Disk usage critical: ${usagePercent.toFixed(1)}%. ` +
        `Please free up space or contact support.`
      );
    }
    
    // Require 1.5x space (for thumbnails, temp files)
    const requiredWithBuffer = requiredBytes * 1.5;
    if (availableBytes < requiredWithBuffer) {
      throw new Error(
        `Insufficient disk space. ` +
        `Required: ${(requiredWithBuffer / 1024 / 1024).toFixed(1)}MB, ` +
        `Available: ${(availableBytes / 1024 / 1024).toFixed(1)}MB`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Disk')) {
      throw error;
    }
    // If statfs fails (e.g., path doesn't exist), let upload proceed
    console.warn('Could not check disk space:', error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- diskSpace.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/utils/diskSpace.ts tests/unit/diskSpace.test.ts
git commit -m "feat(utils): add disk space check utility"
```

---

## Task 0.7: Create Rate Limiter Configuration

**Files:**
- Create: `src/server/middleware/rateLimiters.ts`

- [ ] **Step 1: Create rate limiter configs**

Create `src/server/middleware/rateLimiters.ts`:
```typescript
import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for file upload endpoints
 * 50 uploads per 15 minutes per user
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: {
    error: 'Too many uploads. Please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key by user ID if authenticated, otherwise IP
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  // Don't count failed requests against limit
  skipFailedRequests: true,
  // Don't count successful responses against limit if status >= 400
  skipSuccessfulRequests: false
});

/**
 * Rate limiter for media serving endpoints
 * 200 downloads per minute per user (more lenient than upload)
 */
export const mediaServeRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: {
    error: 'Too many requests. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  skipFailedRequests: true
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run type-check
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/middleware/rateLimiters.ts
git commit -m "feat(middleware): add rate limiters for upload and media endpoints"
```

---

## Task 0.8: Create Rollback Migrations

**Files:**
- Create: `migrations/rollback/0016_drop_batch_media.sql`
- Create: `migrations/rollback/0017_drop_policies.sql`
- Create: `migrations/rollback/0018_drop_view.sql`

- [ ] **Step 1: Create rollback directory**

```bash
mkdir -p migrations/rollback
```

- [ ] **Step 2: Create rollback for batch_media table**

Create `migrations/rollback/0016_drop_batch_media.sql`:
```sql
-- ROLLBACK: Drop batch_media table and all related objects
-- WARNING: This will DELETE ALL media records
-- Run ONLY if you need to completely remove the photography module

-- Drop indexes first
DROP INDEX IF EXISTS batch_media_primary_video_unique;
DROP INDEX IF EXISTS batch_media_primary_photo_unique;
DROP INDEX IF EXISTS batch_media_batch_status_idx;
DROP INDEX IF EXISTS batch_media_replaced_idx;
DROP INDEX IF EXISTS batch_media_role_idx;
DROP INDEX IF EXISTS batch_media_status_idx;
DROP INDEX IF EXISTS batch_media_batch_idx;

-- Drop table (CASCADE will drop foreign keys)
DROP TABLE IF EXISTS batch_media CASCADE;
```

- [ ] **Step 3: Create rollback for retention policies**

Create `migrations/rollback/0017_drop_policies.sql`:
```sql
-- ROLLBACK: Drop media retention policy tables

DROP TABLE IF EXISTS media_cleanup_log CASCADE;
DROP TABLE IF EXISTS media_retention_policies CASCADE;
```

- [ ] **Step 4: Create rollback for computed view**

Create `migrations/rollback/0018_drop_view.sql`:
```sql
-- ROLLBACK: Drop batch_media_summary computed view

DROP VIEW IF EXISTS batch_media_summary;
```

- [ ] **Step 5: Document rollback procedure**

Create `migrations/rollback/README.md`:
```markdown
# Photography Module Rollback

## DANGER ZONE
Rollback migrations will DELETE ALL media records and files.
ONLY use if you need to completely remove the photography module.

## Backup First
```bash
# Backup database records
psql $DATABASE_URL -c "COPY (SELECT * FROM batch_media) TO '/tmp/batch_media_backup.csv' CSV HEADER;"

# Backup files
tar -czf batch_media_backup_$(date +%Y%m%d).tar.gz storage/media/
mv batch_media_backup_*.tar.gz /path/to/safe/location/
```

## Rollback Order
Run in reverse order:
```bash
psql $DATABASE_URL -f migrations/rollback/0018_drop_view.sql
psql $DATABASE_URL -f migrations/rollback/0017_drop_policies.sql
psql $DATABASE_URL -f migrations/rollback/0016_drop_batch_media.sql
```

## Verify Rollback
```bash
psql $DATABASE_URL -c "\dt batch_media"
# Should return: Did not find any relation named "batch_media"
```

## Restore (if needed)
```bash
# Restore database
psql $DATABASE_URL -c "\COPY batch_media FROM '/tmp/batch_media_backup.csv' CSV HEADER;"

# Restore files
tar -xzf batch_media_backup_20260517.tar.gz -C /
```
```

- [ ] **Step 6: Commit**

```bash
git add migrations/rollback/
git commit -m "feat(migrations): add rollback procedures for photography module"
```

---

## Task 0.9: Create Test Infrastructure

**Files:**
- Create: `tests/helpers/mockFileSystem.ts`
- Create: `tests/helpers/mockDatabase.ts`
- Create: `tests/helpers/testHelpers.ts`

- [ ] **Step 1: Create mock file system**

Create `tests/helpers/mockFileSystem.ts`:
```typescript
/**
 * In-memory mock file system for testing
 * Avoids real disk I/O during tests
 */
export class MockFileSystem {
  private files = new Map<string, Buffer>();
  private directories = new Set<string>();

  writeFileSync(path: string, data: Buffer | string): void {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.files.set(path, buffer);
  }

  readFileSync(path: string): Buffer {
    const file = this.files.get(path);
    if (!file) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return file;
  }

  existsSync(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  unlinkSync(path: string): void {
    if (!this.files.has(path)) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    this.files.delete(path);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    this.directories.add(path);
  }

  readdirSync(path: string): string[] {
    const results: string[] = [];
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(path)) {
        const relative = filePath.substring(path.length + 1);
        const parts = relative.split('/');
        if (parts.length === 1) {
          results.push(parts[0]);
        }
      }
    }
    return results;
  }

  reset(): void {
    this.files.clear();
    this.directories.clear();
  }

  getAllFiles(): string[] {
    return Array.from(this.files.keys());
  }
}

export function createMockFileSystem(): MockFileSystem {
  return new MockFileSystem();
}
```

- [ ] **Step 2: Create mock database**

Create `tests/helpers/mockDatabase.ts`:
```typescript
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Mock database transaction for testing command handlers
 */
export class MockTransaction {
  private queries: Array<{ sql: string; params: any[] }> = [];
  private inTransaction = false;

  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    this.queries.push({ sql, params });
    
    if (sql === 'BEGIN') {
      this.inTransaction = true;
    }
    if (sql === 'COMMIT' || sql === 'ROLLBACK') {
      this.inTransaction = false;
    }

    return { rows: [] };
  }

  isInTransaction(): boolean {
    return this.inTransaction;
  }

  getQueries(): Array<{ sql: string; params: any[] }> {
    return this.queries;
  }

  reset(): void {
    this.queries = [];
    this.inTransaction = false;
  }
}

export function createMockTransaction(): MockTransaction {
  return new MockTransaction();
}
```

- [ ] **Step 3: Create test data helpers**

Create `tests/helpers/testHelpers.ts`:
```typescript
import { randomUUID } from 'crypto';

/**
 * Generate test batch data
 */
export function createTestBatch(overrides = {}) {
  return {
    id: randomUUID(),
    batch_code: `TEST-${Math.floor(Math.random() * 1000)}`,
    name: 'Test Product',
    active: true,
    created_at: new Date(),
    ...overrides
  };
}

/**
 * Generate test media data
 */
export function createTestMedia(batchId: string, overrides = {}) {
  return {
    id: randomUUID(),
    batch_id: batchId,
    file_path: `storage/media/${batchId}/test.jpg`,
    original_filename: 'test.jpg',
    file_size: 1024 * 50, // 50KB
    mime_type: 'image/jpeg',
    media_type: 'photo',
    role: 'additional',
    status: 'draft',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Generate test image buffer (1x1 PNG)
 */
export function generateTestImage(sizeBytes: number = 1024): Buffer {
  // 1x1 transparent PNG (smallest valid image)
  const minPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);

  if (sizeBytes <= minPng.length) {
    return minPng;
  }

  // Pad with random data to reach desired size
  const padding = Buffer.alloc(sizeBytes - minPng.length);
  return Buffer.concat([minPng, padding]);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run type-check
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/
git commit -m "feat(tests): add mock infrastructure for file system and database"
```

---

## Task 0.10: Documentation and Verification

**Files:**
- Create: `docs/PHOTOGRAPHY_MODULE.md`
- Update: `README.md`

- [ ] **Step 1: Create module documentation**

Create `docs/PHOTOGRAPHY_MODULE.md`:
```markdown
# Photography Module

## Overview
Batch-based media management with mobile upload, retention policies, and authenticated file serving.

## System Requirements
- Node.js 18+
- PostgreSQL 13+
- libheif (HEIC support)
- 10GB+ free disk space

## Setup
See README-PHOTOGRAPHY.md for installation instructions.

## Architecture
- **Upload Flow:** Multipart endpoint → File validation → Storage → Command bus → Database
- **Serving:** Authenticated route → Stream file with range request support
- **Authentication:** All endpoints require operator role
- **Rate Limiting:** 50 uploads per 15min, 200 downloads per min

## Security
- Authentication required on all endpoints
- Path traversal protection (UUID validation + path normalization)
- File type validation (magic bytes + whitelist)
- Rate limiting (express-rate-limit)
- Row-level locking (prevents race conditions)

## Monitoring
- Disk space: Alert if >80% full
- Orphaned files: Daily scan
- Upload success rate: Track >95%
- View consistency: Daily audit

## Rollback
See migrations/rollback/README.md

## Feature Flag
Set ENABLE_PHOTOGRAPHY=false to disable without code changes.
```

- [ ] **Step 2: Update main README**

Add to `README.md` under Features section:
```markdown
### Photography Module
- Batch-based media management
- Mobile upload with HEIC support
- Retention policies with automated cleanup
- Authenticated file serving with video streaming

Setup: See `README-PHOTOGRAPHY.md`
```

- [ ] **Step 3: Run verification checklist**

```bash
# Check dependencies installed
pnpm list multer sharp file-type express-rate-limit

# Check system dependencies
brew list | grep libheif  # macOS
dpkg -l | grep libheif    # Ubuntu

# Verify TypeScript compiles
npm run type-check

# Run all tests
npm test
```

All checks should pass.

- [ ] **Step 4: Commit**

```bash
git add docs/PHOTOGRAPHY_MODULE.md README.md README-PHOTOGRAPHY.md
git commit -m "docs: add photography module documentation"
```

- [ ] **Step 5: Create feature branch**

```bash
git checkout -b feature/photography-module
git push -u origin feature/photography-module
```

---

## Completion Checklist

Before proceeding to Phase 1:

- [ ] All dependencies installed (Node + system)
- [ ] Authentication middleware created and tested
- [ ] Routes directory created with registration pattern
- [ ] ViewSchema enum updated
- [ ] Migration numbers planned (0016, 0017, 0018)
- [ ] Disk space check utility created
- [ ] Rate limiters configured
- [ ] Rollback migrations created
- [ ] Test infrastructure created
- [ ] Documentation complete
- [ ] TypeScript compiles with no errors
- [ ] All Phase 0 tests pass
- [ ] Feature branch created

**Once complete, proceed to Phase 1 of the main implementation plan.**

---

## Estimated Time
- Task 0.1: 30 min (dependencies)
- Task 0.2: 2 hours (auth middleware + tests)
- Task 0.3: 1 hour (routes setup)
- Task 0.4: 15 min (viewSchema)
- Task 0.5: 15 min (migrations planning)
- Task 0.6: 1.5 hours (disk space check)
- Task 0.7: 30 min (rate limiters)
- Task 0.8: 1 hour (rollback migrations)
- Task 0.9: 2 hours (test infrastructure)
- Task 0.10: 1 hour (documentation)

**Total: ~10 hours**
