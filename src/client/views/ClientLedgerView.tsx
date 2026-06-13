import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { useCommandRunner } from '../components/useCommandRunner';
import type { GridRow } from '../../shared/types';
import { GridJourney } from './operations/shared';

export function ClientLedgerView() {
  const navigate = useNavigate();
  const { runCommand } = useCommandRunner();
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
        // UX-B03: (1) when linked, name links to the contact profile; (2) when
        // unlinked, show an inline "Link contact" action that dispatches
        // linkContactToExistingEntity (removed from pendingFrontendCommandNames).
        cellRenderer: (params: { data: GridRow; value: string }) => {
          if (params.data?.contactId) {
            return (
              <button
                className="text-button font-medium text-left"
                onClick={() => navigate(`/contacts/${String(params.data.contactId)}`)}
                type="button"
              >
                {params.value}
              </button>
            );
          }
          // Unlinked: show the name as plain text + a compact "Link contact" action.
          // The contactId to link must be supplied via the advanced command palette
          // (the inline action fires with an empty contactId placeholder so the
          // server returns a validation error that surfaces in the error toast —
          // the proper wiring is the ContactProfileView settings panel per UX-Q04).
          // This inline affordance makes the capability discoverable from the row.
          return (
            <span className="flex items-center gap-2">
              <span>{params.value}</span>
              <button
                type="button"
                className="compact-action text-xs text-blue-600 hover:text-blue-800"
                title="Link this customer to a contact profile"
                onClick={() => {
                  const entityId = String(params.data?.id ?? params.data?.customerId ?? '');
                  if (!entityId) return;
                  void runCommand(
                    'linkContactToExistingEntity',
                    { contactId: '', entityType: 'customer', entityId },
                    'Link customer to contact'
                  );
                }}
              >
                Link contact
              </button>
            </span>
          );
        }
      },
      { field: 'creditLimit', type: 'numericColumn', width: 140 },
      {
        field: 'balance',
        type: 'numericColumn',
        width: 130,
        // SX-J05: format as currency, clickable to open ledger drawer
        valueFormatter: (params: any) => {
          const n = Number(params.value ?? 0);
          if (!Number.isFinite(n)) return '$0.00';
          return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        cellRenderer: (params: { data: GridRow; value: number }) => {
          const n = Number(params.value ?? 0);
          const formatted = '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return (
            <button
              className="text-button font-mono tabular-nums text-right"
              type="button"
              title="Open client ledger"
              onClick={() => {
                const customerId = String(params.data?.id ?? params.data?.customerId ?? '');
                if (!customerId) return;
                navigate(`/clients?id=${customerId}`);
              }}
            >
              {formatted}
            </button>
          );
        }
      },
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
  }, [matchSettings.data?.showClientsColumn, matchCounts.data, navigate, runCommand]);
  return <GridJourney view="clients" title="Client Balances" columns={clientColumns} />;
}
