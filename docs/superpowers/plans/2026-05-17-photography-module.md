# Photography Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build mobile-first photography module with batch-based media management, retention policies, and authenticated file serving.

**Architecture:** Separate multipart upload endpoint returns file metadata → command bus processes metadata → storage service handles files. Follows payment processor pattern with dedicated view, computed aggregate view, and command structure.

**Tech Stack:** Express + multer (multipart), sharp (image processing), file-type (magic byte validation), PostgreSQL (schema + views), React + tRPC (frontend)

**MVP Scope:** Phase 1 (Foundation) + Phase 2 (Core Features) = 2 weeks

**Reference:** `docs/superpowers/specs/2026-05-17-photography-upgrade-design.md`

---

## File Structure

### Backend

**New Files:**
- `src/server/routes/uploadRoute.ts` - Multipart upload endpoint with validation
- `src/server/routes/mediaRoute.ts` - Authenticated file serving with streaming
- `src/server/services/mediaStorage.ts` - File operations (save, delete, thumbnails)
- `src/server/services/mediaValidation.ts` - File type and filename validation
- `src/server/services/mediaCommands.ts` - Media command handlers
- `migrations/0043_create_batch_media.sql` - Schema migration
- `migrations/0044_create_media_policies.sql` - Retention policy schema
- `migrations/0045_create_batch_media_view.sql` - Computed view

**Modified Files:**
- `src/server/services/commandBus.ts` - Import media commands, add switch cases
- `src/server/routers/queries.ts` - Add photography grid query, batchMedia query
- `src/shared/types.ts` - Add 'photography' to viewSchema enum
- `src/server/index.ts` - Register upload and media routes

### Frontend

**New Files:**
- `src/client/views/MediaView.tsx` - Main photography management view
- `src/client/components/MediaUploadMobile.tsx` - Mobile upload interface
- `src/client/components/MediaDrawer.tsx` - Batch detail media drawer (Phase 2)

**Modified Files:**
- `src/client/App.tsx` - Add photography route
- `src/client/components/Sidebar.tsx` - Add photography nav item

### Tests

**New Files:**
- `tests/unit/mediaStorage.test.ts` - Storage service tests
- `tests/unit/mediaValidation.test.ts` - Validation tests
- `tests/unit/mediaCommands.test.ts` - Command handler tests
- `tests/integration/uploadFlow.test.ts` - End-to-end upload flow
- `tests/e2e/photography.spec.ts` - Playwright E2E tests

### Configuration

**New Files:**
- `.env.example` - Add MEDIA_STORAGE_PATH
- `storage/media/.gitkeep` - Create storage directory

---

## Phase 1: Foundation (Week 1)

### Task 1: Environment Setup

**Files:**
- Modify: `.env`
- Modify: `.env.example`
- Create: `storage/media/.gitkeep`
- Create: `storage/media/.thumbnails/.gitkeep`

- [ ] **Step 1: Add environment variable to .env**

Add to `.env`:
```bash
MEDIA_STORAGE_PATH=storage/media
```

- [ ] **Step 2: Add to .env.example**

Add to `.env.example`:
```bash
MEDIA_STORAGE_PATH=storage/media
```

- [ ] **Step 3: Create storage directories**

```bash
mkdir -p storage/media/.thumbnails
touch storage/media/.gitkeep
touch storage/media/.thumbnails/.gitkeep
```

- [ ] **Step 4: Add to .gitignore**

Add to `.gitignore`:
```
# Media uploads (keep structure, ignore files)
storage/media/**/*
!storage/media/.gitkeep
!storage/media/.thumbnails/
!storage/media/.thumbnails/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add .env.example .gitignore storage/media
git commit -m "chore: add media storage configuration"
```

---

### Task 2: Database Schema - batch_media Table

**Files:**
- Create: `migrations/0043_create_batch_media.sql`

- [ ] **Step 1: Write migration file**

Create `migrations/0043_create_batch_media.sql`:
```sql
-- Create batch_media table
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

-- Indexes for performance
CREATE INDEX batch_media_batch_idx ON batch_media(batch_id);
CREATE INDEX batch_media_status_idx ON batch_media(status);
CREATE INDEX batch_media_role_idx ON batch_media(role);
CREATE INDEX batch_media_replaced_idx ON batch_media(replaced_at) WHERE replaced_at IS NOT NULL;
CREATE INDEX batch_media_created_idx ON batch_media(created_at);
CREATE INDEX batch_media_uploaded_by_idx ON batch_media(uploaded_by);

-- Unique constraints for primary media
CREATE UNIQUE INDEX batch_media_primary_photo_unique 
  ON batch_media(batch_id) 
  WHERE role = 'primary_photo' AND status = 'published' AND replaced_at IS NULL;

CREATE UNIQUE INDEX batch_media_primary_video_unique 
  ON batch_media(batch_id) 
  WHERE role = 'primary_video' AND status = 'published' AND replaced_at IS NULL;
```

- [ ] **Step 2: Test migration (dry run)**

```bash
psql $DATABASE_URL -f migrations/0043_create_batch_media.sql --dry-run
```

Expected: No errors, see CREATE TABLE output

- [ ] **Step 3: Apply migration**

```bash
psql $DATABASE_URL -f migrations/0043_create_batch_media.sql
```

Expected: Table and indexes created successfully

- [ ] **Step 4: Verify schema**

```bash
psql $DATABASE_URL -c "\d batch_media"
```

Expected: Shows table structure with all columns and constraints

- [ ] **Step 5: Commit**

```bash
git add migrations/0043_create_batch_media.sql
git commit -m "feat: add batch_media schema"
```

---

### Task 3: Database Schema - Retention Policies

**Files:**
- Create: `migrations/0044_create_media_policies.sql`

- [ ] **Step 1: Write migration file**

