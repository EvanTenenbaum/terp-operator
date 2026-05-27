// CAP-030 / TER-1513 — Pick line detail mobile screen (weigh, scan, submit)
// TODO: depends on CAP-030 backend merge (TER-1498/TER-1488)
import { useState, useEffect, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { PickLine, WarehouseAlertInterrupt } from './pickTypes';
import { useCommandRunner } from '../useCommandRunner';

interface Props {
  line: PickLine | null;
  pickNo: string;
  customer: string;
  // interrupt: active alert that must be acknowledged before picking can continue
  interrupt: WarehouseAlertInterrupt | null;
  /** Scenario B: true when this line was recalled while the picker was actively on it */
  recalled?: boolean;
  /** The item name of the recalled line (for display) */
  recalledItemName?: string;
  onBack: () => void;
  onPicked: () => void;
}

// Declares BarcodeDetector for browsers that support it
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
    };
  }
}

export function PickLineScreen({ line, pickNo, customer, interrupt, recalled, recalledItemName, onBack, onPicked }: Props) {
  const { runCommand, isRunning } = useCommandRunner();
  const [actualQty, setActualQty] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [bagCode, setBagCode] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [showHold, setShowHold] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [barcodeSupported, setBarcodeSupported] = useState(false);
  // GH #344: inline weight validation error
  const [weightError, setWeightError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setBarcodeSupported(typeof window.BarcodeDetector !== 'undefined');
  }, []);

  useEffect(() => {
    if (!line) return;
    setActualQty(String(line.actualQty ?? ''));
    setActualWeight(String(line.actualWeight ?? ''));
    setBagCode(String(line.bagCode ?? ''));
    setHoldReason('');
    setShowHold(false);
  }, [line?.id]);

  async function handleScanBarcode() {
    setScanError(null);
    if (!barcodeSupported || !videoRef.current) {
      setScanError('BarcodeDetector not supported — enter bag code manually.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      // Simple one-shot scan — real impl would loop
      const detector = new window.BarcodeDetector!({ formats: ['code_128', 'qr_code', 'code_39'] });
      const bitmap = await createImageBitmap(videoRef.current!);
      const results = await detector.detect(bitmap);
      stream.getTracks().forEach((t) => t.stop());
      if (results.length > 0) {
        setBagCode(results[0].rawValue);
      } else {
        setScanError('No barcode detected. Enter manually.');
      }
    } catch (err) {
      setScanError('Camera access denied or scan failed. Enter bag code manually.');
      console.error('Barcode scan error:', err);
    }
  }

  async function handleMarkPicked() {
    if (!line) return;
    // GH #344: validate actualWeight before submitting — server requires weight > 0
    const parsedWeight = Number(actualWeight);
    if (!actualWeight || !parsedWeight || parsedWeight <= 0) {
      setWeightError('Weight is required and must be greater than 0');
      return;
    }
    setWeightError(null);
    // TODO: depends on CAP-030 backend merge (TER-1488)
    await runCommand(
      'recordWeighAndPack',
      {
        fulfillmentLineId: line.id,
        actualQty: Number(actualQty) || line.expectedQty,
        actualWeight: parsedWeight,
        bagCode: bagCode || undefined,
      },
      'Mark line picked from PickView'
    );
    onPicked();
  }

  async function handleHold() {
    if (!line || !holdReason.trim()) return;
    await runCommand(
      'recallLineFromPicking',
      { lineId: line.id, reason: holdReason },
      'Hold pick line from PickView'
    );
    onBack();
  }

  // Focus trap for the alert interrupt overlay — must not be dismissable
  const interruptRef = useFocusTrap<HTMLDivElement>(!!interrupt, undefined);

  async function handleAcknowledgeInterrupt() {
    if (!interrupt) return;
    // GH #346: use fulfillmentLineId + alertIndex (server contract for acknowledgeWarehouseAlert)
    await runCommand(
      'acknowledgeWarehouseAlert',
      { fulfillmentLineId: interrupt.fulfillmentLineId, alertIndex: interrupt.alertIndex },
      'Acknowledge alert interrupt from picker'
    );
    // activeInterrupt will clear automatically when pickListQuery refetches and alerts are empty
  }

  // Scenario B — line was recalled while picker was on this screen
  if (recalled) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-amber-50 p-8">
        <div className="text-4xl">↩️</div>
        <h2 className="text-xl font-bold text-amber-900">Line Recalled</h2>
        <p className="max-w-xs text-center text-base text-amber-800">
          <strong>{recalledItemName || 'This line'}</strong> was recalled by sales. Check with the sales operator for the updated quantity.
        </p>
        <button
          type="button"
          className="primary-button mt-4 w-full max-w-xs"
          style={{ minHeight: 56 }}
          onClick={onBack}
        >
          Got it
        </button>
      </div>
    );
  }

  if (!line) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-zinc-500">No line selected.</p>
        <button type="button" className="secondary-button mt-4" style={{ minHeight: 44 }} onClick={onBack}>Back</button>
      </div>
    );
  }

  // Full-screen alert interrupt — must be explicitly acknowledged
  if (interrupt) {
    return (
      <div
        ref={interruptRef}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-amber-50 p-8"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="interrupt-title"
        onKeyDown={(e) => { if (e.key === 'Escape') e.preventDefault(); }}
        // NOTE: no click-outside dismiss per spec — must use the button
      >
        <div className="text-4xl">⚠️</div>
        <h2 id="interrupt-title" className="text-xl font-bold text-amber-900">Warehouse Alert</h2>
        <p className="max-w-xs text-center text-base text-amber-800">{interrupt.message}</p>
        <p className="text-xs text-amber-600">Type: {interrupt.type}</p>
        <button
          type="button"
          className="primary-button mt-4 w-full max-w-xs"
          style={{ minHeight: 56 }}
          disabled={isRunning}
          onClick={handleAcknowledgeInterrupt}
        >
          Acknowledge &amp; Continue
        </button>
        {/* TODO: depends on CAP-030 backend merge (TER-1488) */}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-panel">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        <button
          type="button"
          className="icon-button"
          onClick={onBack}
          aria-label="Back to pick list"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-ink">{customer}</h1>
          <p className="text-xs text-zinc-500">{pickNo}</p>
        </div>
      </header>

      {/* Item info — prominent */}
      <section className="border-b border-line bg-white px-4 py-5">
        <p className="text-2xl font-bold text-ink">{line.itemName}</p>
        <p className="mt-0.5 font-mono text-sm text-zinc-500">{line.batchCode}</p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-bold text-accent">{line.expectedQty}</span>
          <span className="text-base text-zinc-500">expected</span>
        </div>
      </section>

      {/* Inputs */}
      <section className="space-y-4 px-4 py-5">
        {/* Actual qty — big input */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="pick-actual-qty">
            Actual qty
          </label>
          <input
            id="pick-actual-qty"
            className="input w-full text-2xl"
            style={{ minHeight: 56, fontSize: 24 }}
            value={actualQty}
            inputMode="decimal"
            placeholder={String(line.expectedQty)}
            onChange={(e) => setActualQty(e.target.value)}
          />
        </div>

        {/* Actual weight — GH #344: required field with inline validation */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="pick-actual-weight">
            Actual weight (oz) <span className="text-red-500">*</span>
          </label>
          <input
            id="pick-actual-weight"
            className={`input w-full text-xl${weightError ? ' border-red-500 ring-1 ring-red-500' : ''}`}
            style={{ minHeight: 48, fontSize: 20 }}
            value={actualWeight}
            inputMode="decimal"
            placeholder="0.0"
            aria-describedby={weightError ? 'pick-weight-error' : undefined}
            aria-invalid={!!weightError}
            onChange={(e) => { setActualWeight(e.target.value); setWeightError(null); }}
          />
          {weightError ? (
            <p id="pick-weight-error" className="mt-1 text-sm font-medium text-red-600" role="alert">
              {weightError}
            </p>
          ) : null}
        </div>

        {/* Bag barcode — manual entry always visible */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="pick-bag-code">
            Bag barcode
          </label>
          <div className="flex gap-2">
            <input
              id="pick-bag-code"
              className="input flex-1 text-base"
              style={{ minHeight: 48 }}
              value={bagCode}
              placeholder="Scan or enter bag code"
              onChange={(e) => setBagCode(e.target.value)}
            />
            {/* Scan button — shown always; disabled if not supported */}
            <button
              type="button"
              className="secondary-button"
              style={{ minWidth: 80, minHeight: 48 }}
              onClick={handleScanBarcode}
              title={barcodeSupported ? 'Scan bag barcode with camera' : 'BarcodeDetector not supported on this browser — enter manually'}
            >
              {barcodeSupported ? '📷 Scan' : '📷 —'}
            </button>
          </div>
          {scanError ? <p className="mt-1 text-xs text-red-600">{scanError}</p> : null}
          {!barcodeSupported ? (
            <p className="mt-1 text-xs text-zinc-400">Camera scan not available on this browser. Enter bag code above.</p>
          ) : null}
        </div>
        {/* Hidden video for barcode scan (not shown to user) */}
        <video ref={videoRef} className="hidden" playsInline muted />
      </section>

      {/* Actions */}
      <section className="sticky bottom-0 flex flex-col gap-3 border-t border-line bg-white px-4 py-4">
        {/* Mark picked */}
        <button
          type="button"
          className="primary-button w-full"
          style={{ minHeight: 56, fontSize: 18 }}
          disabled={isRunning || (!actualQty && !bagCode)}
          onClick={handleMarkPicked}
        >
          {isRunning ? 'Saving…' : '✓ Mark picked'}
        </button>

        {/* Hold toggle */}
        {!showHold ? (
          <button
            type="button"
            className="secondary-button w-full"
            style={{ minHeight: 48 }}
            onClick={() => setShowHold(true)}
          >
            Hold
          </button>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="pick-hold-reason">
              Hold reason
            </label>
            <input
              id="pick-hold-reason"
              className="input w-full"
              style={{ minHeight: 44 }}
              value={holdReason}
              placeholder="Describe why this is on hold…"
              onChange={(e) => setHoldReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="primary-button flex-1"
                style={{ minHeight: 48 }}
                disabled={isRunning || !holdReason.trim()}
                onClick={handleHold}
              >
                Confirm hold
              </button>
              <button
                type="button"
                className="secondary-button flex-1"
                style={{ minHeight: 48 }}
                onClick={() => setShowHold(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
