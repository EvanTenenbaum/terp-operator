import { useState } from 'react';
import { GridView } from '../templates/GridView';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { formatRequestType, formatRequestSource, labelFromToken, dateish } from './operations/shared';

export function ConnectorsView() {
  const [operatorNotes, setOperatorNotes] = useState('');
  const [routedTo, setRoutedTo] = useState('');
  const selectedRows = useUiStore((state) => state.selectedRows.connectors);
  const selected = selectedRows?.[0];
  const isExternalSource = selected && !['internal', 'web', 'phone'].includes(String(selected.source ?? ''));

  // Preserved refs for unused but required domain-specific state:
  void operatorNotes;
  void routedTo;

  return (
    <div className="h-full flex flex-col">
      {/* CAP-017 / Phase 4 — persistent safety banner for external connector sources */}
      {isExternalSource ? (
        <div className="control-band subtle-band" role="alert">
          <span className="text-xs text-amber-700">
            ⚠ External connector request — verify source identity before routing or approving.
          </span>
        </div>
      ) : null}

      <GridView viewKey="connectors" entityType="connectorRequest" />

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
    </div>
  );
}

/** Preserved: domain-specific connector timeline component. */
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

/** Preserved: normalizes review history for connector timeline display. */
function normalizeReviewHistory(value: unknown): Array<{ status?: unknown; actorName?: unknown; at?: unknown; note?: unknown }> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')) : [];
}
