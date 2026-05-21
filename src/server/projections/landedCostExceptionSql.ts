// #64 PR-2: SQL fragment for the LATERAL projection of the latest successful
// (and not-reversed) `setLineLandedCost` command journal row onto each
// `sales_order_lines` row. Exported as a standalone constant so the load-
// bearing predicates are unit-testable without a Postgres harness (see
// `landedCostExceptionSql.test.ts`).
//
// Predicates (each is load-bearing, see test file for rationale):
//   * `cj.command_name = 'setLineLandedCost'` — only the COGS resolution command.
//   * `cj.status = 'ok'`                       — never include failed attempts.
//   * `cj.reversed_by_command_id is null`      — review I-1: a reversed
//                                                override must drop off the
//                                                projection so the chip clears
//                                                from the line.
//   * `cj.affected_ids @> ARRAY[sol.id::text]` — array-contains lookup,
//                                                answered by the
//                                                `command_journal_affected_ids_gin`
//                                                index from migration 0043.
//   * `order by cj.created_at desc limit 1`    — most recent override wins.
//
// The fragment leaves `sol` as the outer alias the caller binds to its own
// `from sales_order_lines sol` clause.

export const LANDED_COST_EXCEPTION_LATERAL_JOIN_SQL = `left join lateral (
  select cj.result
  from command_journal cj
  where cj.command_name = 'setLineLandedCost'
    and cj.status = 'ok'
    and cj.reversed_by_command_id is null
    and cj.affected_ids @> ARRAY[sol.id::text]
  order by cj.created_at desc
  limit 1
) latest_cogs on true`;
