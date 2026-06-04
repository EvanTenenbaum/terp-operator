// scripts/detect-merge-candidates.ts
//
// Scheduled entrypoint for contact merge-candidate detection.
//
// Scans the contacts table for potential duplicate pairs and inserts them into
// the contact_merge_candidates table for operator review. This job is designed
// to be run on a schedule (daily recommended) to catch newly-introduced
// duplicates as the contact list grows.
//
// Detection rules:
//   1. Phone match — same phone (exact) or cross-match with secondary_phone
//   2. Email match — same email (case-insensitive)
//   3. Name match  — same name (case-insensitive, trimmed)
//
// Each pair is canonically ordered (contact_a_id < contact_b_id) and the
// UNIQUE index on (contact_a_id, contact_b_id) prevents duplicate inserts
// in case of races or re-runs.
//
// Reviewed and dismissed candidates are NOT re-inserted — the NOT EXISTS
// guards skip any pair that already appears in the table regardless of
// status.
//
// Usage:
//   pnpm cron:detect-merges
//
// Exits 0 on success, 1 on failure.

import { pool } from '../src/server/db';

interface DetectionResult {
  rule: string;
  candidatesFound: number;
}

async function main(): Promise<void> {
  const now = new Date();
  const results: DetectionResult[] = [];

  // ── Phone match: primary ↔ primary ──────────────────────────────────
  {
    const result = await pool.query(
      `INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
       SELECT a.id, b.id, 'phone_match'
       FROM contacts a
       JOIN contacts b ON a.phone = b.phone AND a.id < b.id
       WHERE a.phone IS NOT NULL
         AND b.phone IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM contact_merge_candidates cmc
           WHERE (cmc.contact_a_id = a.id AND cmc.contact_b_id = b.id)
              OR (cmc.contact_a_id = b.id AND cmc.contact_b_id = a.id)
         )
       ON CONFLICT (contact_a_id, contact_b_id) DO NOTHING`
    );
    results.push({ rule: 'phone_match', candidatesFound: result.rowCount ?? 0 });
  }

  // ── Phone match: primary ↔ secondary ────────────────────────────────
  {
    const result = await pool.query(
      `INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
       SELECT a.id, b.id, 'phone_cross_match'
       FROM contacts a
       JOIN contacts b ON a.phone = b.secondary_phone AND a.id < b.id
       WHERE a.phone IS NOT NULL
         AND b.secondary_phone IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM contact_merge_candidates cmc
           WHERE (cmc.contact_a_id = a.id AND cmc.contact_b_id = b.id)
              OR (cmc.contact_a_id = b.id AND cmc.contact_b_id = a.id)
         )
       ON CONFLICT (contact_a_id, contact_b_id) DO NOTHING`
    );
    results.push({ rule: 'phone_cross_match', candidatesFound: result.rowCount ?? 0 });
  }

  // ── Email match ─────────────────────────────────────────────────────
  {
    const result = await pool.query(
      `INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
       SELECT a.id, b.id, 'email_match'
       FROM contacts a
       JOIN contacts b ON lower(a.email) = lower(b.email) AND a.id < b.id
       WHERE a.email IS NOT NULL
         AND b.email IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM contact_merge_candidates cmc
           WHERE (cmc.contact_a_id = a.id AND cmc.contact_b_id = b.id)
              OR (cmc.contact_a_id = b.id AND cmc.contact_b_id = a.id)
         )
       ON CONFLICT (contact_a_id, contact_b_id) DO NOTHING`
    );
    results.push({ rule: 'email_match', candidatesFound: result.rowCount ?? 0 });
  }

  // ── Name match ──────────────────────────────────────────────────────
  {
    const result = await pool.query(
      `INSERT INTO contact_merge_candidates (contact_a_id, contact_b_id, match_reason)
       SELECT a.id, b.id, 'name_match'
       FROM contacts a
       JOIN contacts b ON lower(trim(a.name)) = lower(trim(b.name)) AND a.id < b.id
       WHERE NOT EXISTS (
           SELECT 1 FROM contact_merge_candidates cmc
           WHERE (cmc.contact_a_id = a.id AND cmc.contact_b_id = b.id)
              OR (cmc.contact_a_id = b.id AND cmc.contact_b_id = a.id)
         )
       ON CONFLICT (contact_a_id, contact_b_id) DO NOTHING`
    );
    results.push({ rule: 'name_match', candidatesFound: result.rowCount ?? 0 });
  }

  const totalFound = results.reduce((s, r) => s + r.candidatesFound, 0);

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'detect_merge_candidates_complete',
      runAt: now.toISOString(),
      totalCandidatesFound: totalFound,
      rules: results
    })
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'detect_merge_candidates_failed',
        error: err instanceof Error ? err.message : String(err)
      })
    );
    try {
      await pool.end();
    } catch {
      // Ignore pool-shutdown errors during a failed run.
    }
    process.exit(1);
  });
