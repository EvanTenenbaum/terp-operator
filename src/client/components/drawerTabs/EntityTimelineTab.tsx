import { useNavigate } from 'react-router-dom';
import { Banknote, Camera, Clipboard, Link2, Package, PackageCheck, TerminalSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { trpc } from '../../api/trpc';
import { useUiStore } from '../../store/uiStore';
import { commandLabelFor } from '../../../shared/commandCatalog';
import { buildOrderStatusSummary } from '../../../shared/customerSafeStatus';
import type { GridRow, ViewKey } from '../../../shared/types';

/**
 * EntityTimelineTab — UX-U01 (UX-N01 / UF-014 / JY-16).
 *
 * The support persona's "where is order X?" answer in one place: a merged
 * chronological event list (commands, payments, allocations, fulfillment
 * marks, media publishes) per customer / vendor / order / lot, served by the
 * read-only `queries.entityTimeline` procedure (existing tables only).
 *
 * Each event renders a type icon + label, timestamp, actor where known, and
 * a deep link where a target row exists — using the sanctioned
 * setGridFilter / setDrawerEntity / setActiveView / navigate pattern
 * (CountPill / TER-1624 lineage, same as PaymentLinkedOrdersTab).
 *
 * UX-N02: on order timelines, "Copy status summary (customer-safe)" builds a
 * status story via the shared customerSafeStatus util — cost, margin, and
 * internal notes are structurally excluded.
 */

export type TimelineEntityType = 'customer' | 'vendor' | 'order' | 'lot';

interface EntityTimelineTabProps {
  entityType: TimelineEntityType;
  entityId: string | null | undefined;
  row?: GridRow;
}

interface TimelineEventShape {
  id: string;
  eventType: string;
  label: string;
  actor: string | null;
  status: string | null;
  amount: string | null;
  refNo: string | null;
  targetType: string | null;
  targetId: string | null;
  occurredAt: string | Date;
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  command: TerminalSquare,
  payment: Banknote,
  vendor_payment: Banknote,
  allocation: Link2,
  pick: Package,
  fulfillment: PackageCheck,
  media: Camera
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  command: 'Command',
  payment: 'Payment',
  vendor_payment: 'Vendor payment',
  allocation: 'Allocation',
  pick: 'Pick',
  fulfillment: 'Fulfillment',
  media: 'Media'
};

function dateish(value: unknown): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-US');
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

/** Maps an event target to the view + filter + drawer entity it opens. */
function deepLinkFor(event: TimelineEventShape): { view: ViewKey; route: string; filter: string; drawerEntity: string } | null {
  if (!event.targetType || !event.targetId) return null;
  switch (event.targetType) {
    case 'order':
      return { view: 'orders', route: '/orders', filter: `id:${event.targetId}`, drawerEntity: 'order' };
    case 'payment':
      return { view: 'payments', route: '/payments', filter: `id:${event.targetId}`, drawerEntity: 'payment' };
    case 'vendorBill':
      return {
        view: 'vendors',
        route: '/vendors',
        filter: event.refNo ? `billNo:${event.refNo}` : `id:${event.targetId}`,
        drawerEntity: 'vendorBill'
      };
    case 'pick':
      return {
        view: 'fulfillment',
        route: '/fulfillment',
        filter: event.refNo ? `pickNo:${event.refNo}` : `id:${event.targetId}`,
        drawerEntity: 'pick'
      };
    default:
      return null;
  }
}

export function EntityTimelineTab({ entityType, entityId, row }: EntityTimelineTabProps) {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const pushToast = useUiStore((state) => state.pushToast);

  const enabled = Boolean(entityId);
  const timeline = trpc.queries.entityTimeline.useQuery(
    { entityType, entityId: entityId ?? '00000000-0000-0000-0000-000000000000', limit: 50, offset: 0 },
    { enabled }
  );

  if (!enabled) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Timeline</h2>
        <div className="drawer-empty mt-3">Select a row to view its timeline.</div>
      </div>
    );
  }

  const events = (timeline.data?.events ?? []) as TimelineEventShape[];

  function openTarget(event: TimelineEventShape) {
    const link = deepLinkFor(event);
    if (!link || !event.targetId) return;
    setGridFilter(link.view, link.filter);
    setDrawerEntity(link.view, link.drawerEntity, event.targetId);
    setDrawerState(link.view, 'standard');
    setActiveView(link.view);
    navigate(link.route);
  }

  // UX-N02: customer-safe status story for the order timeline. The shared
  // util whitelists fields AND strips cost/margin/internal-notes keys.
  function copyCustomerSafeSummary() {
    const text = buildOrderStatusSummary(row ?? {}, events.map((event) => ({
      eventType: event.eventType,
      label: event.eventType === 'command' ? commandLabelFor(event.label) : event.label,
      occurredAt: event.occurredAt,
      status: event.status
    })));
    void navigator.clipboard?.writeText(text);
    pushToast('Copied customer-safe status — cost, margin, and internal notes excluded.', 'success');
  }

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Timeline</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Merged events for this {EVENT_TYPE_LABELS[entityType]?.toLowerCase() ?? entityType} — commands, money, fulfillment, media.
      </p>

      {entityType === 'order' ? (
        <button className="secondary-button mt-3" type="button" onClick={copyCustomerSafeSummary}>
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          Copy status summary (customer-safe)
        </button>
      ) : null}

      {timeline.isLoading ? (
        <div className="drawer-empty mt-4">Loading timeline…</div>
      ) : timeline.isError ? (
        <div className="drawer-empty mt-4">
          <span>Timeline failed to load.</span>
          <button className="text-button text-xs" type="button" onClick={() => void timeline.refetch()}>
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="drawer-empty mt-4">No events recorded for this entity yet.</div>
      ) : (
        <div className="mt-4">
          <h3 className="section-title">Events (newest first)</h3>
          <ol className="mt-2 grid gap-1 text-xs" aria-label="Entity timeline events">
            {events.map((event) => {
              const Icon = EVENT_ICONS[event.eventType] ?? TerminalSquare;
              const link = deepLinkFor(event);
              const label = event.eventType === 'command' ? commandLabelFor(event.label) : event.label;
              return (
                <li key={event.id} className="activity-row" data-event-type={event.eventType}>
                  <span className="flex items-center gap-1 font-medium text-ink">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span title={EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}>{label}</span>
                  </span>
                  {event.amount != null ? <span className="text-zinc-600">${moneyish(event.amount)}</span> : null}
                  <span className="text-zinc-500">{event.actor ?? '-'}</span>
                  {event.status ? <span className="text-zinc-500">{event.status}</span> : null}
                  <span className="text-zinc-400">{dateish(event.occurredAt)}</span>
                  {link ? (
                    <button
                      className="text-button text-xs"
                      type="button"
                      onClick={() => openTarget(event)}
                      aria-label={`Open ${event.refNo ?? link.drawerEntity}`}
                    >
                      Open →
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {timeline.data?.nextOffset != null ? (
            <p className="mt-2 text-[11px] text-zinc-400">Showing the most recent {events.length} events.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
