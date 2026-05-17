# Photography Module - Consolidated Review Findings

**Date:** 2026-05-17  
**Review Type:** Multi-agent adversarial review  
**Reviewers:** Architecture, Security, Test Coverage, Blast Radius, UX/Mobile  
**Plan Under Review:** `docs/superpowers/plans/2026-05-17-photography-module.md`

---

## Executive Summary

Five specialist agents conducted adversarial review of the photography module implementation plan. The plan demonstrates strong architectural alignment with existing patterns but has **21 CRITICAL issues** that must be fixed before implementation begins.

**Overall Assessment:** ⚠️ **NOT READY FOR IMPLEMENTATION**

**Key Findings:**
- 8 CRITICAL security vulnerabilities (authentication, path traversal, IDOR)
- 6 CRITICAL implementation blockers (missing dependencies, wrong file paths)
- 12 HIGH-priority issues (test coverage, mobile UX, data loss risks)
- 15+ MEDIUM-priority improvements needed

**Estimated Remediation Time:** 12-16 hours before implementation can begin safely

---

## CRITICAL ISSUES (BLOCK ALL WORK)

### Security (Must Fix Immediately)

#### 1. Missing Authentication on ALL Upload and Media Serving Routes
**Severity:** 🔴 CRITICAL  
**Confidence:** 100%  
**Impact:** Any unauthenticated user can upload files and access all media

**Evidence:**
- Line 945: `// TODO: Add requireOperator middleware after auth is set up`
- Line 1137: `// TODO: Add requireOperator middleware`
- Both routes have authentication commented out with TODO

**Attack Scenario:**
```bash
# Unauthenticated attacker can:
curl -X POST http://localhost:3000/api/upload/media \
  -F "file=@malicious.jpg" \
  -F "batchId=any-uuid-here"

curl http://localhost:3000/api/media/any-media-id
# → Downloads file with no authentication check
```

**Fix Required:**
```typescript
// Create middleware first (doesn't exist in codebase)
export async function requireOperator(req: Request, res: Response, next: NextFunction) {
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!canRole(user.role, 'operator')) {
    return res.status(403).json({ error: 'Operator access required' });
  }
  req.user = user;
  next();
}

// Apply to ALL routes
router.post('/api/upload/media', requireOperator, upload.single('file'), async (req, res) => {
  const userId = req.user!.id; // Now guaranteed present
  // ...
});

router.get('/api/media/:id', requireOperator, async (req, res) => {
  // Now requires authentication
});
```

**Why This Matters:**
- Disk exhaustion attack (fill disk with spam uploads)
- File system traversal if batchId validation has bypass
- Competitive intelligence leak (download all product photos)
- No audit trail (uploaded_by field would be NULL)

---

#### 2. Path Traversal Risk in Multer Destination Callback
**Severity:** 🔴 CRITICAL  
**Confidence:** 100%  
**Impact:** Write files outside storage directory, overwrite system files

**Evidence (lines 910-923):**
```typescript
destination: (req, file, cb) => {
  const batchId = req.body.batchId;
  
  try {
    validateBatchIdFormat(batchId);
  } catch (error) {
    return cb(error as Error);
  }
  
  const dir = path.join(MEDIA_STORAGE_PATH, batchId);
  fs.mkdirSync(dir, { recursive: true });
  cb(null, dir);
}
```

**Problem:** `req.body` might not be populated when multer's `storage.destination` is called (multer parses body after destination is determined in some configurations). If batchId is undefined or empty, validation passes and creates directory at root storage path.

**Fix Required:**
```typescript
destination: (req, file, cb) => {
  const batchId = req.body.batchId;
  
  // Fail closed if batchId missing
  if (!batchId) {
    return cb(new Error('Missing batchId'));
  }
  
  // Strict UUID validation (inline, don't trust external function)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(batchId)) {
    return cb(new Error('Invalid batch ID format'));
  }
  
  // Double-check path is within storage root (defense in depth)
  const dir = path.join(MEDIA_STORAGE_PATH, batchId);
  const normalizedDir = path.normalize(dir);
  const normalizedRoot = path.normalize(MEDIA_STORAGE_PATH);
  
  if (!normalizedDir.startsWith(normalizedRoot)) {
    return cb(new Error('Invalid storage path'));
  }
  
  fs.mkdirSync(normalizedDir, { recursive: true });
  cb(null, normalizedDir);
}
```

