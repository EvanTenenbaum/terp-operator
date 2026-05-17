# Photography Module Design

**Date:** 2026-05-17  
**Status:** Approved  
**Architecture Pattern:** Dedicated Media Module (mirrors Payment Processor pattern)

---

## Executive Summary

Transform photography from a placeholder panel into a first-class module with mobile upload, batch-based media management, retention policies, and tech staff integration. MVP delivers photographer mobile workflow (search + upload) and basic media management in 2 weeks.

**Key Metrics:**
- Upload time: 5 minutes → 30 seconds
- Photo coverage: 80% of batches within 48 hours
- Mobile adoption: 70% of uploads from mobile

---

## Problem Statement

Current photography system is a placeholder with critical limitations:
- Lives as awkward panel within Operations view
- Only supports single photo URL via `batches.photoUrl`
- No bulk upload, mobile workflow, video support, or media management
- No retention policies

**Quantified Pain:**
- 42 batches currently lack photos (as of 2026-05-17)
- Photographer: 5 min/batch (find code on paper → desktop → navigate → paste URL)
- Office staff: No review/curation before publishing
- Tech staff: Manual JSON export scraping (fragile)

---

## User Personas & Use Cases

### Persona 1: Photographer (Primary)

**UC 1.1: Field Photography**
- **WHO**: Photographer taking photos in warehouse
- **WANTS**: Upload photos from iPhone immediately after shooting
- **SO THAT**: Photos attach to correct batch without desktop round-trip
- **WHEN**: During batch intake/inspection (10-20 batches/day)

**UC 1.2: Queue Management**
- **WHO**: Photographer reviewing workload
- **WANTS**: See which batches need photos, oldest first (priority)
- **SO THAT**: Focus on high-priority backlog, avoid missing batches
- **WHEN**: Starting daily photography session

### Persona 2: Office Staff (Secondary)

**UC 2.1: Media Curation**
- **WHO**: Office staff reviewing uploaded photos
- **WANTS**: Set primary photo/video and publish drafts
- **SO THAT**: Customers see best representation
- **WHEN**: Weekly media review cycle

**UC 2.2: Bulk Catch-Up** (Post-MVP)
- **WHO**: Office staff with backlog
- **WANTS**: Import 50+ batch photos via CSV in <5 minutes
- **SO THAT**: Clear backlog without one-by-one uploads
- **WHEN**: After photographer bulk-shoots but delays upload

### Persona 3: Tech Staff (Tertiary)

**UC 3.1: Website Integration**
- **WHO**: Tech staff automating website updates
- **WANTS**: Batch media URLs in JSON export
- **SO THAT**: Automated scripts sync inventory without manual intervention
- **WHEN**: Nightly website update cron runs

---

## Success Criteria

### Quantifiable Metrics

1. **Photographer Efficiency**
   - Target: 5min → 30sec per batch
   - Measurement: Time from photo capture to confirmed upload
   - Threshold: 80% of uploads <45sec

2. **Photo Coverage**
   - Target: 80% of batches have primary photo within 48hrs of creation
   - Measurement: `batches.created_at` to first `batch_media.created_at` with `role='primary_photo'`
   - Threshold: Maintain 80%+ coverage after 30 days

3. **Mobile Adoption**
   - Target: 70% of uploads from mobile (vs desktop)
   - Measurement: Upload source tracking
   - Threshold: 50%+ mobile within 2 weeks of launch

### Failure Criteria

- Mobile uploads <30% after 30 days → investigate UX friction
- Upload time >60sec (50th percentile) → optimize flow
- Photographer reverts to old photoUrl method → mobile UX failed

---

## MVP Definition

**MVP = Phase 1 + Phase 2** (2 weeks)

**Must Have:**
- Mobile search + upload interface
- Desktop direct upload
- Primary photo/video selection
- Draft → Published workflow
- Basic retention policy (manual trigger)
- Authenticated file serving
- Photography queue view (list format)

**Post-MVP:**
- Bulk CSV import (Phase 3)
- Grid view toggle (Phase 3)
- Automated retention cron (Phase 4)
- Media history tracking (Phase 4)

---

## Architecture

### File Upload Flow

