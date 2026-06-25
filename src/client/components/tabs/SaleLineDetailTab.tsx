/**
 * P4 — SaleLineDetailTab
 *
 * Per-line detail surface for the Sales lines grid. Renders the heavy
 * per-line fields that were removed from the lean sales grid (markup,
 * unit-cost / landed-cost resolution, price-floor reasoning, notes,
 * inventory resolution info).
 *
 * Read-only by design — operators edit qty / unitPrice in the grid and
 * use this tab to *understand* a line. Bulk pricing actions live in the
 * salesOrder Pricing tab.
 *
 * Data source: the `row` prop is the same GridRow that the lines grid
 * already has (enriched by `useSalesLineRows`). No new tRPC fetch is
 * needed for the wedge — the grid row already carries unitCost, markup,
 * derivedCogs, validation issues, landed-cost fields, and below-floor
 * reasoning. Future iterations can layer a tRPC query if the row shape
 * proves insufficient.
 *
 * SAFETY: import-time pure. Renders an empty-state when `row` is missing
 * so the tab never throws when the slideover opens before grid data is
 * settled.
 */
import type { SlideOverTab, SlideOverTabProps } from './registry';
import type { GridRow } from '../../../shared/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(value: unknown): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtNumber(value: unknown, digits = 2): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function fmtPercent(value: unknown): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtBool(value: unknown): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '—';
}

function fmtText(value: unknown): string {
  if (value == null) return '—';
  const s = String(value).trim();
  return s.length > 0 ? s : '—';
}

function rowField(row: GridRow | undefined, field: string): unknown {
  if (!row) return undefined;
  return (row as Record<string, unknown>)[field];
}

interface DLRowProps {
  label: string;
  children: React.ReactNode;
}

function DLRow({ label, children }: DLRowProps): JSX.Element {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </>
  );
}

interface SectionProps {
  title: string;
  testId: string;
  children: React.ReactNode;
}

