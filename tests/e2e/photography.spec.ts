import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://terp_agro:terp_agro@localhost:55432/terp_agro';

let pool: Pool | null = null;
let seededBatchId: string | null = null;
let seededBatchCode: string | null = null;
let seededMediaId: string | null = null;
let ownerUserId: string | null = null;

async function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

test.beforeAll(async () => {
  const db = await getPool();
  const batchRes = await db.query(
    "select id, batch_code from batches where archived_at is null order by created_at asc limit 1"
  );
  if (batchRes.rows.length === 0) {
    throw new Error('No unarchived batch found for e2e setup');
  }
  seededBatchId = batchRes.rows[0].id as string;
  seededBatchCode = batchRes.rows[0].batch_code as string;

  const userRes = await db.query(
    "select id from users where email='owner@terpagro.local' limit 1"
  );
  if (userRes.rows.length === 0) {
    throw new Error('Owner user not found for e2e setup');
  }
  ownerUserId = userRes.rows[0].id as string;

  seededMediaId = randomUUID();
  const filename = `e2e-photo-lifecycle-${Date.now()}.jpg`;
  await db.query(
    `insert into batch_media (
      id, batch_id, file_path, original_filename, file_size, mime_type,
      media_type, role, status, uploaded_by
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      seededMediaId,
      seededBatchId,
      `/tmp/terp-e2e/${seededMediaId}.jpg`,
      filename,
      1,
      'image/jpeg',
      'photo',
      'additional',
      'draft',
      ownerUserId
    ]
  );
});

test.afterAll(async () => {
  const db = await getPool();
  if (seededMediaId) {
    await db.query('delete from batch_media where id = $1', [seededMediaId]);
  }
  await db.end();
  pool = null;
});

async function waitForBackend(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await page.request.get('/api/health')).ok(), { timeout: 45_000 }).toBe(true);
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('owner@terpagro.local');
  await page.getByLabel('Password').fill('terp-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
}

async function openPhotography(page: import('@playwright/test').Page) {
  const gridResponse = page.waitForResponse(
    (res) => res.url().includes('/trpc') && res.url().includes('queries.grid') && res.ok()
  );
  await page.goto('/photography');
  await gridResponse;
}

test('photography queue is accessible and shows grid', async ({ page }) => {
  test.setTimeout(120_000);
  await waitForBackend(page);
  await signIn(page);

  await openPhotography(page);

  await expect(page.getByRole('heading', { name: 'Photography Queue' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Photography Queue \d+ row/ })).toBeVisible();
  await expect(page.locator('.ag-root:visible').first()).toBeVisible();
});

test('mobile upload route is reachable and shows upload UI', async ({ page }) => {
  test.setTimeout(120_000);
  await waitForBackend(page);
  await signIn(page);

  if (!seededBatchId) throw new Error('seededBatchId missing');
  await page.goto(`/photography/mobile/${seededBatchId}`);
  await expect(page.getByRole('heading', { name: 'Mobile Media Upload' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take Photo/Video' })).toBeVisible();
});

test('selecting a queue row shows Batch Media panel or select placeholder transitions', async ({ page }) => {
  test.setTimeout(120_000);
  await waitForBackend(page);
  await signIn(page);

  await openPhotography(page);
  await expect(page.getByRole('heading', { name: 'Photography Queue' })).toBeVisible();

  // If no row is selected, a placeholder should be visible
  await expect(page.getByText(/select a batch to manage its media/i)).toBeVisible();

  // Filter to the seeded batch so the row is deterministically visible
  await page.getByPlaceholder('Filter grid').fill(seededBatchCode ?? '');
  await page.waitForTimeout(300);

  // The seeded DB contains batches; click the first row to open the Batch Media panel
  const firstRow = page.locator('.ag-root .ag-row').first();
  await expect(firstRow).toBeVisible();
  const mediaListResponse = page.waitForResponse(
    (res) => res.url().includes('/trpc/queries.batchMediaList') && res.status() === 200
  );
  await firstRow.locator('.ag-cell').first().click();
  await mediaListResponse;
  await expect(page.getByText('Batch Media')).toBeVisible();
});

test('mobile handoff affordance exists for selected row', async ({ page }) => {
  test.setTimeout(120_000);
  await waitForBackend(page);
  await signIn(page);

  await openPhotography(page);
  await expect(page.getByRole('heading', { name: 'Photography Queue' })).toBeVisible();

  // Filter to the seeded batch so the row is deterministically visible
  await page.getByPlaceholder('Filter grid').fill(seededBatchCode ?? '');
  await page.waitForTimeout(300);

  const firstRow = page.locator('.ag-root .ag-row').first();
  await expect(firstRow).toBeVisible();
  const mediaListResponse = page.waitForResponse(
    (res) => res.url().includes('/trpc/queries.batchMediaList') && res.status() === 200
  );
  await firstRow.locator('.ag-cell').first().click();
  await mediaListResponse;
  // The selection summary or detail panel should expose a mobile handoff
  const handoff = page.getByRole('button', { name: /copy mobile upload link|open mobile upload/i }).first();
  await expect(handoff).toBeVisible();
});

test('batch media lifecycle: set primary, publish, delete', async ({ page }) => {
  test.setTimeout(120_000);
  if (!seededBatchId || !seededBatchCode) throw new Error('Lifecycle test requires seeded batch');

  await waitForBackend(page);
  await signIn(page);

  await openPhotography(page);
  await expect(page.getByRole('heading', { name: 'Photography Queue' })).toBeVisible();

  // Filter to the seeded batch so the row is deterministically visible
  await page.getByPlaceholder('Filter grid').fill(seededBatchCode);
  await page.waitForTimeout(300);

  // Find and click the row containing the seeded batch code
  const rowLocator = page.locator('.ag-root .ag-row').filter({ hasText: seededBatchCode });
  await expect(rowLocator).toBeVisible();

  const mediaListResponse = page.waitForResponse(
    (res) => res.url().includes('/trpc/queries.batchMediaList') && res.status() === 200
  );
  await rowLocator.locator('.ag-cell').first().click();
  await mediaListResponse;

  // Assert Batch Media panel, seeded filename, draft, additional visible
  await expect(page.getByText('Batch Media')).toBeVisible();
  const filename = await (async () => {
    const db = await getPool();
    const res = await db.query('select original_filename from batch_media where id = $1', [seededMediaId]);
    return res.rows[0]?.original_filename as string;
  })();
  const mediaTable = page.locator('.finder-table-wrap');
  await expect(mediaTable.getByText(filename)).toBeVisible();
  await expect(mediaTable.getByText('draft')).toBeVisible();
  await expect(mediaTable.getByText('additional')).toBeVisible();

  // Set primary photo
  const setPrimaryResponse = page.waitForResponse(
    (res) => res.url().includes('/trpc') && res.status() === 200
  );
  await page.getByRole('button', { name: /set primary photo/i }).click();
  await setPrimaryResponse;
  await expect(mediaTable.getByText('primary_photo')).toBeVisible();

  // Publish
  const publishResponse = page.waitForResponse(
    (res) => res.url().includes('/trpc') && res.status() === 200
  );
  await page.getByRole('button', { name: /publish/i }).click();
  await publishResponse;
  await expect(mediaTable.getByText('published')).toBeVisible();

  // Delete (two-step confirm)
  const deleteResponse = page.waitForResponse(
    (res) => res.url().includes('/trpc') && res.status() === 200
  );
  await page.getByRole('button', { name: /delete/i }).click();
  await page.getByRole('button', { name: /confirm delete/i }).click();
  await deleteResponse;
  await expect(mediaTable.getByText(filename)).not.toBeVisible();
});
