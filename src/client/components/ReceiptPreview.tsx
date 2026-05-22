import { useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';

type Mode = 'external' | 'internal';

export interface ReceiptPreviewProps {
  documentType: 'purchase_order';
  subjectId: string;
  initialMode?: Mode;
  onClose: () => void;
}

const INTERNAL_ROLES = new Set(['owner', 'manager', 'operator']);

export function ReceiptPreview({ documentType, subjectId, initialMode = 'external', onClose }: ReceiptPreviewProps) {
  const me = trpc.auth.me.useQuery();
  const canSeeInternal = me.isSuccess && me.data?.role ? INTERNAL_ROLES.has(me.data.role) : false;
  const [mode, setMode] = useState<Mode>(canSeeInternal ? initialMode : 'external');
  const pushToast = useUiStore((state) => state.pushToast);

  const query = trpc.documentSnapshots.getReceiptText.useQuery(
    canSeeInternal
      ? { documentType, subjectId, mode, includeDrafts: true }
      : { documentType, subjectId, mode },
    { enabled: Boolean(subjectId) }
  );

  async function handleCopy() {
    if (!query.data?.text) return;
    await navigator.clipboard.writeText(query.data.text);
    pushToast(mode === 'internal' ? 'Internal receipt copied (includes watermark).' : 'External receipt copied.', 'success');
  }

  function handlePrint() {
    document.body.classList.add('print-receipt-only');
    try {
      window.print();
    } finally {
      setTimeout(() => document.body.classList.remove('print-receipt-only'), 0);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="receipt-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Receipt preview"
      data-testid="receipt-preview-overlay"
    >
      <div className="inline-panel receipt-preview-panel">
        <div className="control-band subtle-band">
          <div className="page-title">Receipt preview</div>
          <div className="control-band">
            <button
              className={`secondary-button compact-action${mode === 'external' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setMode('external')}
              data-testid="receipt-mode-external"
            >
              External
            </button>
            <button
              className={`secondary-button compact-action${mode === 'internal' ? ' is-active' : ''}`}
              type="button"
              disabled={!canSeeInternal}
              onClick={() => setMode('internal')}
              title={canSeeInternal ? 'Switch to internal view' : 'Viewers cannot read internal receipts.'}
              data-testid="receipt-mode-internal"
            >
              Internal
            </button>
            <button
              className="secondary-button compact-action"
              type="button"
              onClick={handleCopy}
              disabled={!query.data?.text}
              data-testid="receipt-copy-btn"
            >
              Copy
            </button>
            <button
              className="secondary-button compact-action"
              type="button"
              onClick={handlePrint}
              disabled={!query.data?.text}
              data-testid="receipt-print-btn"
            >
              Print
            </button>
            <button
              className="text-button compact-action"
              type="button"
              onClick={onClose}
              data-testid="receipt-close-btn"
            >
              Close
            </button>
          </div>
        </div>
        <div
          className={mode === 'internal' ? 'selection-pill danger' : 'hidden'}
          role="status"
          aria-live="polite"
          data-testid="internal-watermark"
        >
          INTERNAL — DO NOT SEND
        </div>
        <div className="receipt-preview-body-html" data-testid="receipt-preview-body">
          {query.isLoading ? 'Loading…' : query.data?.text ?? (query.error?.message ?? 'No snapshot.')}
        </div>
      </div>
    </div>,
    document.body
  );
}