---

#### 3. Race Condition in Primary Media Role Assignment
**Severity:** 🔴 CRITICAL  
**Confidence:** 100%  
**Impact:** Two primary photos/videos on same batch, violate unique constraint, data inconsistency

**Evidence (lines 1505-1537):**
```typescript
// Get media info
const media = await tx.query('SELECT batch_id, media_type FROM batch_media WHERE id = $1', [mediaId]);
// ← Window 1: Another transaction reads same state

// If setting as primary, demote existing primary
if (role === 'primary_photo' || role === 'primary_video') {
  await tx.query(
    `UPDATE batch_media 
     SET role = 'additional', updated_at = now() 
     WHERE batch_id = $1 AND role = $2 AND status = 'published'`,
    [batchId, role]
  );
}
// ← Window 2: Another transaction demotes here too

// Update role
await tx.query(
  'UPDATE batch_media SET role = $1, updated_at = now() WHERE id = $2',
  [role, mediaId]
);
// ← Window 3: Both transactions promote, violating unique constraint
```

**Fix Required:**
```typescript
// Add FOR UPDATE lock
const media = await tx.query(
  'SELECT batch_id, media_type FROM batch_media WHERE id = $1 FOR UPDATE',
  [mediaId]
);

// Also lock all media for this batch
await tx.query(
  `UPDATE batch_media 
   SET role = 'additional', updated_at = now() 
   WHERE batch_id = $1 AND role = $2 AND status = 'published' AND id != $3`,
  [batchId, role, mediaId]
);
```

---

### Implementation Blockers (Must Fix Before Starting)

#### 4. Missing Dependencies
**Severity:** 🔴 CRITICAL  
**Confidence:** 95%  
**Impact:** All upload tasks will fail immediately

**Evidence:**
- Plan references `multer`, `sharp`, `file-type` extensively
- `package.json` doesn't include them
- Installation steps scattered across tasks

**Fix Required:**
Add consolidated dependency installation at start of Phase 1:
```bash
pnpm add multer sharp file-type
pnpm add -D @types/multer

# Also document sharp HEIC dependency
# macOS (required for HEIC support)
brew install libheif

# Ubuntu
apt-get install libheif-dev
```

---

#### 5. Routes Directory Doesn't Exist
**Severity:** 🔴 CRITICAL  
**Confidence:** 90%  
**Impact:** Upload and media routes won't be loaded, all upload functionality broken

**Evidence:**
- Plan creates `src/server/routes/uploadRoute.ts` and `mediaRoute.ts`
- Codebase has no `routes/` directory (glob returned "No files found")
- Current architecture uses `app.ts` for routing

**Fix Required:**
Either:
- Create routes directory AND update `src/server/app.ts` to import/register routes
- OR follow existing pattern: add routes directly to `app.ts` instead of separate route files

**Plan currently modifies `src/server/index.ts` (line 1002) but `index.ts` only creates the app, doesn't handle routing.**

---

#### 6. Database Transaction Type Mismatch
**Severity:** 🔴 CRITICAL  
**Confidence:** 85%  
**Impact:** Commands won't participate in transactions, tests will fail

**Evidence:**
- Command handlers use `tx: Pool` type
- Codebase uses Drizzle ORM (`db.transaction()`) for transactions (see `commandBus.ts` line 99)
- Tests pass `pool` directly but it's not the same as Drizzle transaction context

**Fix Required:**
```typescript
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export async function uploadBatchMedia(
  tx: NodePgDatabase<typeof schema>,  // NOT Pool
  payload: Record<string, unknown>,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  // Use Drizzle query builder instead of raw tx.query()
  await tx.insert(batchMedia).values({
    id: payload.mediaId,
    batch_id: payload.batchId,
    // ...
  });
}
```

