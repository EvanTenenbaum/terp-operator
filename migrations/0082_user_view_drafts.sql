-- migrations/0082_user_view_drafts.sql
-- UX-A04 / CAP-024 / Execution Decision 2 (docs/ux-audit-2026-06-12.md):
-- Quick Ledger drafts are persisted SERVER-SIDE per user. The client uiStore
-- deliberately keeps ledgerDrafts out of the localStorage partialize because
-- drafts carry counterparty names/amounts (shared-workstation PII rationale,
-- PR #80/#89). This table is therefore the ONLY durable home for drafts.
--
-- Design: one row per (user, view) holding the full draft array as jsonb —
-- drafts are an ephemeral working set (typically < 20 rows), replaced
-- wholesale on each debounced client save, so a single jsonb document is
-- simpler and safer than per-draft rows.

create table if not exists user_view_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  view_key varchar(32) not null default 'quickLedger',
  drafts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Name matches the drizzle definition in src/server/schema.ts; also backs the
-- `on conflict (user_id, view_key)` upsert in routers/queries.ts.
create unique index if not exists user_view_drafts_user_view_uniq
  on user_view_drafts (user_id, view_key);

-- Migration 0080 attached updated_at triggers to tables existing at that
-- time; this table is newer, so attach the shared trigger function here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'user_view_drafts'
      AND action_statement LIKE '%update_updated_at_column%'
  ) THEN
    CREATE TRIGGER set_updated_at_user_view_drafts
      BEFORE UPDATE ON user_view_drafts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