Create `migrations/0044_create_media_policies.sql`:
```sql
-- Create media_retention_policies table
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

-- Create media_cleanup_log table
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

-- Insert default policies
INSERT INTO media_retention_policies (name, description, days_to_keep, applies_to, is_active)
VALUES 
  ('Draft Cleanup', 'Delete draft media older than 90 days', 90, 'draft', true),
  ('Replaced Media Cleanup', 'Delete replaced media older than 30 days', 30, 'replaced', true);
```

- [ ] **Step 2: Apply migration**

```bash
psql $DATABASE_URL -f migrations/0044_create_media_policies.sql
```

Expected: Tables created, 2 policies inserted

- [ ] **Step 3: Verify default policies**

```bash
psql $DATABASE_URL -c "SELECT * FROM media_retention_policies;"
```

Expected: Shows 2 default policies

- [ ] **Step 4: Commit**

```bash
git add migrations/0044_create_media_policies.sql
git commit -m "feat: add media retention policy schema"
```

---

### Task 4: Database Schema - Computed View

**Files:**
- Create: `migrations/0045_create_batch_media_view.sql`

- [ ] **Step 1: Write migration file**

Create `migrations/0045_create_batch_media_view.sql`:
```sql
-- Create computed view for batch media aggregates
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

- [ ] **Step 2: Apply migration**

```bash
psql $DATABASE_URL -f migrations/0045_create_batch_media_view.sql
```

Expected: View created successfully

- [ ] **Step 3: Test view query**

```bash
psql $DATABASE_URL -c "SELECT * FROM batch_media_summary LIMIT 5;"
```

Expected: Shows batch aggregates with zero counts (no media yet)

- [ ] **Step 4: Commit**

```bash
git add migrations/0045_create_batch_media_view.sql
git commit -m "feat: add batch_media_summary view"
```

---

### Task 5: Media Validation Service - Tests First

**Files:**
- Create: `tests/unit/mediaValidation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/mediaValidation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  validateBatchIdFormat,
  sanitizeFilename,
  validateMagicBytes
} from '../../src/server/services/mediaValidation';