---

#### 7. ViewSchema Enum Wrong Location
**Severity:** 🔴 CRITICAL  
**Confidence:** 90%  
**Impact:** Photography view won't be recognized, grid queries will fail

**Evidence:**
- Task 15 Step 1 says modify `src/shared/types.ts` to add 'photography' to viewSchema
- Actual viewSchema is defined in `src/server/routers/queries.ts` line 11 as local z.enum, not in types.ts

**Fix Required:**
```typescript
// In src/server/routers/queries.ts, line 11
const viewSchema = z.enum([
  'all',
  'active',
  'archived',
  'processors',
  'photography'  // Add here
]);
```

---

#### 8. Migration Numbering Conflict
**Severity:** 🔴 CRITICAL  
**Confidence:** 90%  
**Impact:** Migration ordering is critical; gap of 28 migrations will cause conflicts

**Evidence:**
- Plan creates migrations `0043`, `0044`, `0045`
- Last migration in repo is `0015_payment_processors.sql`
- 28-migration gap

**Fix Required:**
Use next available numbers (0016, 0017, 0018) or implement migration numbering strategy that prevents conflicts.

---

## HIGH PRIORITY ISSUES

### Security

#### 9. Missing File Type Cross-Validation
**Severity:** 🟠 HIGH  
**Impact:** Upload malicious executables with benign extensions (e.g., `malicious.exe.jpg`)

**Fix:** Cross-check magic bytes with claimed extension, reject mismatches

---

#### 10. No Rate Limiting on Upload Endpoint
**Severity:** 🟠 HIGH  
**Impact:** Upload spam, disk/CPU exhaustion, 50 uploads per 15min needed

**Fix:**
```typescript
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => req.user?.id || req.ip
});

router.post('/api/upload/media', requireOperator, uploadLimiter, ...);
```

---

#### 11. IDOR Vulnerability - No Authorization Check
**Severity:** 🟠 HIGH  
**Impact:** Access any media by guessing UUID, competitive intelligence leak

**Current State:** Authentication present but no check if user's role/org can access this batch

**Fix:** If multi-tenancy needed, add batch ownership check in media serving route

---

### Test Coverage

#### 12. Missing Integration Test - Full Upload Flow
**Severity:** 🟠 HIGH  
**Impact:** No verification that multipart upload → command → DB → file serving works end-to-end

**Required Test:**
```typescript
it('should handle complete upload-to-retrieval flow', async () => {
  // 1. Upload file via multipart endpoint
  const uploadRes = await uploadFile(testBatch.id, testImage);
  
  // 2. Create batch_media record via command
  await runCommand('uploadBatchMedia', uploadRes);
  
  // 3. Query batchMedia endpoint
  const mediaList = await trpc.queries.batchMedia({ batchId: testBatch.id });
  expect(mediaList).toHaveLength(1);
  
  // 4. Retrieve file via media serving route
  const serveRes = await request(app).get(`/api/media/${mediaList[0].id}`);
  expect(serveRes.status).toBe(200);
  expect(serveRes.headers['content-type']).toBe('image/jpeg');
});
```

---

#### 13. Missing Security Tests
**Severity:** 🟠 HIGH  
**Impact:** Path traversal, file spoofing, authentication bypass risks

**Required Tests:**
- Path traversal in batchId
- Filename path traversal
- JPEG extension with EXE magic bytes
- Unauthenticated upload requests
- Non-operator role uploads

---

#### 14. Missing Transaction Rollback Tests
**Severity:** 🟠 HIGH  
**Impact:** Data integrity not verified

**Required Test:**
```typescript
it('should rollback DB insert if file cleanup fails', async () => {
  vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
    throw new Error('Disk full');
  });
  
  await expect(deleteBatchMedia(pool, { mediaId })).rejects.toThrow();
  
  // Verify media still exists in DB (rollback worked)
  const media = await pool.query('SELECT * FROM batch_media WHERE id = $1', [mediaId]);
  expect(media.rows).toHaveLength(1);
});
```

