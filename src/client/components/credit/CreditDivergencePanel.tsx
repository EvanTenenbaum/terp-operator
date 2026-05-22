import React from 'react';
import { trpc } from '../../api/trpc';

type SuggestedAction =
  | 'engine_recommends_raise'
  | 'engine_recommends_lower'
  | 'within_tolerance'
  | 'no_recommendation_yet';

function formatAction(action: SuggestedAction): string {
  switch (action) {
    case 'engine_recommends_raise': return 'Raise recommended';
    case 'engine_recommends_lower': return 'Lower recommended';
    case 'within_tolerance': return 'Within tolerance';
    case 'no_recommendation_yet': return 'No recommendation';
    default: return action;
  }
}

interface KpiTileProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function KpiTile({ label, value, highlight = false }: KpiTileProps) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? 'border-green-200 bg-green-50' : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-xl font-semibold ${highlight ? 'text-green-700' : 'text-zinc-900'}`}>
        {value}
      </p>
    </div>
  );
}

export function CreditDivergencePanel() {
  const { data, isLoading, isError, refetch } = trpc.credit.divergenceReport.useQuery(undefined, {
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-500">Loading divergence report…</div>;
  }

  if (isError) {
    return <div className="p-4 text-sm text-red-600">Failed to load divergence report.</div>;
  }

  if (!data) return null;

  const { kpi, rows, totalCustomers, customersWithRecommendation, customersInTolerance } = data;

  return (
    <div className="credit-divergence-panel space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">Credit Divergence Report</h2>
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={() => void refetch()}
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Total customers" value={String(totalCustomers)} />
        <KpiTile label="With recommendation" value={String(customersWithRecommendation)} />
        <KpiTile label="Within tolerance" value={String(customersInTolerance)} />
        <KpiTile
          label="% within tolerance"
          value={`${kpi.pctWithinTolerance.toFixed(1)}%`}
          highlight={kpi.pctWithinTolerance >= 75}
        />
      </div>

      {kpi.blockerCount > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {kpi.blockerCount} customer{kpi.blockerCount !== 1 ? 's' : ''} with open invoices have $0 engine
          recommendation — flipping to engine would block their sales.
        </div>
      )}

      {kpi.passes ? (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Portfolio meets criteria for live-mode flip.
        </div>
      ) : (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-medium">Not ready to flip to live mode:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {kpi.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
                <th className="pb-2 pr-4">Customer</th>
                <th className="pb-2 pr-4">Current limit</th>
                <th className="pb-2 pr-4">Engine rec.</th>
                <th className="pb-2 pr-4">Delta</th>
                <th className="pb-2">Suggested action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.customerId}>
                  <td className="py-2 pr-4 font-medium text-zinc-900">{row.customerName}</td>
                  <td className="py-2 pr-4 text-zinc-700">${row.currentLimit.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {row.engineRecommendation !== null ? `$${row.engineRecommendation.toLocaleString()}` : '—'}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {row.deltaAbs !== 0 ? `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 text-xs text-zinc-500">{formatAction(row.suggestedAction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