```
Client → POST /api/upload/media (multipart)
  ↓
Server: uploadRoute.ts (multer)
  - Validate file type (whitelist + magic bytes)
  - Validate file size (50MB photos, 200MB videos)
  - Generate UUID filename
  - Store to MEDIA_STORAGE_PATH/{batchId}/
  - Generate thumbnails (200x200, 800x800)
  - Convert HEIC→JPEG if needed
  - Return: { fileId, filePath, fileSize, mimeType, thumbnailPath, mediumPath }
  ↓
Client → runCommand('uploadBatchMedia', { fileId, batchId, role, status })
  ↓
Server: commandBus.ts → uploadBatchMedia
  - Create batch_media record
  - Link file metadata
  - Return: { ok: true, toast: 'Photo uploaded' }
```

### Storage Configuration

```typescript
// Environment variable
MEDIA_STORAGE_PATH=storage/media  // Default, configurable per environment

// Directory structure
${MEDIA_STORAGE_PATH}/
├── {batch-id}/
│   ├── {uuid}_{sanitized-filename}.jpg
│   └── {uuid}_{sanitized-filename}.mp4
└── .thumbnails/
    └── {batch-id}/
        ├── {media-id}_thumb.jpg  (200x200)
        └── {media-id}_medium.jpg (800x800)
```

### Upload Route Implementation

```typescript
// src/server/routes/uploadRoute.ts
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromFile } from 'file-type';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || 'storage/media';
const MAX_PHOTO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const batchId = req.body.batchId;
      if (!validateBatchIdFormat(batchId)) {
        return cb(new Error('Invalid batch ID format'));
      }
      const dir = path.join(MEDIA_STORAGE_PATH, batchId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const uuid = crypto.randomUUID();
      const sanitized = sanitizeFilename(file.originalname);
      cb(null, `${uuid}_${sanitized}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.mp4', '.mov', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error(`File type not allowed: ${ext}`));
    }
    cb(null, true);
  },
  limits: {
    fileSize: MAX_PHOTO_SIZE // multer checks during upload, refined in route
  }
});

function validateBatchIdFormat(batchId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(batchId);
}

function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  return `${sanitized}${ext}`;
}

async function validateMagicBytes(filePath: string): Promise<{ valid: boolean; actualType?: string }> {
  const fileType = await fileTypeFromFile(filePath);
  if (!fileType) return { valid: false };
  
  const allowed = ['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'];
  if (!allowed.includes(fileType.mime)) {
    return { valid: false };
  }
  
  return { valid: true, actualType: fileType.mime };
}

async function convertHeicToJpeg(filePath: string): Promise<string> {
  const jpegPath = filePath.replace(/\.heic$/i, '.jpg');
  await sharp(filePath)
    .jpeg({ quality: 90 })
    .toFile(jpegPath);
  fs.unlinkSync(filePath); // Remove HEIC after conversion
  return jpegPath;
}