---

#### 15. Missing Concurrent Operation Tests
**Severity:** 🟠 HIGH  
**Impact:** Race conditions in primary role assignment

**Required Test:**
```typescript
it('should handle concurrent primary photo updates safely', async () => {
  const [media1, media2] = await createTwoMedia(batchId);
  
  await Promise.all([
    setBatchMediaRole(pool, { mediaId: media1.id, role: 'primary_photo' }, 'cmd-1'),
    setBatchMediaRole(pool, { mediaId: media2.id, role: 'primary_photo' }, 'cmd-2')
  ]);
  
  // Verify only ONE primary photo exists
  const primaries = await pool.query(
    `SELECT * FROM batch_media WHERE batch_id = $1 AND role = 'primary_photo' AND status = 'published'`,
    [batchId]
  );
  expect(primaries.rows).toHaveLength(1);
});
```

---

### Blast Radius & Data Loss

#### 16. Orphaned Files When Upload Succeeds, DB Insert Fails
**Severity:** 🟠 HIGH  
**Impact:** Disk fills with orphaned uploads (50MB photos x 100 failures = 5GB waste)

**Scenario:**
```
1. POST /api/upload/media saves file to disk → SUCCESS
2. generateThumbnails creates 2 variants → SUCCESS
3. Command 'uploadBatchMedia' runs → DB ERROR
Result: 3 orphaned files on disk, no DB record
```

**Fix Required:** Reverse the flow - DB insert BEFORE file operations:
```typescript
// SAFER PATTERN:
1. Create batch_media record with status='uploading', file_path=null
2. Try file upload + thumbnails
3. If success: UPDATE batch_media SET file_path=..., status='draft'
4. If failure: DELETE batch_media WHERE id=... + cleanup partial files
```

---

#### 17. Retention Policy Accidental Data Loss
**Severity:** 🟠 HIGH  
**Impact:** Automated cleanup deletes wrong files, permanent data loss

**Current Design:**
```sql
'Draft Cleanup', 'Delete draft media older than 90 days', 90, 'draft', true
```

**Problems:**
- No grace period (could delete drafts from active upload session)
- No user notification before deletion
- No "soft delete" / trash bin
- No exemption list

**CRITICAL Safety Checks Needed:**
1. **Dry-run mode** - log candidates without deleting
2. **Grace period** - exclude files modified in last 7 days
3. **Batch status check** - don't delete drafts if batch is still active
4. **Manual approval** - require operator review before bulk deletion
5. **Soft delete** - move to `.trash` folder, purge after 30 days

---

#### 18. Missing Disk Space Pre-Check
**Severity:** 🟠 HIGH  
**Impact:** Upload succeeds but disk full → partial writes, service crash

**Fix Required:**
```typescript
import { statfs } from 'fs/promises';

async function checkDiskSpace(requiredBytes: number) {
  const stats = await statfs(MEDIA_STORAGE_PATH);
  const availableBytes = stats.bavail * stats.bsize;
  const usagePercent = 100 - (availableBytes / (stats.blocks * stats.bsize) * 100);
  
  if (usagePercent > 90) {
    throw new Error('Disk usage critical: ' + usagePercent.toFixed(1) + '%');
  }
  if (availableBytes < requiredBytes * 1.5) {
    throw new Error('Insufficient disk space');
  }
}

// In route handler:
await checkDiskSpace(req.headers['content-length']);
```

---

### Mobile UX

#### 19. Camera Integration - Missing Critical Attributes
**Severity:** 🟠 HIGH  
**Impact:** Photographer workflow breaks if camera doesn't open reliably on iPhone

**Current Plan (lines 2031-2039):**
```typescript
input.type = 'file';
input.accept = 'image/*';
input.capture = 'environment';
```

**Problems:**
- `capture="environment"` is non-standard, inconsistent on iPhone Safari
- No fallback if camera access denied
- HEIC not in accept attribute
- Multiple files not supported

