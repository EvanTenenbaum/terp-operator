/**
 * EntityHoverCard — preview popover that appears after 400ms hover intent
 * over an EntityChipCell.
 *
 * Architecture:
 * - Fetches preview data via the existing cached `trpc.queries.reference`
 *   endpoint (already preloaded by Shell; tanstack cache → instant on hover).
 * - Server-side role-gating fallback: the `reference` query only returns
 *   public/non-sensitive vendor/customer fields by design (no internalMargin,
 *   no unitCost). For belt-and-suspenders, the client redacts any cost-class
 *   fields when role < manager. This satisfies the F1 workaround for entity
 *   preview data.
 * - Reduced motion: opacity fade-in is suppressed when
 *   `prefers-reduced-motion: reduce` matches.
 *
 * Rendered via React portal directly to document.body so it escapes AG Grid's
 * cell clip region. Position is viewport-clamped on the right edge.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../../api/trpc';
import { StatusPill } from '../StatusPill';
import { formatMoney } from '../../utils/format';
import type { Role } from '../../../shared/types';

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  manager: 2,
  owner: 3,
};

const CARD_WIDTH = 280;
const CARD_HORIZON = 12; // px gap from viewport edge

export interface EntityHoverCardProps {
  /** Target entity type — must match a key in entity-schemas (e.g. 'vendor', 'customer'). */
  target: string;
  /** Entity id to look up. */
  entityId: string;
  /** Fallback display name when the lookup is still loading or returns nothing. */
  fallbackLabel: string;
  /** Viewport-relative anchor point (top-left of the card). */
  anchor: { top: number; left: number };
  /** Called when the hover-card itself wants to close (e.g. its own mouseleave). */
  onClose: () => void;
}

/** Reference shape we read from (subset of trpc.queries.reference output). */
interface VendorRefRow {
  id: string;
  name: string;
  termsDays?: number | null;
  consignmentDefault?: boolean | null;
  // Cost-class fields (not currently in reference, but redacted defensively).
  unitCost?: number | null;
  internalMargin?: number | null;
}

interface CustomerRefRow {
  id: string;
  name: string;
  balance?: number | null;
  creditLimit?: number | null;
  pricingRule?: string | null;
  tags?: string[] | null;
}

const COST_FIELDS = new Set(['unitCost', 'internalMargin', 'cost']);

/**
 * Strip cost-class fields from a preview object when the user is below manager.
 * Defensive: today's `reference` endpoint doesn't return these fields anyway,
 * but a future addition won't accidentally leak through this surface.
 */
function applyRoleGate<T extends object>(row: T, role: Role): T {
  if (ROLE_RANK[role] >= ROLE_RANK.manager) return row;
  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (COST_FIELDS.has(k)) continue;
    redacted[k] = v;
  }
  return redacted as T;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

export function EntityHoverCard({
  target,
  entityId,
  fallbackLabel,
  anchor,
  onClose,
}: EntityHoverCardProps): React.ReactPortal | null {
  const reference = trpc.queries.reference.useQuery(undefined, {
    staleTime: 60_000,
  });
  const me = trpc.auth.me.useQuery();
  const role: Role = me.data?.role ?? 'viewer';
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  // Auto-fade-in on mount (skipped if reduced motion → straight to visible).
  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  // Auto-close after 3s as a safety hatch in case mouseleave is missed
  // (e.g. card scrolled out of view).
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const { facts, statusLabel } = useMemo(() => {
    if (!reference.data) return { facts: [] as string[], statusLabel: undefined as string | undefined };

    if (target === 'vendor') {
      const vendors = (reference.data.vendors ?? []) as VendorRefRow[];
      const row = vendors.find((v) => v.id === entityId);
      if (!row) return { facts: [], statusLabel: undefined };
      const gated = applyRoleGate(row, role);
      const f: string[] = [];
      if (typeof gated.termsDays === 'number') f.push(`Net ${gated.termsDays}`);
      if (gated.consignmentDefault) f.push('Consignment by default');
      // Cost fields would render here if present + role ≥ manager.
      if (typeof gated.unitCost === 'number') f.push(`Avg cost ${formatMoney(gated.unitCost)}`);
      if (typeof gated.internalMargin === 'number') f.push(`Margin ${formatMoney(gated.internalMargin)}`);
      return { facts: f, statusLabel: undefined };
    }

    if (target === 'customer') {
      const customers = (reference.data.customers ?? []) as CustomerRefRow[];
      const row = customers.find((c) => c.id === entityId);
      if (!row) return { facts: [], statusLabel: undefined };
      const gated = applyRoleGate(row, role);
      const f: string[] = [];
      if (typeof gated.balance === 'number') f.push(`Balance ${formatMoney(gated.balance)}`);
      if (typeof gated.creditLimit === 'number') f.push(`Credit ${formatMoney(gated.creditLimit)}`);
      if (gated.pricingRule) f.push(`Pricing: ${gated.pricingRule}`);
      return { facts: f, statusLabel: undefined };
    }

    return { facts: [], statusLabel: undefined };
  }, [reference.data, target, entityId, role]);

  // Resolve display name from reference (fallback to the chip's text).
  const displayName = useMemo(() => {
    if (!reference.data) return fallbackLabel;
    if (target === 'vendor') {
      const row = (reference.data.vendors ?? []).find((v: { id: string }) => v.id === entityId);
      return row?.name ?? fallbackLabel;
    }
    if (target === 'customer') {
      const row = (reference.data.customers ?? []).find((c: { id: string }) => c.id === entityId);
      return row?.name ?? fallbackLabel;
    }
    return fallbackLabel;
  }, [reference.data, target, entityId, fallbackLabel]);

  if (typeof document === 'undefined') return null;

  // Viewport-clamp on the right edge.
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const maxLeft = viewportW - CARD_WIDTH - CARD_HORIZON;
  const clampedLeft = Math.max(CARD_HORIZON, Math.min(anchor.left, maxLeft));

  return createPortal(
    <div
      role="tooltip"
      onMouseEnter={() => {
        // Keep open while the cursor is on the card itself.
      }}
      onMouseLeave={onClose}
      style={{
        position: 'fixed',
        top: anchor.top,
        left: clampedLeft,
        width: CARD_WIDTH,
        zIndex: 1000,
        opacity: visible ? 1 : 0,
        transition: reducedMotion ? 'none' : 'opacity 180ms ease-out',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      className="border border-line bg-white shadow-lg rounded p-3 text-[12px] text-zinc-900"
      data-testid={`entity-hover-card-${target}-${entityId}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="font-semibold text-[13px] truncate" title={displayName}>
          {displayName}
        </div>
        {statusLabel && <StatusPill status={statusLabel} />}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">{target}</div>
      {facts.length > 0 ? (
        <ul className="space-y-0.5 text-zinc-700">
          {facts.slice(0, 3).map((f, i) => (
            <li key={i} className="tabular-nums">
              {f}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-zinc-500 italic">
          {reference.isLoading ? 'Loading…' : 'No preview available.'}
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-line text-[10px] text-zinc-500">
        Click chip to open detail.
      </div>
    </div>,
    document.body,
  );
}

export default EntityHoverCard;
