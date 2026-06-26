import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';
import { pool } from '../db';

function customerNeedsSql() {
  return `select cn.id, cn.customer_id as "customerId", c.name as customer,
    cn.product_name as "productName", cn.category, cn.tags,
    cn.notes as description, cn.qty_min as "qtyMin", cn.qty_max as "qtyMax",
    cn.target_price as "targetPrice", cn.needed_by as "neededBy",
    cn.urgency, cn.status, cn.created_at as "createdAt"
  from customer_needs cn
  join customers c on c.id = cn.customer_id
  order by case cn.urgency when 'urgent' then 0 when 'normal' then 1 when 'low' then 2 else 3 end,
           cn.created_at desc`;
}

function vendorSupplySql() {
  return `select vs.id, vs.vendor_id as "vendorId", v.name as vendor,
    vs.product_name as "productName", vs.category, vs.tags,
    vs.notes as description, vs.available_qty as "availableQty",
    vs.available_date as "availableDate", vs.status,
    vs.created_at as "createdAt"
  from vendor_supply vs
  join vendors v on v.id = vs.vendor_id
  where vs.status = 'open'
  order by vs.available_date asc nulls last,
           vs.created_at desc`;
}

function matchmakingSql() {
  return `select mm.id,
    mm.customer_need_id as "customerNeedId",
    cn.customer_id as "customerId", 
    c.name as customer,
    cn.product_name as "needProduct", cn.category as "needCategory",
    cn.tags as "needTags",
    cn.qty_min as "qtyMin", cn.qty_max as "qtyMax",
    cn.target_price as "targetPrice", cn.needed_by as "neededBy",
    cn.urgency,
    vs.id as "supplyId",
    vs.vendor_id as "vendorId", v.name as vendor,
    vs.product_name as "vendorProduct", vs.tags as "supplyTags",
    vs.available_qty as "availableQty",
    vs.available_date as "availableDate",
    mm.score, mm.reasons, mm.status, mm.created_at as "createdAt"
  from matchmaking_matches mm
  join customer_needs cn on cn.id = mm.customer_need_id
  join customers c on c.id = cn.customer_id
  join vendor_supply vs on vs.id = mm.vendor_supply_id
  join vendors v on v.id = vs.vendor_id
  order by case mm.status when 'open' then 0 when 'accepted' then 1 when 'dismissed' then 2 else 3 end,
           mm.created_at desc`;
}

/**
 * Matchmaking query router.
 *
 * Domain: matchmaking board, settings, opportunities, and entity counts.
 * Extracted from queries.ts during the router decomposition
 * (see docs/decisions/0001-domain-module-architecture.md).
 */