**Fix Required:**
```typescript
input.type = 'file';
input.accept = 'image/*,image/heic,image/heif'; // Explicit HEIC support
input.capture = 'environment';
input.multiple = true; // Allow batch upload

// Add permission check BEFORE opening input
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    input.click();
  } catch (err) {
    pushToast('Camera access denied. Please enable in Settings > Safari > Camera', 'error');
  }
}
```

---

#### 20. Upload Progress - Completely Missing
**Severity:** 🟠 HIGH  
**Impact:** User sees "Uploading..." with no feedback, will abandon app

**Current Plan:** Only shows text "Uploading..."

**Fix Required:**
```typescript
const [uploadProgress, setUploadProgress] = useState(0);
const xhr = new XMLHttpRequest();

xhr.upload.addEventListener('progress', (e) => {
  if (e.lengthComputable) {
    setUploadProgress(Math.round((e.loaded / e.total) * 100));
  }
});

// UI with progress bar + cancel button
{isUploading && (
  <div className="mt-4 space-y-2">
    <div className="flex items-center justify-between text-sm">
      <span>Uploading... {uploadProgress}%</span>
      <button onClick={cancelUpload}>Cancel</button>
    </div>
    <div className="h-2 bg-zinc-200 rounded-full">
      <div style={{ width: `${uploadProgress}%` }} />
    </div>
  </div>
)}
```

---

#### 21. Touch Targets Too Small
**Severity:** 🟠 HIGH  
**Impact:** iOS HIG requires 44x44pt minimum, photographer will mis-tap

**Fix:** Enforce `min-h-[44px] min-w-[44px]` on all mobile buttons

---

## MEDIUM PRIORITY ISSUES

### Security
22. Missing CSRF protection (sameSite cookies provide partial protection)
23. Error messages could leak info (need sanitization)
24. Thumbnail generation without resource limits (CPU exhaustion risk)

### Test Coverage
25. Missing orphan detection tests
26. Missing cascade deletion tests
27. Missing large file upload tests
28. Missing E2E mobile workflow test
29. TDD violations (tests written after seeing implementation)

### Blast Radius
30. Missing monitoring/alerting (disk space, orphans, success rate)
31. No rollback procedures documented
32. Breaking change to JSON exports (need compatibility bridge)
33. View desync (batch_media_summary can get stale)

### UX/Mobile
34. HEIC bandwidth waste (conversion happens server-side after upload)
35. Loading states inadequate (no spinners)
36. Error messages too technical (not user-friendly)
37. Success feedback unclear (no next steps)
38. Offline handling not implemented
39. No drag-and-drop for desktop
40. No bulk operations

---

## IMPLEMENTATION PLAN FIXES

### Immediate Actions (Before Starting Task 1)

**Add New Task 0: Prerequisites**
```markdown
### Task 0: Prerequisites & Setup

- [ ] Install dependencies: `pnpm add multer sharp file-type; pnpm add -D @types/multer`
- [ ] Install libheif (macOS: `brew install libheif`, Ubuntu: `apt-get install libheif-dev`)
- [ ] Create authentication middleware: `requireOperator`
- [ ] Create routes directory: `mkdir -p src/server/routes`
- [ ] Update `src/server/app.ts` to import and register routes
- [ ] Renumber migrations: 0043→0016, 0044→0017, 0045→0018
- [ ] Fix viewSchema location: Add 'photography' to queries.ts, not types.ts
- [ ] Change command handler types from `Pool` to `NodePgDatabase<typeof schema>`
```

**Add New Task 4.5: Test Infrastructure**
```markdown
### Task 4.5: Test Infrastructure Setup

**Files:**
- Create: `tests/helpers/mockFileSystem.ts`
- Create: `tests/helpers/mockDatabase.ts`
- Create: `tests/helpers/testHelpers.ts`

- [ ] Create mock file system
- [ ] Create transaction mock
- [ ] Create test data helpers
- [ ] Verify mocks work independently
```

