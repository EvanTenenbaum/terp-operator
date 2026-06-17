import { useMemo } from 'react';
import { trpc } from '../api/trpc';
import type { GridSummaryEntityType } from '../../shared/schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricCard {
  label: string;
  value: string;
  delta?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
}

export interface GridSummaryStripProps {
  /** Entity type for auto-fetching summary data */
  entityType: string;
  /** Override metrics for testing/storybook */
  metrics?: MetricCard[];
  /** Override loading state */
  loading?: boolean;
  /** Override error message */
  error?: string;
  /** Retry callback (when using manual loading/error overrides) */
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DeltaDirection = NonNullable<MetricCard['delta']>['direction'];

const DELTA_ARROWS: Record<DeltaDirection, string> = {
  up: '▲',
  down: '▼',
  neutral: '—',
};

const DELTA_COLORS: Record<DeltaDirection, string> = {
  up: 'text-emerald-600',
  down: 'text-red-600',
  neutral: 'text-zinc-400',
};

/** Format a currency number. Mirrors existing codebase patterns. */
function formatCurrency(n: number): string {
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}

/** Format a count number. */
function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Derive MetricCard[] from the tRPC GridSummaryOutput.
 *
 * Ordering:
 *   1. Total rows ("Total")
 *   2. Currency total (if present)
 *   3. Status counts (sorted by count descending)
 *   4. Additional metric labels
 */
function deriveMetrics(data: {
  entityType: string;
  count: number;
  currencyTotal?: number;
  summary: {
    totalRows: number;
    currencyTotal?: number;
    statusCounts: Array<{ status: string; count: number }>;
    metricLabels: Array<{ label: string; value: string }>;
  };
}): MetricCard[] {
  const cards: MetricCard[] = [];

  // Total rows
  cards.push({
    label: 'Total',
    value: formatCount(data.summary.totalRows),
  });

  // Currency total
  if (data.summary.currencyTotal !== undefined && data.summary.currencyTotal !== null) {
    cards.push({
      label: 'Total Value',
      value: formatCurrency(data.summary.currencyTotal),
    });
  }

  // Status counts
  const sortedStatuses = [...data.summary.statusCounts].sort(
    (a, b) => b.count - a.count,
  );
  for (const s of sortedStatuses) {
    cards.push({
      label: s.status,
      value: formatCount(s.count),
    });
  }

  // Additional metric labels
  for (const m of data.summary.metricLabels) {
    cards.push({
      label: m.label,
      value: m.value,
    });
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1.5 rounded-lg border border-line bg-white p-3">
      <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
      <div className="h-7 w-20 animate-pulse rounded bg-zinc-100" />
    </div>
  );
}

function MetricCardDisplay({ card }: { card: MetricCard }) {
  return (
    <div
      className="flex min-w-[140px] flex-1 flex-col rounded-lg border border-line bg-white p-3 shadow-sm"
      role="region"
      aria-label={`${card.label}: ${card.value}${card.delta ? `, ${card.delta.direction === 'up' ? 'up' : card.delta.direction === 'down' ? 'down' : ''} ${card.delta.value}` : ''}`}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-zinc-500">
        {card.label}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-zinc-900">
        {card.value}
      </span>
      {card.delta && (
        <span
          className={`mt-0.5 text-xs tabular-nums ${DELTA_COLORS[card.delta.direction]}`}
        >
          {DELTA_ARROWS[card.delta.direction]}&nbsp;{card.delta.value}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GridSummaryStrip({
  entityType,
  metrics: metricsOverride,
  loading: loadingOverride,
  error: errorOverride,
  onRetry,
}: GridSummaryStripProps) {
  // ── Auto-fetch mode (no metrics prop) ──
  const queryEnabled = metricsOverride === undefined && loadingOverride === undefined && errorOverride === undefined;

  const query = trpc.queries.gridSummary.useQuery(
    { entityType: entityType as GridSummaryEntityType },
    { enabled: queryEnabled },
  );

  // ── Resolve state ──
  const isLoading = loadingOverride ?? (queryEnabled ? query.isLoading : false);
  const error = errorOverride ?? (queryEnabled ? query.error : null);
  const errorMessage =
    errorOverride ??
    (query.error ? query.error.message ?? 'Could not load summary' : null);

  const metrics: MetricCard[] | undefined = useMemo(() => {
    if (metricsOverride !== undefined) return metricsOverride;
    if (query.data) return deriveMetrics(query.data);
    return undefined;
  }, [metricsOverride, query.data]);

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (queryEnabled) {
      query.refetch();
    }
  };

  // ── Render ──

  // Loading: skeleton cards
  if (isLoading) {
    return (
      <div
        className="flex flex-wrap gap-3 border-b border-line px-3 py-2"
        role="status"
        aria-label="Loading summary"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Error
  if (error || errorMessage) {
    return (
      <div
        className="flex h-9 items-center justify-between gap-3 border-b border-line bg-white px-3"
        role="alert"
        aria-label={
          typeof errorMessage === 'string' ? errorMessage : 'Could not load summary'
        }
      >
        <span className="text-xs text-zinc-500">
          ⚠{' '}
          {typeof errorMessage === 'string'
            ? errorMessage
            : 'Could not load summary'}
        </span>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={handleRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty (no metrics)
  if (!metrics || metrics.length === 0) {
    return (
      <div
        className="flex h-9 items-center border-b border-line bg-white px-3"
        role="status"
        aria-label="No summary data"
      >
        <span className="text-xs text-zinc-500">No data</span>
      </div>
    );
  }

  // Loaded: metric cards
  return (
    <div
      className="flex flex-wrap gap-3 border-b border-line px-3 py-2"
      role="region"
      aria-label={`Summary for ${entityType}`}
    >
      {metrics.map((card, i) => (
        <MetricCardDisplay key={`${card.label}-${i}`} card={card} />
      ))}
    </div>
  );
}
