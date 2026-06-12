import { Check, Truck, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { StatusActionBar, type StatusActionTable } from '../components/templates';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { GridJourney, formatRequestType, formatRequestSource, labelFromToken, dateish } from './operations/shared';

export function ConnectorsView() {
  const [operatorNotes, setOperatorNotes] = useState('');
  const [routedTo, setRoutedTo] = useState('');
  const selectedRows = useUiStore((state) => state.selectedRows.connectors);
  const selected = selectedRows?.[0];
  const isExternalSource = selected && !['internal', 'web', 'phone'].includes(String(selected.source ?? ''));
  return (
    <GridJourney
      view="connectors"
      title="Inbound Requests"
      prelude={() => (
        <>
          {/* CAP-017 / Phase 4 — persistent safety banner for external connector sources */}
          {isExternalSource ? (
            <div className="control-band subtle-band" role="alert">
              <span className="text-xs text-amber-700">
                ⚠ External connector request — verify source identity before routing or approving.
              </span>
            </div>
          ) : null}
          <div className="control-band">
            <label className="field-inline">
              Notes
              <input className="input compact" value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} />
            </label>
            <label className="field-inline">
              Route to
              <input className="input compact" placeholder="team or person" value={routedTo} onChange={(event) => setRoutedTo(event.target.value)} />
            </label>
            <span className="selection-pill">{selected ? `${formatRequestSource(selected.source)} / ${formatRequestType(selected.requestType)}` : 'Select request'}</span>
          </div>
          {selected ? (
            <section className="inline-panel text-sm">
              <h2 className="section-title">Selected request</h2>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <span>{formatRequestSource(selected.source)} / {formatRequestType(selected.requestType)}</span>
                <span>{String(selected.customer ?? 'No customer')}</span>
                <span>{String(selected.status ?? 'open')}</span>
              </div>
              <ConnectorTimeline selected={selected} />
            </section>
          ) : null}
        </>
      )}
      selectionActions={(rows, runCommand) => {
        // Spec §10.8 — status-aware actions for inbound requests. Real
        // connector_requests statuses are 'open' (initial) →
        // 'routed' | 'approved' | 'rejected' (verified in commandBus); the
        // spec's 'pending' initial state does not exist. Route remains the
        // primary verb per the later CAP-017 / Phase 4 decision (Approve and
        // Reject are secondary).
        const route = {
          key: 'route',
          label: 'Route',
          icon: <Truck className="h-4 w-4" aria-hidden="true" />,
          disabled: !routedTo.trim(),
          disabledReason: 'Enter a destination in "Route to" before routing',
          run: (r: GridRow[]) => runCommand('routeConnectorRequest', { requestId: r[0].id, routedTo: routedTo.trim(), operatorNotes }, 'Reassign inbound request')
        };
        const approve = { key: 'approve', label: 'Approve', icon: <Check className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => runCommand('approveConnectorRequest', { requestId: r[0].id, operatorNotes }, 'Approve inbound request') };
        const reject = { key: 'reject', label: 'Reject', icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, run: (r: GridRow[]) => runCommand('rejectConnectorRequest', { requestId: r[0].id, operatorNotes }, 'Reject connector request') };
        const connectorTable: StatusActionTable = {
          rules: [
            { when: ['open', 'pending', 'pending_review'], primary: route, tray: [approve, reject] },
            { when: 'routed', primary: null, tray: [approve, reject] },
            { when: 'approved', primary: null, tray: [route, reject] },
            { when: 'rejected', primary: null, tray: [route, approve] },
            // Catch-all: all three verbs reachable for mixed/unknown states.
            { when: () => true, primary: null, tray: [route, approve, reject] }
          ]
        };
        return <StatusActionBar rows={rows} table={connectorTable} />;
      }}
    />
  );
}

function ConnectorTimeline({ selected }: { selected: GridRow }) {
  const history = normalizeReviewHistory(selected.reviewHistory);
  const steps = [
    { label: 'Received', detail: dateish(selected.createdAt), tone: 'done' },
    ...history.map((entry) => ({ label: labelFromToken(String(entry.status ?? 'reviewed')), detail: [entry.actorName, dateish(entry.at), entry.note].filter(Boolean).join(' · '), tone: entry.status === 'rejected' ? 'blocked' : 'done' })),
    { label: String(selected.status ?? 'open') === 'open' ? 'Waiting review' : 'Current status', detail: String(selected.status ?? 'open'), tone: String(selected.status ?? 'open') === 'rejected' ? 'blocked' : 'current' }
  ];
  return (
    <div className="connector-timeline" aria-label="Request review timeline">
      {steps.slice(0, 5).map((step, index) => (
        <div className="connector-timeline-step" key={`${step.label}-${index}`}>
          <span className={`timeline-dot timeline-dot-${step.tone}`} aria-hidden="true" />
          <strong>{step.label}</strong>
          <span>{step.detail || '-'}</span>
        </div>
      ))}
    </div>
  );
}

function normalizeReviewHistory(value: unknown): Array<{ status?: unknown; actorName?: unknown; at?: unknown; note?: unknown }> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')) : [];
}
