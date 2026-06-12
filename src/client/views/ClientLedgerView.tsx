import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import type { GridRow } from '../../shared/types';
import { GridJourney } from './operations/shared';

export function ClientLedgerView() {
  const navigate = useNavigate();
  const matchSettings = trpc.queries.matchmakingSettings.useQuery();
  const matchCounts = trpc.queries.matchmakingEntityCounts.useQuery(undefined, {
    enabled: matchSettings.data?.showClientsColumn ?? false,
  });
  const clientColumns = useMemo((): ColDef<GridRow>[] => {
    const base: ColDef<GridRow>[] = [
      {
        field: 'name',
        pinned: 'left',
        width: 190,
        cellRenderer: (params: { data: GridRow; value: string }) =>
          params.data?.contactId ? (
            <button
              className="text-button font-medium text-left"
              onClick={() => navigate(`/contacts/${String(params.data.contactId)}`)}
              type="button"
            >
              {params.value}
            </button>
          ) : (
            <span>{params.value}</span>
          )
      },
      { field: 'creditLimit', type: 'numericColumn', width: 140 },
      { field: 'balance', type: 'numericColumn', width: 130 },
      { field: 'tags', minWidth: 180 },
      { field: 'notes', minWidth: 260 },
      { field: 'invoiceCount', width: 120 },
      { field: 'avgDaysToPay', headerName: 'Avg days to pay', type: 'numericColumn', width: 145 },
    ];
    if (!matchSettings.data?.showClientsColumn) return base;
    return [
      ...base,
      {
        headerName: 'Matchmaking',
        width: 160,
        cellRenderer: (params: { data?: GridRow }) => {
          const counts = matchCounts.data?.customers[String(params.data?.id ?? '')];
          if (!counts) return <span className="text-xs text-zinc-400">No activity</span>;
          return (
            <a
              href={`/matchmaking?customer=${params.data?.id}`}
              className="text-xs text-blue-600 hover:underline"
              onClick={(e) => { e.preventDefault(); navigate(`/matchmaking?customer=${params.data?.id}`); }}
            >
              {counts.needs} needs · {counts.matches} matches
            </a>
          );
        },
      },
    ];
  }, [matchSettings.data?.showClientsColumn, matchCounts.data, navigate]);
  return <GridJourney view="clients" title="Client Balances" columns={clientColumns} />;
}