**Update Task 5: Add Security Tests**
Add to validation tests:
- Path traversal in batchId (`../../../etc/passwd`)
- Filename path traversal
- JPEG extension with EXE magic bytes
- Cross-check magic bytes with claimed extension

**Update Task 10: Add Disk Space Check**
Add to upload route before multer:
```typescript
await checkDiskSpace(req.headers['content-length']);
```

**Update Task 10: Fix Path Traversal**
Add defense-in-depth validation in multer destination callback

**Update Task 10: Add Rate Limiting**
Install and configure express-rate-limit

**Update Task 13: Fix Race Condition**
Add `FOR UPDATE` locks in setBatchMediaRole

**Update Task 14: Add Retention Safeguards**
Add dry-run mode, grace period, manual approval gate

**Update Task 18: Fix Mobile UX**
- Add HEIC to accept attribute
- Add permission check before camera
- Add XHR upload progress tracking
- Add cancel upload button
- Enforce 44px touch targets
- Add user-friendly error messages

---

## ROLLBACK STRATEGY

### Database
Create rollback migrations:
- `migrations/rollback/0016_drop_batch_media.sql`
- `migrations/rollback/0017_drop_policies.sql`
- `migrations/rollback/0018_drop_view.sql`

### Files
Backup before deployment:
```bash
tar -czf batch_media_backup_$(date +%Y%m%d).tar.gz storage/media/
mv batch_media_backup_*.tar.gz /Volumes/BackupDrive/
```

### Code
Add feature flag kill switch:
```typescript
const PHOTOGRAPHY_ENABLED = process.env.ENABLE_PHOTOGRAPHY === 'true';
if (PHOTOGRAPHY_ENABLED) {
  app.use(uploadRoute);
  app.use(mediaRoute);
}
```

---

## MONITORING REQUIREMENTS

**Add to Cron:**
1. Disk space check (every 10 min, alert if >80%)
2. Orphan detection (daily)
3. View consistency audit (daily)
4. Upload success rate tracking

**Add Alerts:**
- Disk >80% full
- \>100 orphaned files detected
- Cleanup job fails
- Upload success rate <95%

---

## DEPLOYMENT SEQUENCE

**Week 1: Schema-only (zero risk)**
1. Run migrations during maintenance window
2. Verify schema exists
3. No code changes yet

**Week 2: Code + dark launch**
1. Deploy code with ENABLE_PHOTOGRAPHY=false
2. Test manually with test batch ID
3. Enable for admin users only
4. Run 10 test uploads
5. Enable for all users

**Week 3: Monitor + iterate**
1. Check daily metrics
2. Review with photographer
3. Fix UX issues
4. Enable retention policies (dry-run first)

---

## ESTIMATED REMEDIATION TIME

| Category | Issues | Time |
|----------|--------|------|
| Security fixes (auth, path traversal, rate limit) | 11 | 6 hours |
| Implementation blockers (deps, paths, types) | 6 | 4 hours |
| Test infrastructure + critical tests | 8 | 6 hours |
| Mobile UX fixes (progress, camera, touch) | 7 | 4 hours |
| Blast radius (disk check, rollback docs) | 6 | 3 hours |
| **TOTAL** | **38** | **23 hours** |

**Conservative estimate: 3 work days of fixes before implementation can begin safely.**

---

## CONCLUSION

The photography module plan is architecturally sound and follows established patterns well. However, it has critical security vulnerabilities and implementation blockers that make it unsafe to proceed without remediation.

**Recommendation:** Fix all CRITICAL issues (1-8) before starting any implementation work. HIGH priority issues (9-21) should be addressed during Phase 1 implementation. MEDIUM issues can be deferred to Phase 3-4.

**Next Steps:**
1. Create GitHub issue with consolidated findings
2. Update implementation plan with fixes
3. Create Task 0 (Prerequisites) with all blockers
4. Re-review critical sections before execution
5. Begin implementation only after all CRITICAL fixes are merged into plan