export const matchmakingRouter = router({
  matchmakingBoard: protectedProcedure.query(async () => {
    const [needs, supplies, matches] = await Promise.all([
      pool.query(customerNeedsSql()),
      pool.query(vendorSupplySql()),
      pool.query(matchmakingSql())
    ]);
    return { needs: needs.rows, supplies: supplies.rows, matches: matches.rows };
  }),

  matchmakingSettings: protectedProcedure.query(async () => {
    const [row] = (await pool.query(
      `select
         match_quality_floor as "matchQualityFloor",
         work_queue_threshold as "workQueueThreshold",
         history_lookback_days as "historyLookbackDays",
         repeat_threshold as "repeatThreshold",
         gap_floor_qty as "gapFloorQty",
         show_clients_column as "showClientsColumn",
         show_vendors_column as "showVendorsColumn",
         work_queue_enabled as "workQueueEnabled"
       from matchmaking_settings
       limit 1`
    )).rows;
    return row ?? {
      matchQualityFloor: 35,
      workQueueThreshold: 75,
      historyLookbackDays: 90,
      repeatThreshold: 3,
      gapFloorQty: 0,
      showClientsColumn: false,
      showVendorsColumn: false,
      workQueueEnabled: true,
    };
  }),

  matchmakingOpportunities: protectedProcedure.query(async () => {
    const [settingsRow] = (await pool.query('select * from matchmaking_settings limit 1')).rows;
    const settings = settingsRow ?? { history_lookback_days: 90, repeat_threshold: 3, gap_floor_qty: 0 };
    const lookback = Number(settings.history_lookback_days);
    const repeatThreshold = Number(settings.repeat_threshold);
    const gapFloor = Number(settings.gap_floor_qty);

    // Leg 2: Inventory to move
    const toMoveResult = await pool.query(
      `with in_stock as (
         select b.id as batch_id,
                b.name as product,
                b.category,
                b.available_qty as on_hand
         from batches b
         where b.status in ('processed', 'available', 'ready')
           and b.available_qty > 0
       ),
       customer_history as (
         select b2.category,
                so.customer_id,
                c.name as customer_name,
                count(*) as purchase_count,
                max(so.created_at) as last_activity
         from sales_order_lines sol
         join batches b2 on b2.id = sol.batch_id
         join sales_orders so on so.id = sol.order_id
         join customers c on c.id = so.customer_id
         where so.created_at > now() - ($1 || ' days')::interval
           and so.status not in ('cancelled', 'void')
           and sol.batch_id is not null
         group by b2.category, so.customer_id, c.name
       ),
       posted_needs as (
         select cn.customer_id,
                cu.name as customer_name,
                cn.category,
                cn.id as need_id,
                cn.product_name as need_product,
                cn.target_price
         from customer_needs cn
         join customers cu on cu.id = cn.customer_id
         where cn.status = 'open'
       ),
       already_matched as (
         select cn.customer_id, cn.category
         from matchmaking_matches mm
         join customer_needs cn on cn.id = mm.customer_need_id
         where mm.status = 'accepted'
       )
       select
         s.batch_id as "batchId",
         s.product,
         s.category,
         s.on_hand as "onHand",
         coalesce(pn.customer_id, ch.customer_id) as "customerId",
         coalesce(pn.customer_name, ch.customer_name) as customer,
         case
           when pn.customer_id is not null and ch.purchase_count >= $2 then 'both'
           when pn.customer_id is not null then 'need'
           else 'history'
         end as signal,
         coalesce(ch.last_activity, now()) as "lastActivity",
         coalesce(ch.purchase_count, 0) as "purchaseCount"
       from in_stock s
       left join posted_needs pn on pn.category = s.category
       left join customer_history ch
         on ch.category = s.category
         and (pn.customer_id is null or ch.customer_id = pn.customer_id)
         and ch.purchase_count >= $2
       where (pn.customer_id is not null or ch.customer_id is not null)
         and not exists (
           select 1 from already_matched am
           where am.customer_id = coalesce(pn.customer_id, ch.customer_id)
             and am.category = s.category
         )
         and not exists (
           select 1 from command_journal cj
           where cj.command_name in ('noteMatchmakingOutreach', 'dismissMatchmakingWorkQueueItem')
             and cj.input_payload->>'entityType' = 'customer'
             and (cj.input_payload->>'entityId')::uuid = coalesce(pn.customer_id, ch.customer_id)
             and cj.input_payload->>'context' = s.category
             and cj.created_at > now() - interval '30 days'
         )
       order by
         case when pn.customer_id is not null and ch.purchase_count >= $2 then 0
              when pn.customer_id is not null then 1
              else 2 end,
         ch.last_activity desc nulls last
       limit 25`,
      [lookback, repeatThreshold]
    );

    // Leg 3: Gaps to fill
    const toSourceResult = await pool.query(
      `with inventory_by_category as (
         select coalesce(b.category, 'Unknown') as category,
                sum(b.available_qty) as on_hand
         from batches b
         where b.status in ('processed', 'available', 'ready')
         group by b.category
       ),
       gaps as (
         select category, on_hand
         from inventory_by_category
         where on_hand <= $1
       ),
       vendor_history as (
         select pol.category,
                po.vendor_id,
                v.name as vendor_name,
                count(*) as supply_count,
                max(po.created_at) as last_activity
         from purchase_order_lines pol
         join purchase_orders po on po.id = pol.purchase_order_id
         join vendors v on v.id = po.vendor_id
         where po.created_at > now() - ($2 || ' days')::interval
           and po.status not in ('cancelled', 'void')
         group by pol.category, po.vendor_id, v.name
       ),
       posted_supply as (
         select vs.vendor_id,
                ve.name as vendor_name,
                vs.category,
                vs.available_qty as posted_qty,
                vs.available_date
         from vendor_supply vs
         join vendors ve on ve.id = vs.vendor_id
         where vs.status = 'open'
       ),
       snoozed_vendors as (
         select (input_payload->>'entityId')::uuid as vendor_id,
                input_payload->>'context' as category
         from command_journal
         where command_name in ('noteMatchmakingOutreach', 'dismissMatchmakingWorkQueueItem')
           and input_payload->>'entityType' = 'vendor'
           and created_at > now() - interval '30 days'
       )
       select
         g.category,
         g.on_hand as "onHand",
         case when g.on_hand = 0 then 'empty' else 'low' end as "gapLevel",
         coalesce(ps.vendor_id, vh.vendor_id) as "vendorId",
         coalesce(ps.vendor_name, vh.vendor_name) as vendor,
         case
           when ps.vendor_id is not null and vh.supply_count >= $3 then 'both'
           when ps.vendor_id is not null then 'supply'
           else 'history'
         end as signal,
         coalesce(vh.last_activity, now()) as "lastActivity",
         ps.posted_qty as "postedQty"
       from gaps g
       left join posted_supply ps on ps.category = g.category
       left join vendor_history vh
         on vh.category = g.category
         and (ps.vendor_id is null or vh.vendor_id = ps.vendor_id)
         and vh.supply_count >= $3
       where (ps.vendor_id is not null or vh.vendor_id is not null)
         and not exists (
           select 1 from snoozed_vendors sv
           where sv.vendor_id = coalesce(ps.vendor_id, vh.vendor_id)
             and sv.category = g.category
         )
       order by
         case when g.on_hand = 0 then 0 else 1 end,
         case when ps.vendor_id is not null and vh.supply_count >= $3 then 0
              when ps.vendor_id is not null then 1
              else 2 end
       limit 25`,
      [gapFloor, lookback, repeatThreshold]
    );

    return { toMove: toMoveResult.rows, toSource: toSourceResult.rows };
  }),

  matchmakingEntityCounts: protectedProcedure.query(async () => {
    const [settings] = (await pool.query(
      'select show_clients_column as "showClientsColumn", show_vendors_column as "showVendorsColumn" from matchmaking_settings limit 1'
    )).rows;

    if (!settings?.showClientsColumn && !settings?.showVendorsColumn) {
      return { customers: {}, vendors: {} };
    }

    const [customerCounts, vendorCounts] = await Promise.all([
      settings.showClientsColumn
        ? pool.query(`
            select cn.customer_id as id,
                   count(distinct cn.id) filter (where cn.status = 'open') as needs,
                   count(distinct mm.id) filter (where mm.status = 'accepted') as matches
            from customer_needs cn
            left join matchmaking_matches mm on mm.customer_need_id = cn.id
            group by cn.customer_id
          `)
        : Promise.resolve({ rows: [] }),
      settings.showVendorsColumn
        ? pool.query(`
            select vendor_id as id,
                   count(*) filter (where status = 'open') as supply
            from vendor_supply
            group by vendor_id
          `)
        : Promise.resolve({ rows: [] }),
    ]);

    const customers: Record<string, { needs: number; matches: number }> = {};
    for (const row of customerCounts.rows as Array<{ id: string; needs: string; matches: string }>) {
      customers[row.id] = { needs: Number(row.needs), matches: Number(row.matches) };
    }

    const vendors: Record<string, { supply: number }> = {};
    for (const row of vendorCounts.rows as Array<{ id: string; supply: string }>) {
      vendors[row.id] = { supply: Number(row.supply) };
    }

    return { customers, vendors };
  }),
});
