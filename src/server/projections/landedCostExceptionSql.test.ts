import { describe, it, expect } from 'vitest';
import { LANDED_COST_EXCEPTION_LATERAL_JOIN_SQL } from './landedCostExceptionSql';

// #64 PR-2 review finding I-1 (blocking): the LATERAL projection feeding the
// `salesOrderLines` query must ignore reversed `setLineLandedCost` journal
// rows. Otherwise an operator who reverses a below-range override still sees
// the stale exception chip on the line. We don't have a Postgres harness in
// this repo (per the project's existing TDD pattern), so we lock the
// predicate down as an exported string and pin its contract here.
//
// Tests deliberately avoid pinning whitespace — they pattern-match the
// load-bearing predicates so an unrelated formatting tweak doesn't break us.

describe('LANDED_COST_EXCEPTION_LATERAL_JOIN_SQL (#64 PR-2 / review I-1)', () => {
  const sql = LANDED_COST_EXCEPTION_LATERAL_JOIN_SQL;

  it('joins the command_journal table laterally', () => {
    expect(sql).toMatch(/left\s+join\s+lateral/i);
    expect(sql).toMatch(/from\s+command_journal/i);
  });

  it('filters to the setLineLandedCost command', () => {
    expect(sql).toMatch(/cj\.command_name\s*=\s*'setLineLandedCost'/);
  });

  it('filters to successful (status = ok) command rows only', () => {
    expect(sql).toMatch(/cj\.status\s*=\s*'ok'/);
  });

  it('ignores reversed command rows (I-1)', () => {
    // The blocker: without this predicate, a reverseCommand pointed at a
    // setLineLandedCost row would leave the projection showing a stale
    // exception chip after the override has been undone.
    expect(sql).toMatch(/cj\.reversed_by_command_id\s+is\s+null/i);
  });

  it('uses the GIN-friendly array-contains predicate on affected_ids', () => {
    // `affected_ids @> ARRAY[sol.id::text]` is answered by the
    // command_journal_affected_ids_gin index (migration 0043). Pin the
    // operator so a future re-write to `= any(...)` doesn't silently lose
    // the index.
    expect(sql).toMatch(/cj\.affected_ids\s*@>\s*ARRAY\[\s*sol\.id::text\s*\]/);
  });

  it('selects only the latest row by created_at desc, limit 1', () => {
    expect(sql).toMatch(/order\s+by\s+cj\.created_at\s+desc/i);
    expect(sql).toMatch(/limit\s+1/i);
  });

  it('exposes the journal result blob under a stable alias', () => {
    // The route handler maps `latest_cogs.result` through
    // `projectLandedCostException`. Lock the alias name so a rename
    // doesn't silently break that wiring.
    expect(sql).toMatch(/latest_cogs/);
    expect(sql).toMatch(/select\s+cj\.result/i);
  });
});