async function generateThumbnails(filePath: string, mediaId: string, batchId: string): Promise<{ thumb: string; medium: string }> {
  const thumbDir = path.join(MEDIA_STORAGE_PATH, '.thumbnails', batchId);
  fs.mkdirSync(thumbDir, { recursive: true });
  
  const thumbPath = path.join(thumbDir, `${mediaId}_thumb.jpg`);
  const mediumPath = path.join(thumbDir, `${mediaId}_medium.jpg`);
  
  // Auto-rotate based on EXIF orientation
  await sharp(filePath)
    .rotate() // Auto-rotate
    .resize(200, 200, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toFile(thumbPath);
  
  await sharp(filePath)
    .rotate()
    .resize(800, 800, { fit: 'inside' })
    .jpeg({ quality: 90 })
    .toFile(mediumPath);
  
  return { thumb: thumbPath, medium: mediumPath };
}

router.post('/api/upload/media', requireOperator, upload.single('file'), async (req, res) => {
  try {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Additional size check for videos
    const isVideo = file.mimetype.startsWith('video/');
    const sizeLimit = isVideo ? MAX_VIDEO_SIZE : MAX_PHOTO_SIZE;
    if (file.size > sizeLimit) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ 
        error: `File size exceeds ${isVideo ? '200MB' : '50MB'} limit` 
      });
    }
    
    // Validate magic bytes
    const magicCheck = await validateMagicBytes(file.path);
    if (!magicCheck.valid) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'File type validation failed' });
    }
    
    let finalPath = file.path;
    let finalMimeType = file.mimetype;
    
    // Convert HEIC to JPEG
    if (file.mimetype === 'image/heic') {
      finalPath = await convertHeicToJpeg(file.path);
      finalMimeType = 'image/jpeg';
    }
    
    // Generate thumbnails for photos
    const fileId = crypto.randomUUID();
    let thumbnailPath, mediumPath;
    
    if (finalMimeType.startsWith('image/')) {
      const thumbs = await generateThumbnails(finalPath, fileId, req.body.batchId);
      thumbnailPath = thumbs.thumb;
      mediumPath = thumbs.medium;
    }
    
    res.json({
      fileId,
      filePath: finalPath,
      originalFilename: file.originalname,
      fileSize: file.size,
      mimeType: finalMimeType,
      thumbnailPath,
      mediumPath
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});
```

### Authenticated File Serving

```typescript
// src/server/routes/mediaRoute.ts
router.get('/api/media/:id', requireOperator, async (req, res) => {
  const { id } = req.params;
  
  const media = await db.query('SELECT * FROM batch_media WHERE id = $1', [id]);
  if (!media.rows[0]) {
    return res.status(404).json({ error: 'Media not found' });
  }
  
  const record = media.rows[0];
  
  if (!fs.existsSync(record.file_path)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  
  const isVideo = record.mime_type.startsWith('video/');
  res.setHeader('Content-Type', record.mime_type);
  res.setHeader('Content-Disposition', isVideo ? 'attachment' : 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Stream for videos (supports range requests)
  if (isVideo) {
    const stat = fs.statSync(record.file_path);
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', end - start + 1);
      
      fs.createReadStream(record.file_path, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(record.file_path).pipe(res);
    }
  } else {
    res.sendFile(path.resolve(record.file_path));
  }
});

router.get('/api/media/:id/thumb', requireOperator, async (req, res) => {
  const { id } = req.params;
  const media = await db.query('SELECT thumbnail_path FROM batch_media WHERE id = $1', [id]);
  if (!media.rows[0]?.thumbnail_path) {
    return res.status(404).json({ error: 'Thumbnail not found' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.resolve(media.rows[0].thumbnail_path));
});
```

---

## Data Model

### `batch_media`

```sql
CREATE TABLE batch_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  
  -- File information
  file_path text NOT NULL,
  original_filename varchar(255) NOT NULL,
  file_size bigint NOT NULL,
  mime_type varchar(100) NOT NULL,
  thumbnail_path text,
  medium_path text,
  
  -- Media classification
  media_type varchar(20) NOT NULL CHECK (media_type IN ('photo', 'video')),
  role varchar(30) NOT NULL DEFAULT 'additional' CHECK (role IN ('primary_photo', 'primary_video', 'additional')),
  
  -- Status & lifecycle
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  replaced_at timestamptz,
  replaced_by uuid REFERENCES batch_media(id) ON DELETE SET NULL,
  
  -- Metadata
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX batch_media_batch_idx ON batch_media(batch_id);
CREATE INDEX batch_media_status_idx ON batch_media(status);
CREATE INDEX batch_media_role_idx ON batch_media(role);
CREATE INDEX batch_media_replaced_idx ON batch_media(replaced_at) WHERE replaced_at IS NOT NULL;
CREATE INDEX batch_media_created_idx ON batch_media(created_at);
CREATE INDEX batch_media_uploaded_by_idx ON batch_media(uploaded_by);

-- Unique primary media per batch
CREATE UNIQUE INDEX batch_media_primary_photo_unique 
  ON batch_media(batch_id) 
  WHERE role = 'primary_photo' AND status = 'published' AND replaced_at IS NULL;

CREATE UNIQUE INDEX batch_media_primary_video_unique 
  ON batch_media(batch_id) 
  WHERE role = 'primary_video' AND status = 'published' AND replaced_at IS NULL;
```

### `media_retention_policies`

```sql
CREATE TABLE media_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  description text,
  days_to_keep integer NOT NULL CHECK (days_to_keep > 0),
  applies_to varchar(20) NOT NULL CHECK (applies_to IN ('draft', 'replaced')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Default policies
INSERT INTO media_retention_policies (name, description, days_to_keep, applies_to, is_active)
VALUES 
  ('Draft Cleanup', 'Delete draft media older than 90 days', 90, 'draft', true),
  ('Replaced Media Cleanup', 'Delete replaced media older than 30 days', 30, 'replaced', true);
```

### `media_cleanup_log`

```sql
CREATE TABLE media_cleanup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES media_retention_policies(id) ON DELETE SET NULL,
  files_deleted integer NOT NULL,
  bytes_freed bigint NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Computed View

```sql
CREATE VIEW batch_media_summary AS
SELECT 
  b.id AS batch_id,
  b.batch_code,
  b.name,
  COUNT(bm.id) FILTER (WHERE bm.status = 'published') AS published_media_count,
  COUNT(bm.id) FILTER (WHERE bm.status = 'draft') AS draft_media_count,
  COUNT(bm.id) AS total_media_count,
  MAX(bm.created_at) FILTER (WHERE bm.role = 'primary_photo' AND bm.status = 'published' AND bm.replaced_at IS NULL) IS NOT NULL AS has_primary_photo,
  MAX(bm.created_at) FILTER (WHERE bm.role = 'primary_video' AND bm.status = 'published' AND bm.replaced_at IS NULL) IS NOT NULL AS has_primary_video,
  MAX(bm.updated_at) AS media_updated_at
FROM batches b
LEFT JOIN batch_media bm ON bm.batch_id = b.id AND bm.replaced_at IS NULL
WHERE b.active = true
GROUP BY b.id, b.batch_code, b.name;
```

---

## Query Layer

### Photography Grid Query

```typescript
// src/shared/types.ts - Add to viewSchema enum
export const viewSchema = z.enum([
  'purchaseOrders',
  'inventory',
  'orders',
  'payments',
  'processors',
  'photography',  // ← NEW
  // ...
]);

// src/server/routers/queries.ts - Add case to grid query
case 'photography': {
  const rows = await pool.query(`
    SELECT 
      bms.batch_id AS id,
      bms.batch_code AS "batchCode",
      bms.name,
      b.category,
      CASE 
        WHEN bms.has_primary_photo AND bms.has_primary_video THEN 'complete'
        WHEN bms.has_primary_photo OR bms.has_primary_video THEN 'partial'
        WHEN bms.draft_media_count > 0 THEN 'draft'
        ELSE 'needs_photos'
      END AS "mediaStatus",
      bms.has_primary_photo AS "hasPrimaryPhoto",
      bms.has_primary_video AS "hasPrimaryVideo",
      bms.published_media_count AS "publishedCount",
      bms.draft_media_count AS "draftCount",
      bms.total_media_count AS "totalCount",
      b.created_at AS "createdAt",
      bms.media_updated_at AS "mediaUpdatedAt"
    FROM batch_media_summary bms
    JOIN batches b ON b.id = bms.batch_id
    ORDER BY b.created_at ASC
    LIMIT 1000
  `);
  return rows.rows;
}
```

### Batch Media Query

```typescript
// src/server/routers/queries.ts
batchMedia: protectedProcedure
  .input(z.object({ batchId: z.string().uuid() }))
  .query(async ({ input }) => {
    const { batchId } = input;
    return (
      await pool.query(
        `SELECT id, batch_id AS "batchId", file_path AS "filePath", 
                original_filename AS "originalFilename", file_size AS "fileSize",
                mime_type AS "mimeType", thumbnail_path AS "thumbnailPath",
                media_type AS "mediaType", role, status, 
                published_at AS "publishedAt", replaced_at AS "replacedAt",
                notes, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM batch_media
         WHERE batch_id = $1 AND replaced_at IS NULL
         ORDER BY 
           CASE role 
             WHEN 'primary_photo' THEN 1 
             WHEN 'primary_video' THEN 2 
             ELSE 3 
           END,
           created_at DESC`,
        [batchId]
      )
    ).rows;
  })
```

---

## Command Structure

All commands in `src/server/services/mediaCommands.ts`, imported into `commandBus.ts` (following `processorCommands.ts` pattern).

### Commands

1. **uploadBatchMedia** - Create batch_media record after file uploaded
2. **setBatchMediaRole** - Set primary_photo/primary_video (demotes old primary)
3. **publishBatchMedia** - Draft → Published
4. **replaceBatchMedia** - Replace existing media, mark old as replaced
5. **deleteBatchMedia** - Delete record + files
6. **applyMediaRetentionPolicy** - Run cleanup per active policies

See Revision 1 design draft for full implementation details.

---

## Frontend Components

### MediaView.tsx

- Full-page photography management
- Access: Sidebar nav ("Photography") + quicknav dropdown
- **List view (default)**: Table with columns: Batch Code, Product Name, Media Status, Primary Photo, Primary Video, Additional Count, Created, Actions
- **Grid view (Phase 3)**: Card-based with thumbnails
- Filter: "Needs photos" (default) / "All batches"
- Sort: "Oldest first" (default) / "Newest first" / "Batch code"

### MediaDrawer.tsx

- Contextual drawer in batch detail ("Media" tab)
- Thumbnail gallery, role indicators
- Actions: Upload, Set Primary, Publish, Replace, Delete

### MediaUploadMobile.tsx

- Mobile-optimized at `/photography/mobile`
- Search bar (batch code or product name)
- Batch list with status badges
- "Add Media" button → Modal with:
  - **"Take Photo"** (confirmation modal before opening camera)
  - "Record Video"
  - "Choose from Library"
- Upload progress, offline queue

---

## Migration Strategy

### Existing `batches.photoUrl` Field

**30-Day Dual-Read Period:**

```sql
-- Phase 1: Add new media system (don't drop photoUrl yet)
-- Phase 2: Migrate existing URLs to batch_media
INSERT INTO batch_media (batch_id, file_path, original_filename, file_size, mime_type, media_type, role, status, created_at)
SELECT 
  id AS batch_id,
  photo_url AS file_path,
  'legacy.jpg' AS original_filename,
  0 AS file_size,
  'image/jpeg' AS mime_type,
  'photo' AS media_type,
  'primary_photo' AS role,
  'published' AS status,
  updated_at AS created_at
FROM batches
WHERE photo_url IS NOT NULL AND photo_url != '';

-- Phase 3: Dual-read for 30 days (query checks both photoUrl and batch_media)
-- Phase 4: After 30 days with no issues, drop photoUrl column
ALTER TABLE batches DROP COLUMN photo_url;
ALTER TABLE batches DROP COLUMN media_status;
```

---

## Implementation Phases

### Phase 1: Foundation (MVP - Week 1)
- Schema migration
- Storage service (upload, delete, validation)
- Upload route `/api/upload/media`
- File serving route `/api/media/:id`
- Commands: uploadBatchMedia, deleteBatchMedia
- Unit tests (20 tests)

### Phase 2: Core Features (MVP - Week 2)
- MediaView component (list only)
- Mobile upload interface
- Photography grid query
- Commands: setBatchMediaRole, publishBatchMedia
- Integration tests (8 tests)
- E2E tests (3 tests: mobile upload, publish, desktop upload)

### Phase 3: Advanced (Post-MVP - Week 3)
- MediaDrawer component
- Grid view toggle
- replaceBatchMedia command
- Bulk CSV import
- Retention policy UI + manual trigger
- E2E tests (4 more tests)

### Phase 4: Polish (Post-MVP - Week 4)
- Automated retention cron
- Media history tracking
- Thumbnail optimization (WebP)
- Performance tuning
- Load testing

---

## Testing Strategy

**Total Test Cases: 45**
- Unit tests: 25 (storage service, commands, queries)
- Integration tests: 8 (upload flow, concurrent ops, retention)
- E2E tests: 7 (mobile workflow, desktop upload, grid toggle)
- Mock infrastructure: fs, sharp, test fixtures

See Revision 1 draft for complete test specifications.

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Disk exhaustion | High | Retention policies, disk monitoring |
| Upload performance | Medium | Progress indicators, streaming for videos |
| Mobile Safari HEIC | Medium | Test on real iPhone, auto-convert HEIC→JPEG |
| Race conditions | Medium | Transaction isolation + unique constraints |
| Adoption <30% | High | Mobile UX testing, iterate on feedback |

---

## Acceptance Criteria

**MVP (Phase 1+2):**
- [ ] Photographer uploads photo from mobile in <45sec
- [ ] Photo appears in MediaView with "draft" status
- [ ] Primary photo can be set (unique constraint enforced)
- [ ] File serving requires authentication
- [ ] File validation rejects executables
- [ ] Filename sanitization prevents path traversal
- [ ] 28 unit + integration tests pass
- [ ] Photography accessible via sidebar + quicknav

**Post-MVP (Phase 3+4):**
- [ ] Bulk CSV imports 50 batches in <5min
- [ ] Retention policy deletes old media
- [ ] Grid view toggle works
- [ ] All 45 tests pass

---

## Open Questions (Resolved)

All technical decisions finalized:
- Storage: Env var with default
- HEIC: Sharp with heif support
- Authentication: Session-based (existing pattern)
- Mobile camera: Modal confirmation first
- Role selection: Post-upload
- Thumbnail size: 200x200 / 800x800 (standardized)
- Default view: List (queue-focused)
- Migration: 30-day dual-read before dropping photoUrl

---

## Summary

Photography module transforms from placeholder to first-class feature with:
- **2-week MVP**: Mobile upload + basic management
- **Clean architecture**: Mirrors payment processor pattern
- **Security-first**: File validation, authenticated serving
- **TDD-ready**: 45 test cases specified
- **User-focused**: Measured success criteria tied to personas

Ready for implementation planning.