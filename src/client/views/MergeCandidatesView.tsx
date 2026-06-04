import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { useCommandRunner } from '../components/useCommandRunner';

interface MergeRow {
  id: string;
  contactAId: string;
  contactBId: string;
  matchReason: string;
  contactAName: string;
  contactAPhone: string | null;
  contactAEmail: string | null;
  contactBName: string;
  contactBPhone: string | null;
  contactBEmail: string | null;
  createdAt: string;
}

function isRow(r: unknown): r is MergeRow {
  const m = r as MergeRow;
  return typeof m?.id === 'string' && typeof m?.contactAName === 'string';
}

export function MergeCandidatesView() {
  const navigate = useNavigate();
  const [actionStates, setActionStates] = useState<Record<string, 'idle' | 'loading' | 'done'>>({});

  const { data, isLoading, isError, refetch } = trpc.queries.mergeCandidates.useQuery();
  const { runCommand, isRunning } = useCommandRunner();

  const rows: MergeRow[] = (data?.rows ?? []).filter(isRow);

  /**
   * Mark a merge candidate as reviewed (manager-gated command).
   * Does NOT actually merge contacts — just records the operator's review in
   * the audit journal. Actual contact merging is a separate capability.
   */
  async function handleMarkReviewed(candidateId: string) {
    setActionStates((prev) => ({ ...prev, [candidateId]: 'loading' }));
    try {
      await runCommand('approveMergeCandidate', { candidateId }, 'Operator reviewed merge candidate');
      setActionStates((prev) => ({ ...prev, [candidateId]: 'done' }));
    } catch {
      setActionStates((prev) => ({ ...prev, [candidateId]: 'idle' }));
    }
  }

  async function handleDismiss(candidateId: string) {
    setActionStates((prev) => ({ ...prev, [candidateId]: 'loading' }));
    try {
      await runCommand('dismissMergeCandidate', { candidateId }, 'Operator dismissed merge candidate');
      setActionStates((prev) => ({ ...prev, [candidateId]: 'done' }));
    } catch {
      setActionStates((prev) => ({ ...prev, [candidateId]: 'idle' }));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2">
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={() => navigate('/contacts')}
          aria-label="Back to contacts"
        >
          ← Back to Contacts
        </button>
        <h1 className="text-lg font-semibold text-zinc-900">
          Merge Candidates
          {data ? (
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {rows.length} pending
            </span>
          ) : null}
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-sm text-zinc-600">Loading merge candidates…</div>
        ) : isError ? (
          <div className="text-sm text-red-600">
            Failed to load merge candidates.{' '}
            <button type="button" className="text-button text-xs" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-sm text-zinc-500">
            <p className="font-medium text-zinc-700">No pending merge candidates</p>
            <p className="mt-1">All duplicate contacts have been reviewed.</p>
            <button
              type="button"
              className="secondary-button compact-action mt-4"
              onClick={() => navigate('/contacts')}
            >
              Back to Contacts
            </button>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm" aria-label="Merge candidates review table">
              <thead>
                <tr className="border-b border-line text-xs font-semibold uppercase text-zinc-500">
                  <th scope="col" className="py-1.5 pr-4">Contact A</th>
                  <th scope="col" className="py-1.5 pr-4 hidden sm:table-cell">Phone A</th>
                  <th scope="col" className="py-1.5 pr-4 hidden sm:table-cell">Email A</th>
                  <th scope="col" className="py-1.5 pr-4">Contact B</th>
                  <th scope="col" className="py-1.5 pr-4 hidden sm:table-cell">Phone B</th>
                  <th scope="col" className="py-1.5 pr-4 hidden sm:table-cell">Email B</th>
                  <th scope="col" className="py-1.5 pr-4">Match reason</th>
                  <th scope="col" className="py-1.5 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = actionStates[row.id] ?? 'idle';
                  const isDone = state === 'done';
                  const isBusy = state === 'loading';

                  if (isDone) {
                    return (
                      <tr key={row.id} className="border-b border-line bg-green-50">
                        <td colSpan={8} className="py-2 pr-4 text-center text-xs text-green-700">
                          ✓ Reviewed
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={row.id} className="border-b border-line hover:bg-panel">
                      <th scope="row" className="py-1.5 pr-4 text-left font-medium text-ink">
                        <button
                          type="button"
                          className="text-button font-medium text-left"
                          onClick={() => navigate(`/contacts/${row.contactAId}`)}
                        >
                          {row.contactAName}
                        </button>
                      </th>
                      <td className="py-1.5 pr-4 hidden sm:table-cell text-zinc-600">
                        {row.contactAPhone ?? '-'}
                      </td>
                      <td className="py-1.5 pr-4 hidden sm:table-cell text-zinc-600">
                        {row.contactAEmail ?? '-'}
                      </td>
                      <td className="py-1.5 pr-4">
                        <button
                          type="button"
                          className="text-button font-medium text-left"
                          onClick={() => navigate(`/contacts/${row.contactBId}`)}
                        >
                          {row.contactBName}
                        </button>
                      </td>
                      <td className="py-1.5 pr-4 hidden sm:table-cell text-zinc-600">
                        {row.contactBPhone ?? '-'}
                      </td>
                      <td className="py-1.5 pr-4 hidden sm:table-cell text-zinc-600">
                        {row.contactBEmail ?? '-'}
                      </td>
                      <td className="py-1.5 pr-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {row.matchReason.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn-primary text-xs h-7"
                            disabled={isBusy}
                            aria-label={`Mark merge between ${row.contactAName} and ${row.contactBName} as reviewed`}
                            onClick={() => handleMarkReviewed(row.id)}
                          >
                            {isBusy ? '…' : 'Mark Reviewed'}
                          </button>
                          <button
                            type="button"
                            className="secondary-button compact-action text-xs"
                            disabled={isBusy}
                            aria-label={`Dismiss merge between ${row.contactAName} and ${row.contactBName}`}
                            onClick={() => handleDismiss(row.id)}
                          >
                            {isBusy ? '…' : 'Dismiss'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