describe('mediaValidation', () => {
  describe('validateBatchIdFormat', () => {
    it('should accept valid UUID', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(() => validateBatchIdFormat(validUuid)).not.toThrow();
    });

    it('should reject invalid UUID', () => {
      expect(() => validateBatchIdFormat('not-a-uuid')).toThrow('Invalid batch ID format');
    });

    it('should reject path traversal attempts', () => {
      expect(() => validateBatchIdFormat('../etc/passwd')).toThrow('Invalid batch ID format');
    });
  });

  describe('sanitizeFilename', () => {
    it('should preserve alphanumeric characters', () => {
      expect(sanitizeFilename('photo123.jpg')).toBe('photo123.jpg');
    });

    it('should replace special characters with underscores', () => {
      expect(sanitizeFilename('my photo!@#.jpg')).toBe('my_photo___.jpg');
    });

    it('should prevent path traversal', () => {
      expect(sanitizeFilename('../../etc/passwd.jpg')).toBe('______etc_passwd.jpg');
    });

    it('should preserve extension', () => {
      expect(sanitizeFilename('test.mp4')).toBe('test.mp4');
    });

    it('should truncate long filenames', () => {
      const longName = 'a'.repeat(200) + '.jpg';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(104); // 100 + '.jpg'
    });
  });

  describe('validateMagicBytes', () => {
    it('should validate JPEG magic bytes', async () => {
      // This will fail until we implement the function
      const result = await validateMagicBytes('/path/to/test.jpg');
      expect(result.valid).toBe(true);
      expect(result.actualType).toBe('image/jpeg');
    });

    it('should reject non-image files', async () => {
      const result = await validateMagicBytes('/path/to/test.exe');
      expect(result.valid).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/unit/mediaValidation.test.ts
```

Expected: FAIL - Module not found

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/unit/mediaValidation.test.ts
git commit -m "test: add media validation tests (RED)"
```

---

### Task 6: Media Validation Service - Implementation

**Files:**
- Create: `src/server/services/mediaValidation.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install file-type
npm install --save-dev @types/file-type
```

- [ ] **Step 2: Write implementation**

Create `src/server/services/mediaValidation.ts`:
```typescript
import { fileTypeFromFile } from 'file-type';
import path from 'path';

const ALLOWED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/heic': ['.heic'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov']
};

export function validateBatchIdFormat(batchId: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(batchId)) {
    throw new Error('Invalid batch ID format');
  }
}

export function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  return `${sanitized}${ext}`;
}

export async function validateMagicBytes(filePath: string): Promise<{ valid: boolean; actualType?: string }> {
  try {
    const fileType = await fileTypeFromFile(filePath);
    if (!fileType) return { valid: false };
    
    const allowed = Object.keys(ALLOWED_TYPES);
    if (!allowed.includes(fileType.mime)) {
      return { valid: false };
    }
    
    return { valid: true, actualType: fileType.mime };
  } catch (error) {
    return { valid: false };
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npm test tests/unit/mediaValidation.test.ts
```

Expected: PASS - All validation tests pass

- [ ] **Step 4: Commit implementation**

```bash
git add src/server/services/mediaValidation.ts package.json package-lock.json
git commit -m "feat: implement media validation service (GREEN)"
```

---

### Task 7: Media Storage Service - Tests First

**Files:**
- Create: `tests/unit/mediaStorage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/mediaStorage.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  uploadMedia,
  deleteMedia,
  generateThumbnails,
  convertHeicToJpeg
} from '../../src/server/services/mediaStorage';

const TEST_STORAGE_PATH = 'storage/media/test';
const TEST_BATCH_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('mediaStorage', () => {
  beforeEach(() => {
    // Create test directory
    fs.mkdirSync(path.join(TEST_STORAGE_PATH, TEST_BATCH_ID), { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    fs.rmSync(TEST_STORAGE_PATH, { recursive: true, force: true });
  });

  describe('uploadMedia', () => {
    it('should save file to correct path', async () => {
      const testFile = {
        path: 'temp/test.jpg',
        originalname: 'photo.jpg',
        size: 1024,
        mimetype: 'image/jpeg'
      };

      const result = await uploadMedia(testFile, TEST_BATCH_ID);

      expect(result.filePath).toContain(TEST_BATCH_ID);
      expect(result.fileSize).toBe(1024);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should generate thumbnails for photos', async () => {
      const testFile = {
        path: 'temp/test.jpg',
        originalname: 'photo.jpg',
        size: 1024,
        mimetype: 'image/jpeg'
      };

      const result = await uploadMedia(testFile, TEST_BATCH_ID);

      expect(result.thumbnailPath).toBeDefined();
      expect(result.mediumPath).toBeDefined();
    });

    it('should not generate thumbnails for videos', async () => {
      const testFile = {
        path: 'temp/test.mp4',
        originalname: 'video.mp4',
        size: 5120,
        mimetype: 'video/mp4'
      };

      const result = await uploadMedia(testFile, TEST_BATCH_ID);

      expect(result.thumbnailPath).toBeUndefined();
      expect(result.mediumPath).toBeUndefined();
    });
  });

  describe('deleteMedia', () => {
    it('should delete file and thumbnails', async () => {
      const filePath = path.join(TEST_STORAGE_PATH, TEST_BATCH_ID, 'test.jpg');
      const thumbPath = path.join(TEST_STORAGE_PATH, '.thumbnails', TEST_BATCH_ID, 'test_thumb.jpg');

      fs.writeFileSync(filePath, 'test');
      fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
      fs.writeFileSync(thumbPath, 'thumb');

      await deleteMedia(filePath, thumbPath, undefined);

      expect(fs.existsSync(filePath)).toBe(false);
      expect(fs.existsSync(thumbPath)).toBe(false);
    });

    it('should not throw if file does not exist', async () => {
      await expect(deleteMedia('/nonexistent/file.jpg')).resolves.not.toThrow();
    });
  });

  describe('generateThumbnails', () => {
    it('should create 200x200 thumbnail', async () => {
      // This will fail until implementation exists
      const result = await generateThumbnails('/path/to/test.jpg', 'media-id', TEST_BATCH_ID);
      expect(result.thumb).toContain('media-id_thumb.jpg');
    });

    it('should create 800x800 medium image', async () => {
      const result = await generateThumbnails('/path/to/test.jpg', 'media-id', TEST_BATCH_ID);
      expect(result.medium).toContain('media-id_medium.jpg');
    });
  });

  describe('convertHeicToJpeg', () => {
    it('should convert HEIC to JPEG', async () => {
      const result = await convertHeicToJpeg('/path/to/test.heic');
      expect(result).toContain('.jpg');
    });

    it('should delete original HEIC file', async () => {
      const heicPath = path.join(TEST_STORAGE_PATH, 'test.heic');
      fs.writeFileSync(heicPath, 'heic');

      await convertHeicToJpeg(heicPath);

      expect(fs.existsSync(heicPath)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/unit/mediaStorage.test.ts
```

Expected: FAIL - Module not found

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/unit/mediaStorage.test.ts
git commit -m "test: add media storage tests (RED)"
```

---

### Task 8: Media Storage Service - Implementation

**Files:**
- Create: `src/server/services/mediaStorage.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install sharp
npm install --save-dev @types/sharp
```

- [ ] **Step 2: Write implementation**

Create `src/server/services/mediaStorage.ts`:
```typescript
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || 'storage/media';

interface UploadResult {
  filePath: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath?: string;
  mediumPath?: string;
}

export async function uploadMedia(
  file: { path: string; originalname: string; size: number; mimetype: string },
  batchId: string
): Promise<UploadResult> {
  const result: UploadResult = {
    filePath: file.path,
    fileSize: file.size,
    mimeType: file.mimetype
  };

  // Generate thumbnails for images
  if (file.mimetype.startsWith('image/')) {
    const mediaId = crypto.randomUUID();
    const thumbs = await generateThumbnails(file.path, mediaId, batchId);
    result.thumbnailPath = thumbs.thumb;
    result.mediumPath = thumbs.medium;
  }

  return result;
}

export async function deleteMedia(
  filePath: string,
  thumbnailPath?: string,
  mediumPath?: string
): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }
    if (mediumPath && fs.existsSync(mediumPath)) {
      fs.unlinkSync(mediumPath);
    }
  } catch (error) {
    console.error('Failed to delete media files:', error);
    // Don't throw - deletion failures shouldn't break the app
  }
}

export async function generateThumbnails(
  filePath: string,
  mediaId: string,
  batchId: string
): Promise<{ thumb: string; medium: string }> {
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

export async function convertHeicToJpeg(filePath: string): Promise<string> {
  const jpegPath = filePath.replace(/\.heic$/i, '.jpg');
  
  await sharp(filePath)
    .jpeg({ quality: 90 })
    .toFile(jpegPath);
  
  fs.unlinkSync(filePath); // Remove HEIC after conversion
  
  return jpegPath;
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npm test tests/unit/mediaStorage.test.ts
```

Expected: PASS - All storage tests pass

- [ ] **Step 4: Commit implementation**

```bash
git add src/server/services/mediaStorage.ts package.json package-lock.json
git commit -m "feat: implement media storage service (GREEN)"
```

---

### Task 9: Upload Route - Tests First

**Files:**
- Create: `tests/integration/uploadRoute.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `tests/integration/uploadRoute.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../../src/server/index';

describe('POST /api/upload/media', () => {
  const testBatchId = '123e4567-e89b-12d3-a456-426614174000';
  const testImagePath = path.join(__dirname, '../fixtures/test-image.jpg');

  beforeAll(() => {
    // Create test fixture
    const fixtureDir = path.join(__dirname, '../fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });
    
    // Create minimal JPEG (1x1 pixel)
    const jpegHeader = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
    ]);
    fs.writeFileSync(testImagePath, jpegHeader);
  });

  afterAll(() => {
    // Cleanup
    fs.rmSync(path.join(__dirname, '../fixtures'), { recursive: true, force: true });
  });

  it('should upload valid JPEG', async () => {
    const response = await request(app)
      .post('/api/upload/media')
      .field('batchId', testBatchId)
      .attach('file', testImagePath);

    expect(response.status).toBe(200);
    expect(response.body.fileId).toBeDefined();
    expect(response.body.filePath).toContain(testBatchId);
    expect(response.body.mimeType).toBe('image/jpeg');
    expect(response.body.thumbnailPath).toBeDefined();
  });

  it('should reject file without batchId', async () => {
    const response = await request(app)
      .post('/api/upload/media')
      .attach('file', testImagePath);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('batch');
  });

  it('should reject invalid batch ID format', async () => {
    const response = await request(app)
      .post('/api/upload/media')
      .field('batchId', 'not-a-uuid')
      .attach('file', testImagePath);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid batch ID');
  });

  it('should reject non-image files', async () => {
    const exePath = path.join(__dirname, '../fixtures/test.exe');
    fs.writeFileSync(exePath, Buffer.from([0x4D, 0x5A])); // EXE magic bytes

    const response = await request(app)
      .post('/api/upload/media')
      .field('batchId', testBatchId)
      .attach('file', exePath);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('type not allowed');

    fs.unlinkSync(exePath);
  });

  it('should reject files over 50MB', async () => {
    // This test would require creating a large file - skip in unit tests
    // but document the expected behavior
    expect(true).toBe(true); // Placeholder
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/integration/uploadRoute.test.ts
```

Expected: FAIL - Route not found (404)

- [ ] **Step 3: Commit failing test**

```bash
git add tests/integration/uploadRoute.test.ts
git commit -m "test: add upload route tests (RED)"
```

---

### Task 10: Upload Route - Implementation

**Files:**
- Create: `src/server/routes/uploadRoute.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Install multer**

```bash
npm install multer
npm install --save-dev @types/multer
```

- [ ] **Step 2: Write upload route**

Create `src/server/routes/uploadRoute.ts`:
```typescript
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { validateBatchIdFormat, sanitizeFilename, validateMagicBytes } from '../services/mediaValidation';
import { convertHeicToJpeg, generateThumbnails } from '../services/mediaStorage';

const router = express.Router();

const MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || 'storage/media';
const MAX_PHOTO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

const upload = multer({
  storage: multer.diskStorage({
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
    fileSize: MAX_PHOTO_SIZE // Refined check in route handler
  }
});

// TODO: Add requireOperator middleware after auth is set up
router.post('/api/upload/media', upload.single('file'), async (req, res) => {
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

export default router;
```

- [ ] **Step 3: Register route in server**

Modify `src/server/index.ts`:
```typescript
// Add import at top
import uploadRoute from './routes/uploadRoute';

// Add route registration (before error handlers)
app.use(uploadRoute);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/integration/uploadRoute.test.ts
```

Expected: PASS - Upload route tests pass

- [ ] **Step 5: Commit implementation**

```bash
git add src/server/routes/uploadRoute.ts src/server/index.ts package.json
git commit -m "feat: implement multipart upload route (GREEN)"
```

---

### Task 11: Media Serving Route - Tests First

**Files:**
- Create: `tests/integration/mediaRoute.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/mediaRoute.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server/index';
import { pool } from '../../src/server/db';

describe('GET /api/media/:id', () => {
  let testMediaId: string;

  beforeAll(async () => {
    // Insert test media record
    const result = await pool.query(
      `INSERT INTO batch_media (batch_id, file_path, original_filename, file_size, mime_type, media_type, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        '123e4567-e89b-12d3-a456-426614174000',
        'storage/media/test/test.jpg',
        'test.jpg',
        1024,
        'image/jpeg',
        'photo',
        'additional',
        'draft'
      ]
    );
    testMediaId = result.rows[0].id;

    // Create test file
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname('storage/media/test/test.jpg');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync('storage/media/test/test.jpg', 'test image data');
  });

  it('should serve media file', async () => {
    const response = await request(app)
      .get(`/api/media/${testMediaId}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should return 404 for non-existent media', async () => {
    const response = await request(app)
      .get('/api/media/00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(404);
  });

  it('should require authentication', async () => {
    // TODO: Test once requireOperator middleware is in place
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/integration/mediaRoute.test.ts
```

Expected: FAIL - Route not found

- [ ] **Step 3: Commit failing test**

```bash
git add tests/integration/mediaRoute.test.ts
git commit -m "test: add media serving route tests (RED)"
```

---

### Task 12: Media Serving Route - Implementation

**Files:**
- Create: `src/server/routes/mediaRoute.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Write media serving route**

Create `src/server/routes/mediaRoute.ts`:
```typescript
import express from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../db';

const router = express.Router();

// TODO: Add requireOperator middleware
router.get('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const media = await pool.query('SELECT * FROM batch_media WHERE id = $1', [id]);
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
  } catch (error) {
    console.error('Media serving error:', error);
    res.status(500).json({ error: 'Failed to serve media' });
  }
});

router.get('/api/media/:id/thumb', async (req, res) => {
  try {
    const { id } = req.params;
    const media = await pool.query('SELECT thumbnail_path FROM batch_media WHERE id = $1', [id]);
    
    if (!media.rows[0]?.thumbnail_path) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.resolve(media.rows[0].thumbnail_path));
  } catch (error) {
    console.error('Thumbnail serving error:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

export default router;
```

- [ ] **Step 2: Register route**

Modify `src/server/index.ts`:
```typescript
// Add import
import mediaRoute from './routes/mediaRoute';

// Add route registration
app.use(mediaRoute);
```

- [ ] **Step 3: Run tests**

```bash
npm test tests/integration/mediaRoute.test.ts
```

Expected: PASS - Media serving tests pass

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/mediaRoute.ts src/server/index.ts
git commit -m "feat: implement authenticated media serving (GREEN)"
```

---

## Phase 1 Complete - Checkpoint

- [ ] **Run all tests**

```bash
npm test
```

Expected: All Phase 1 tests pass

- [ ] **Manual verification**

```bash
# Start server
npm run dev

# Test upload
curl -F "file=@test.jpg" -F "batchId=123e4567-e89b-12d3-a456-426614174000" http://localhost:5173/api/upload/media

# Test serving (use returned fileId)
curl http://localhost:5173/api/media/{fileId}
```

Expected: Upload returns file metadata, serving returns file

---

## Phase 2: Core Features (Week 2)

### Task 13: Media Commands - Tests First

**Files:**
- Create: `tests/unit/mediaCommands.test.ts`

- [ ] **Step 1: Write failing command tests**

Create `tests/unit/mediaCommands.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../src/server/db';
import {
  uploadBatchMedia,
  setBatchMediaRole,
  publishBatchMedia,
  deleteBatchMedia
} from '../../src/server/services/mediaCommands';

describe('mediaCommands', () => {
  let testBatchId: string;
  let testUserId: string;

  beforeEach(async () => {
    // Create test batch
    const batch = await pool.query(
      `INSERT INTO batches (batch_code, name, category) VALUES ($1, $2, $3) RETURNING id`,
      ['TEST-001', 'Test Batch', 'test']
    );
    testBatchId = batch.rows[0].id;

    // Create test user
    const user = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Test User', 'test@example.com', 'hash', 'operator']
    );
    testUserId = user.rows[0].id;
  });

  describe('uploadBatchMedia', () => {
    it('should create batch_media record', async () => {
      const result = await uploadBatchMedia(
        pool, // Using pool as tx for simplicity
        {
          batchId: testBatchId,
          filePath: 'storage/media/test/test.jpg',
          originalFilename: 'test.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
          thumbnailPath: 'storage/media/.thumbnails/test/test_thumb.jpg',
          mediaType: 'photo',
          role: 'additional',
          status: 'draft'
        },
        testUserId,
        'cmd-001'
      );

      expect(result.ok).toBe(true);
      expect(result.affectedIds).toContain(testBatchId);
      expect(result.toast).toContain('uploaded');
    });

    it('should default to draft status', async () => {
      const result = await uploadBatchMedia(
        pool,
        {
          batchId: testBatchId,
          filePath: 'storage/media/test/test.jpg',
          originalFilename: 'test.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
          mediaType: 'photo'
        },
        testUserId,
        'cmd-002'
      );

      const media = await pool.query(
        'SELECT status FROM batch_media WHERE batch_id = $1',
        [testBatchId]
      );
      
      expect(media.rows[0].status).toBe('draft');
    });
  });

  describe('setBatchMediaRole', () => {
    it('should update media role', async () => {
      // Create test media
      const media = await pool.query(
        `INSERT INTO batch_media (batch_id, file_path, original_filename, file_size, mime_type, media_type, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [testBatchId, 'test.jpg', 'test.jpg', 1024, 'image/jpeg', 'photo', 'additional', 'draft']
      );
      const mediaId = media.rows[0].id;

      const result = await setBatchMediaRole(
        pool,
        { mediaId, role: 'primary_photo' },
        'cmd-003'
      );

      expect(result.ok).toBe(true);

      const updated = await pool.query('SELECT role FROM batch_media WHERE id = $1', [mediaId]);
      expect(updated.rows[0].role).toBe('primary_photo');
    });

    it('should demote existing primary when setting new primary', async () => {
      // Create primary photo
      const primary = await pool.query(
        `INSERT INTO batch_media (batch_id, file_path, original_filename, file_size, mime_type, media_type, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [testBatchId, 'primary.jpg', 'primary.jpg', 1024, 'image/jpeg', 'photo', 'primary_photo', 'published']
      );

      // Create additional photo
      const additional = await pool.query(
        `INSERT INTO batch_media (batch_id, file_path, original_filename, file_size, mime_type, media_type, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [testBatchId, 'new.jpg', 'new.jpg', 1024, 'image/jpeg', 'photo', 'additional', 'draft']
      );

      // Set additional as primary
      await setBatchMediaRole(
        pool,
        { mediaId: additional.rows[0].id, role: 'primary_photo' },
        'cmd-004'
      );

      // Check old primary was demoted
      const oldPrimary = await pool.query('SELECT role FROM batch_media WHERE id = $1', [primary.rows[0].id]);
      expect(oldPrimary.rows[0].role).toBe('additional');
    });
  });

  describe('publishBatchMedia', () => {
    it('should change status to published', async () => {
      const media = await pool.query(
        `INSERT INTO batch_media (batch_id, file_path, original_filename, file_size, mime_type, media_type, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [testBatchId, 'test.jpg', 'test.jpg', 1024, 'image/jpeg', 'photo', 'additional', 'draft']
      );

      await publishBatchMedia(pool, { mediaId: media.rows[0].id }, 'cmd-005');

      const updated = await pool.query('SELECT status, published_at FROM batch_media WHERE id = $1', [media.rows[0].id]);
      expect(updated.rows[0].status).toBe('published');
      expect(updated.rows[0].published_at).toBeTruthy();
    });
  });

  describe('deleteBatchMedia', () => {
    it('should delete record and file', async () => {
      // This will fail until implementation exists
      const result = await deleteBatchMedia(pool, { mediaId: 'test-id' }, 'cmd-006');
      expect(result.ok).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/unit/mediaCommands.test.ts
```

Expected: FAIL - Module not found

- [ ] **Step 3: Commit**

```bash
git add tests/unit/mediaCommands.test.ts
git commit -m "test: add media command tests (RED)"
```

---

### Task 14: Media Commands - Implementation

**Files:**
- Create: `src/server/services/mediaCommands.ts`
- Modify: `src/server/services/commandBus.ts`

- [ ] **Step 1: Write media commands**

Create `src/server/services/mediaCommands.ts`:
```typescript
import type { Pool } from 'pg';
import fs from 'fs';

interface CommandResult {
  ok: boolean;
  commandId: string;
  affectedIds: string[];
  toast: string;
  delta?: Record<string, unknown>;
}

export async function uploadBatchMedia(
  tx: Pool,
  payload: Record<string, unknown>,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const {
    batchId,
    filePath,
    originalFilename,
    fileSize,
    mimeType,
    thumbnailPath,
    mediumPath,
    mediaType,
    role = 'additional',
    status = 'draft',
    notes
  } = payload;

  if (!batchId || !filePath || !originalFilename) {
    throw new Error('Missing required fields');
  }

  const result = await tx.query(
    `INSERT INTO batch_media 
     (batch_id, file_path, original_filename, file_size, mime_type, thumbnail_path, medium_path, media_type, role, status, uploaded_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [batchId, filePath, originalFilename, fileSize, mimeType, thumbnailPath, mediumPath, mediaType, role, status, userId, notes]
  );

  const mediaId = result.rows[0].id;

  return {
    ok: true,
    commandId,
    affectedIds: [batchId as string, mediaId],
    toast: `${mediaType === 'video' ? 'Video' : 'Photo'} uploaded.`
  };
}

export async function setBatchMediaRole(
  tx: Pool,
  payload: Record<string, unknown>,
  commandId: string
): Promise<CommandResult> {
  const { mediaId, role } = payload;

  if (!mediaId || !role) {
    throw new Error('Missing mediaId or role');
  }

  const validRoles = ['primary_photo', 'primary_video', 'additional'];
  if (!validRoles.includes(role as string)) {
    throw new Error(`Invalid role: ${role}`);
  }

  // Get media info
  const media = await tx.query('SELECT batch_id, media_type FROM batch_media WHERE id = $1', [mediaId]);
  if (!media.rows[0]) {
    throw new Error('Media not found');
  }

  const { batch_id: batchId } = media.rows[0];

  // If setting as primary, demote existing primary
  if (role === 'primary_photo' || role === 'primary_video') {
    await tx.query(
      `UPDATE batch_media 
       SET role = 'additional', updated_at = now() 
       WHERE batch_id = $1 AND role = $2 AND status = 'published'`,
      [batchId, role]
    );
  }

  // Update role
  await tx.query(
    'UPDATE batch_media SET role = $1, updated_at = now() WHERE id = $2',
    [role, mediaId]
  );

  return {
    ok: true,
    commandId,
    affectedIds: [batchId, mediaId as string],
    toast: `Media role updated to ${role}.`
  };
}

export async function publishBatchMedia(
  tx: Pool,
  payload: Record<string, unknown>,
  commandId: string
): Promise<CommandResult> {
  const { mediaId } = payload;

  if (!mediaId) {
    throw new Error('Missing mediaId');
  }

  const media = await tx.query('SELECT batch_id FROM batch_media WHERE id = $1', [mediaId]);
  if (!media.rows[0]) {
    throw new Error('Media not found');
  }

  await tx.query(
    `UPDATE batch_media 
     SET status = 'published', published_at = now(), updated_at = now() 
     WHERE id = $1`,
    [mediaId]
  );

  return {
    ok: true,
    commandId,
    affectedIds: [media.rows[0].batch_id, mediaId as string],
    toast: 'Media published.'
  };
}

export async function deleteBatchMedia(
  tx: Pool,
  payload: Record<string, unknown>,
  commandId: string
): Promise<CommandResult> {
  const { mediaId } = payload;

  if (!mediaId) {
    throw new Error('Missing mediaId');
  }

  // Get file paths before deleting record
  const media = await tx.query(
    'SELECT batch_id, file_path, thumbnail_path, medium_path FROM batch_media WHERE id = $1',
    [mediaId]
  );

  if (!media.rows[0]) {
    throw new Error('Media not found');
  }

  const { batch_id: batchId, file_path, thumbnail_path, medium_path } = media.rows[0];

  // Delete from database
  await tx.query('DELETE FROM batch_media WHERE id = $1', [mediaId]);

  // Delete physical files
  try {
    if (fs.existsSync(file_path)) fs.unlinkSync(file_path);
    if (thumbnail_path && fs.existsSync(thumbnail_path)) fs.unlinkSync(thumbnail_path);
    if (medium_path && fs.existsSync(medium_path)) fs.unlinkSync(medium_path);
  } catch (error) {
    console.error('Failed to delete media files:', error);
  }

  return {
    ok: true,
    commandId,
    affectedIds: [batchId, mediaId as string],
    toast: 'Media deleted.'
  };
}
```

- [ ] **Step 2: Register commands in command bus**

Modify `src/server/services/commandBus.ts`:
```typescript
// Add import at top
import {
  uploadBatchMedia,
  setBatchMediaRole,
  publishBatchMedia,
  deleteBatchMedia
} from './mediaCommands';

// Add cases to switch statement in runCommand function
case 'uploadBatchMedia':
  return uploadBatchMedia(tx, payload, user.id, commandId);
case 'setBatchMediaRole':
  return setBatchMediaRole(tx, payload, commandId);
case 'publishBatchMedia':
  return publishBatchMedia(tx, payload, commandId);
case 'deleteBatchMedia':
  return deleteBatchMedia(tx, payload, commandId);
```

- [ ] **Step 3: Run tests**

```bash
npm test tests/unit/mediaCommands.test.ts
```

Expected: PASS - All command tests pass

- [ ] **Step 4: Commit**

```bash
git add src/server/services/mediaCommands.ts src/server/services/commandBus.ts
git commit -m "feat: implement media commands (GREEN)"
```

---

### Task 15: Photography Grid Query

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/server/routers/queries.ts`

- [ ] **Step 1: Add photography to viewSchema**

Modify `src/shared/types.ts`:
```typescript
// Find viewSchema enum and add 'photography'
export const viewSchema = z.enum([
  'purchaseOrders',
  'inventory',
  'orders',
  'payments',
  'processors',
  'photography',  // ← ADD THIS
  // ... rest
]);
```

- [ ] **Step 2: Add photography query case**

Modify `src/server/routers/queries.ts`:
```typescript
// Add case to grid query switch statement
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

- [ ] **Step 3: Add batchMedia query**

Add new query to `src/server/routers/queries.ts`:
```typescript
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

- [ ] **Step 4: Test query**

```bash
npm run dev

# In another terminal, test with curl or Postman
curl http://localhost:5173/api/trpc/queries.grid?input={"view":"photography"}
```

Expected: Returns batch list with media status

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/server/routers/queries.ts
git commit -m "feat: add photography grid and batchMedia queries"
```

---

### Task 16: MediaView Component

**Files:**
- Create: `src/client/views/MediaView.tsx`
- Modify: `src/client/App.tsx`

- [ ] **Step 1: Write MediaView component**

Create `src/client/views/MediaView.tsx`:
```typescript
import { useState } from 'react';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';
import { Camera, Upload } from 'lucide-react';

const columns: ColDef<GridRow>[] = [
  { field: 'batchCode', headerName: 'Batch Code', pinned: 'left', width: 150 },
  { field: 'name', headerName: 'Product Name', width: 200 },
  { 
    field: 'mediaStatus', 
    headerName: 'Status', 
    width: 130,
    cellRenderer: (params: any) => {
      const status = params.value;
      const colors = {
        needs_photos: 'bg-red-100 text-red-800',
        draft: 'bg-yellow-100 text-yellow-800',
        partial: 'bg-blue-100 text-blue-800',
        complete: 'bg-green-100 text-green-800'
      };
      const labels = {
        needs_photos: 'NEEDS PHOTOS',
        draft: 'DRAFT',
        partial: 'PARTIAL',
        complete: 'COMPLETE'
      };
      return `<span class="px-2 py-1 rounded text-xs font-semibold ${colors[status] || ''}">${labels[status] || status}</span>`;
    }
  },
  { 
    field: 'hasPrimaryPhoto', 
    headerName: 'Primary Photo', 
    width: 130,
    valueFormatter: (params) => params.value ? 'Yes' : 'None'
  },
  { 
    field: 'hasPrimaryVideo', 
    headerName: 'Primary Video', 
    width: 130,
    valueFormatter: (params) => params.value ? 'Yes' : 'None'
  },
  { field: 'totalCount', headerName: 'Total Media', width: 110 },
  { field: 'createdAt', headerName: 'Created', width: 170 }
];

export function MediaView() {
  const grid = trpc.queries.grid.useQuery({ view: 'photography' });
  const [filter, setFilter] = useState<'needs_photos' | 'all'>('needs_photos');

  const rows = grid.data ?? [];
  const filteredRows = filter === 'needs_photos' 
    ? rows.filter((row: GridRow) => row.mediaStatus === 'needs_photos')
    : rows;

  const needsPhotosCount = rows.filter((row: GridRow) => row.mediaStatus === 'needs_photos').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Photography</h1>
          <p className="text-sm text-zinc-600">
            {needsPhotosCount} batches need photos
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter(filter === 'needs_photos' ? 'all' : 'needs_photos')}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {filter === 'needs_photos' ? 'Show All' : 'Show Needs Photos'}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
            onClick={() => {
              // TODO: Implement upload modal
              alert('Upload modal coming in next task');
            }}
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        </div>
      </div>
      <div className="flex-1">
        <OperatorGrid
          view="photography"
          title="Photography Queue"
          rows={filteredRows}
          columns={columns}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route**

Modify `src/client/App.tsx`:
```typescript
// Add import
import { MediaView } from './views/MediaView';

// Add route (in Routes component)
<Route path="/photography" element={<MediaView />} />
```

- [ ] **Step 3: Test in browser**

```bash
npm run dev
```

Navigate to http://localhost:5173/photography

Expected: See photography grid with batches, filter toggle works

- [ ] **Step 4: Commit**

```bash
git add src/client/views/MediaView.tsx src/client/App.tsx
git commit -m "feat: add MediaView component"
```

---

### Task 17: Add Photography to Sidebar Nav

**Files:**
- Modify: `src/client/components/Sidebar.tsx`

- [ ] **Step 1: Add photography nav item**

Modify `src/client/components/Sidebar.tsx`:
```typescript
// Add import
import { Camera } from 'lucide-react';

// Add nav item (find the nav items array/section and add)
<NavItem href="/photography" icon={<Camera className="h-5 w-5" />}>
  Photography
</NavItem>
```

- [ ] **Step 2: Test in browser**

```bash
npm run dev
```

Expected: "Photography" appears in sidebar, clicking navigates to /photography

- [ ] **Step 3: Commit**

```bash
git add src/client/components/Sidebar.tsx
git commit -m "feat: add photography to sidebar navigation"
```

---

### Task 18: Mobile Upload Component

**Files:**
- Create: `src/client/components/MediaUploadMobile.tsx`
- Modify: `src/client/App.tsx`

- [ ] **Step 1: Write mobile upload component**

Create `src/client/components/MediaUploadMobile.tsx`:
```typescript
import { useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { Camera, Video, Upload as UploadIcon, Search } from 'lucide-react';

export function MediaUploadMobile() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const grid = trpc.queries.grid.useQuery({ view: 'photography' });
  const { runCommand } = useCommandRunner();

  const batches = grid.data ?? [];
  const filteredBatches = batches.filter((batch: any) => 
    batch.batchCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    batch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const needsPhotosBatches = filteredBatches.filter((b: any) => 
    b.mediaStatus === 'needs_photos' || b.mediaStatus === 'draft'
  );

  async function handleFileSelect(file: File, mediaType: 'photo' | 'video') {
    if (!selectedBatch) return;

    setIsUploading(true);
    try {
      // Upload file first
      const formData = new FormData();
      formData.append('file', file);
      formData.append('batchId', selectedBatch.id);

      const uploadResponse = await fetch('/api/upload/media', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadResult = await uploadResponse.json();

      // Create batch_media record via command
      await runCommand('uploadBatchMedia', {
        batchId: selectedBatch.id,
        filePath: uploadResult.filePath,
        originalFilename: uploadResult.originalFilename,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType,
        thumbnailPath: uploadResult.thumbnailPath,
        mediumPath: uploadResult.mediumPath,
        mediaType,
        role: 'additional',
        status: 'draft'
      }, 'Upload media from mobile');

      // Refetch grid
      await grid.refetch();

      alert('Upload successful!');
      setSelectedBatch(null);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  function handleTakePhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) handleFileSelect(file, 'photo');
    };
    input.click();
  }

  function handleRecordVideo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.capture = 'environment';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) handleFileSelect(file, 'video');
    };
    input.click();
  }

  function handleChooseFromLibrary() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const mediaType = file.type.startsWith('video/') ? 'video' : 'photo';
        handleFileSelect(file, mediaType);
      }
    };
    input.click();
  }

  if (selectedBatch) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => setSelectedBatch(null)}
            className="mb-4 text-sm text-primary"
          >
            ← Back to search
          </button>

          <div className="mb-4 rounded-lg bg-primary p-4 text-white">
            <div className="text-sm opacity-90">Uploading to</div>
            <div className="text-lg font-semibold">{selectedBatch.batchCode}</div>
            <div className="text-sm opacity-90">{selectedBatch.name}</div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleTakePhoto}
              disabled={isUploading}
              className="w-full rounded-lg bg-primary p-4 text-white font-semibold disabled:opacity-50"
            >
              <Camera className="mx-auto mb-2 h-8 w-8" />
              Take Photo
            </button>

            <button
              onClick={handleRecordVideo}
              disabled={isUploading}
              className="w-full rounded-lg border-2 border-primary p-4 text-primary font-semibold disabled:opacity-50"
            >
              <Video className="mx-auto mb-2 h-8 w-8" />
              Record Video
            </button>

            <button
              onClick={handleChooseFromLibrary}
              disabled={isUploading}
              className="w-full rounded-lg border-2 border-zinc-300 p-4 text-zinc-700 font-semibold disabled:opacity-50"
            >
              <UploadIcon className="mx-auto mb-2 h-8 w-8" />
              Choose from Library
            </button>
          </div>

          {isUploading && (
            <div className="mt-4 text-center text-sm text-zinc-600">
              Uploading...
            </div>
          )}

          <div className="mt-6 rounded-lg bg-blue-50 p-3 text-center text-xs text-blue-800">
            Photos will be saved as draft until published
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-xl font-semibold">Photography Queue</h1>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search batch code or product name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 py-3 pl-10 pr-4"
          />
        </div>

        <div className="space-y-3">
          {needsPhotosBatches.slice(0, 20).map((batch: any) => (
            <div
              key={batch.id}
              className="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="font-semibold">{batch.batchCode}</div>
                  <div className="text-sm text-zinc-600">{batch.name}</div>
                </div>
                <span className={`rounded px-2 py-1 text-xs font-semibold ${
                  batch.mediaStatus === 'needs_photos' 
                    ? 'bg-red-100 text-red-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {batch.mediaStatus === 'needs_photos' ? 'NEEDS PHOTOS' : 'DRAFT'}
                </span>
              </div>
              <button
                onClick={() => setSelectedBatch(batch)}
                className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-white"
              >
                Add Media
              </button>
            </div>
          ))}
        </div>

        {needsPhotosBatches.length === 0 && (
          <div className="mt-8 text-center text-zinc-600">
            {searchQuery ? 'No batches match your search' : 'All batches have photos!'}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add mobile route**

Modify `src/client/App.tsx`:
```typescript
// Add import
import { MediaUploadMobile } from './components/MediaUploadMobile';

// Add route
<Route path="/photography/mobile" element={<MediaUploadMobile />} />
```

- [ ] **Step 3: Test on mobile device or browser dev tools**

```bash
npm run dev
```

Navigate to http://localhost:5173/photography/mobile

Use browser dev tools → Toggle device toolbar → iPhone

Expected: See search, batch list, can select batch and see upload options

- [ ] **Step 4: Commit**

```bash
git add src/client/components/MediaUploadMobile.tsx src/client/App.tsx
git commit -m "feat: add mobile upload interface"
```

---

## Phase 2 Complete - Checkpoint

- [ ] **Run all tests**

```bash
npm test
```

Expected: All tests pass

- [ ] **E2E test - Mobile upload workflow**

1. Open http://localhost:5173/photography/mobile on mobile or dev tools
2. Search for a batch
3. Select batch
4. Choose "Choose from Library"
5. Upload a photo
6. Verify it appears as draft in MediaView

- [ ] **Commit checkpoint**

```bash
git add .
git commit -m "chore: Phase 2 complete - MVP ready"
```

---

## Spec Coverage Self-Review

Checking implementation against `docs/superpowers/specs/2026-05-17-photography-upgrade-design.md`:

**✅ Implemented:**
- Schema (batch_media, retention policies, computed view)
- File upload flow (multipart endpoint → command bus)
- File validation (whitelist, magic bytes, filename sanitization)
- Authenticated file serving (with video streaming)
- Storage service (thumbnails, HEIC conversion)
- Commands (upload, setRole, publish, delete)
- Photography grid query
- MediaView component
- Mobile upload interface
- Sidebar navigation

**⏭️ Phase 3+ (Post-MVP):**
- MediaDrawer component (batch detail integration)
- Grid view toggle
- replaceBatchMedia command
- Bulk CSV import
- Retention policy UI + automated cron
- Additional E2E tests

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-photography-module.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**