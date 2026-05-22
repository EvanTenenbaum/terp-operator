import React from 'react';
import { trpc } from '../../api/trpc';

export function CreditQueueHealthWidget() {
  const { data, isLoading } = trpc.credit.creditRecomputeQueueHealth.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  if (isLoading || !data) return null;

  const hasStale = data.staleProcessingCount > 0;
  const hasFailed = data.failedTerminalCount > 0;
  const isUnhealthy = hasStale || hasFailed;

  return (
    <div
      className={`flex items-center gap-3 rounded border px-3 py-1.5 text-xs ${
        isUnhealthy
          ? 'border-amber-300 bg-amber-50 text-amber-800'
          : 'border-zinc-200 bg-zinc-50 text-zinc-600'
      }`}
      aria-label="Credit recompute queue health"
    >
      <span className="font-medium">Recompute queue</span>
      <span>Pending: {data.pendingCount}</span>
      <span>Processing: {data.processingCount}</span>
      {hasStale && (
        <span className="font-medium text-red-600">Stale: {data.staleProcessingCount}</span>
      )}
      {hasFailed && (
        <span className="font-medium text-red-600">Failed: {data.failedTerminalCount}</span>
      )}
      {data.oldestPendingAgeSeconds !== null && data.pendingCount > 0 && (
        <span>Oldest: {Math.round(data.oldestPendingAgeSeconds / 60)}m</span>
      )}
    </div>
  );
}