function Section({ title, testId, children }: SectionProps): JSX.Element {
  return (
    <section className="space-y-1" data-testid={testId}>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <dl className="grid grid-cols-2 gap-y-1 text-xs">{children}</dl>
    </section>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

function SaleLineDetailTab(props: SlideOverTabProps): JSX.Element {
  const { row, entityId } = props;

  if (!row) {
    return (
      <div className="p-3 text-sm" data-testid="sale-line-slideover-details-tab">
        <div className="text-xs uppercase tracking-wide text-zinc-500">Line details</div>
        <p className="mt-1 text-zinc-700">
          Select a sale line to view per-line pricing, cost resolution, and notes.
        </p>
        {entityId ? (
          <div className="mt-3 text-[11px] text-zinc-500">
            Line: <span className="font-mono">{entityId.slice(0, 8)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // Derive markup percentage when not present on the row (mirrors the inline
  // valueGetter from SalesBuildMode lineColumns so the slide-over displays
  // the same number the grid used to show).
  const markup = Number(rowField(row, 'markup') ?? 0);
  const unitCost = Number(rowField(row, 'unitCost') ?? 0);
  const computedMarkupPct =
    Number.isFinite(markup) && Number.isFinite(unitCost) && unitCost > 0
      ? markup / unitCost
      : null;

  return (
    <div className="p-3 space-y-3 text-sm" data-testid="sale-line-slideover-details-tab">
      {/* Identity */}
      <Section title="Identity" testId="sale-line-section-identity">
        <DLRow label="Product">{fmtText(rowField(row, 'displayName') ?? rowField(row, 'itemName'))}</DLRow>
        <DLRow label="Canonical">{fmtText(rowField(row, 'itemName'))}</DLRow>
        <DLRow label="Subcategory">{fmtText(rowField(row, 'subcategory'))}</DLRow>
        <DLRow label="Source">{fmtText(rowField(row, 'batchCode'))}</DLRow>
        <DLRow label="Unresolved source">{fmtText(rowField(row, 'unresolvedSourceText'))}</DLRow>
      </Section>

      {/* Pricing & Margin */}
      <Section title="Pricing &amp; margin" testId="sale-line-section-pricing">
        <DLRow label="Qty">{fmtNumber(rowField(row, 'qty'))}</DLRow>
        <DLRow label="Unit price">{fmtMoney(rowField(row, 'unitPrice'))}</DLRow>
        <DLRow label="Unit cost">{fmtMoney(rowField(row, 'unitCost'))}</DLRow>
        <DLRow label="Markup $">{fmtMoney(rowField(row, 'markup'))}</DLRow>
        <DLRow label="Markup %">{fmtPercent(rowField(row, 'markupPct') ?? computedMarkupPct)}</DLRow>
        <DLRow label="Derived COGS">{fmtMoney(rowField(row, 'derivedCogs'))}</DLRow>
      </Section>

      {/* Landed cost / cost resolution */}
      <Section title="Cost resolution" testId="sale-line-section-cost-resolution">
        <DLRow label="Cost resolved">{fmtBool(rowField(row, 'unitCostResolved'))}</DLRow>
        <DLRow label="Landed basis">{fmtText(rowField(row, 'landedCostBasis'))}</DLRow>
        <DLRow label="Landed reason">{fmtText(rowField(row, 'landedCostReason'))}</DLRow>
        <DLRow label="COGS exception">{fmtText(rowField(row, 'landedCostExceptionReason'))}</DLRow>
        <DLRow label="Vendor approval">{fmtText(rowField(row, 'vendorApprovalState'))}</DLRow>
      </Section>

      {/* Price floor */}
      <Section title="Price floor" testId="sale-line-section-floor">
        <DLRow label="Floor">{fmtMoney(rowField(row, 'priceFloor'))}</DLRow>
        <DLRow label="Below floor reason">{fmtText(rowField(row, 'belowFloorReason'))}</DLRow>
        <DLRow label="Below floor note">{fmtText(rowField(row, 'belowFloorNote'))}</DLRow>
      </Section>

      {/* Inventory / fulfillment status */}
      <Section title="Inventory &amp; fulfillment" testId="sale-line-section-inventory">
        <DLRow label="Available qty">{fmtNumber(rowField(row, 'availableQty'))}</DLRow>
        <DLRow label="Pick status">{fmtText(rowField(row, 'pickStatus'))}</DLRow>
        <DLRow label="Packed">{fmtBool(rowField(row, 'packed'))}</DLRow>
        <DLRow label="Inv posted">{fmtBool(rowField(row, 'inventoryPosted'))}</DLRow>
        <DLRow label="Pay/F-up">{fmtBool(rowField(row, 'paymentFollowup'))}</DLRow>
      </Section>

      {/* Validation issues — comma-joined list when present */}
      {rowField(row, 'validationIssues') ? (
        <Section title="Validation" testId="sale-line-section-validation">
          <DLRow label="Issues">
            {(() => {
              const issues = rowField(row, 'validationIssues');
              if (Array.isArray(issues)) {
                return issues.length === 0 ? '—' : issues.join(', ');
              }
              return fmtText(issues);
            })()}
          </DLRow>
        </Section>
      ) : null}

      {/* Notes (line-level) — when present */}
      {rowField(row, 'notes') ? (
        <Section title="Notes" testId="sale-line-section-notes">
          <DLRow label="Note">{fmtText(rowField(row, 'notes'))}</DLRow>
        </Section>
      ) : null}

      <p className="text-[11px] text-zinc-500">
        Edit qty and unit price inline in the lines grid. Pricing rules and
        bulk re-price live in the order Pricing tab.
      </p>
    </div>
  );
}

// ── Tab definition ─────────────────────────────────────────────────────────

export const saleLineDetailsTab: SlideOverTab = {
  key: 'details',
  label: 'Details',
  component: SaleLineDetailTab,
  defaultFor: ['saleLine'],
};
