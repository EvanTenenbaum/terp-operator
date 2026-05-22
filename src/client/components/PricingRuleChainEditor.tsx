import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '../api/trpc';
import type { PricingRuleClause, PricingRuleContext } from '../../shared/types';
import { resolvePricingRuleClause } from '../../shared/pricingRuleResolver';
import {
  PricingRuleClauseCard,
  type PricingRuleClauseInput,
} from './PricingRuleClauseCard';

interface Props {
  scope: 'global' | 'customer';
  customerId?: string;
  clauses: PricingRuleClause[];
  chainFingerprint: string;
  isRunning: boolean;
  onSave: (clauses: PricingRuleClauseInput[], fingerprint: string) => Promise<void>;
  compact?: boolean;
  readOnly?: boolean;
}

function cloneToInput(c: PricingRuleClause): PricingRuleClauseInput {
  return {
    id: c.id,
    name: c.name,
    conditions: c.conditions,
    actionBasis: c.actionBasis,
    actionAmount: c.actionAmount,
    active: c.active,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function PricingRuleChainEditor({
  scope,
  customerId,
  clauses,
  chainFingerprint,
  isRunning,
  onSave,
  compact,
  readOnly,
}: Props) {
  const reference = trpc.queries.reference.useQuery(undefined, { refetchOnWindowFocus: false });
  const categories: string[] = useMemo(
    () =>
      (reference.data?.categories as string[] | undefined) ??
      ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'],
    [reference.data]
  );

  // Local draft state — all edits happen here, saved on explicit Save
  const [drafts, setDrafts] = useState<PricingRuleClauseInput[]>([]);
  const serverRef = useRef<PricingRuleClause[]>([]);

  // Sync drafts when server clauses change
  useEffect(() => {
    setDrafts(clauses.map(cloneToInput));
    serverRef.current = clauses;
  }, [clauses]);

  const isDirty = !deepEqual(drafts, clauses.map(cloneToInput));

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewCtx, setPreviewCtx] = useState<PricingRuleContext>({
    category: '',
    subcategory: '',
    tags: [],
    batchPostedPrice: 0,
    unitCost: 0,
  });

  const previewResult = useMemo(() => {
    if (!showPreview) return null;
    // Build transient clause objects from drafts for client-side evaluation
    const toClauses: PricingRuleClause[] = drafts.map((d, i) => ({
      id: d.id ?? `draft-${i}`,
      scope,
      customerId: customerId ?? null,
      priority: i + 1,
      name: d.name ?? null,
      conditions: d.conditions,
      actionBasis: d.actionBasis,
      actionAmount: d.actionAmount,
      active: d.active,
    }));
    if (scope === 'customer') {
      return resolvePricingRuleClause(toClauses, [], previewCtx);
    }
    return resolvePricingRuleClause([], toClauses, previewCtx);
  }, [showPreview, drafts, previewCtx, scope, customerId]);

  const suggestedPrice = useMemo(() => {
    if (!previewResult || !previewCtx.unitCost) return null;
    const cost = previewCtx.unitCost;
    return previewResult.basis === 'percent'
      ? cost * (1 + previewResult.amount)
      : cost + previewResult.amount;
  }, [previewResult, previewCtx.unitCost]);

  // Editing helpers
  function addClause() {
    const newClause: PricingRuleClauseInput = {
      name: null,
      conditions: null,
      actionBasis: 'percent',
      actionAmount: 0.30,
      active: true,
    };
    if (scope === 'global' && drafts.length > 0) {
      // Insert before catch-all (last item)
      setDrafts(prev => [...prev.slice(0, -1), newClause, prev[prev.length - 1]]);
    } else {
      setDrafts(prev => [...prev, newClause]);
    }
  }

  function updateClause(index: number, updated: PricingRuleClauseInput) {
    setDrafts(prev => prev.map((c, i) => (i === index ? updated : c)));
  }

  function removeClause(index: number) {
    setDrafts(prev => prev.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    setDrafts(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    // For global scope, catch-all is always last — don't move explicit clauses into it
    const limit = scope === 'global' ? drafts.length - 2 : drafts.length - 2;
    if (index >= limit) return;
    setDrafts(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  async function handleSave() {
    await onSave(drafts, chainFingerprint);
  }

  return (
    <div className="view-stack" data-testid="pricing-chain-editor">
      {/* Clause cards */}
      <div className="grid gap-2">
        {drafts.map((clause, i) => {
          const isCatchAll = scope === 'global' && i === drafts.length - 1;
          return (
            <PricingRuleClauseCard
              key={clause.id ?? `new-${i}`}
              clause={clause}
              index={i}
              total={drafts.length}
              isCatchAll={isCatchAll}
              onChange={(updated) => updateClause(i, updated)}
              onRemove={() => removeClause(i)}
              onMoveUp={() => moveUp(i)}
              onMoveDown={() => moveDown(i)}
              compact={compact}
              readOnly={readOnly}
              categories={categories}
            />
          );
        })}
        {drafts.length === 0 && (
          <div className="text-sm text-zinc-500 py-2">
            No custom rules — this customer uses global defaults.
          </div>
        )}
      </div>

      {/* Action bar */}
      {!readOnly && (
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <button
            type="button"
            className="secondary-button"
            onClick={addClause}
            data-testid="add-clause"
          >
            + Add rule
          </button>
          <button
            type="button"
            className="text-button"
            disabled={isRunning || !isDirty}
            onClick={handleSave}
            data-testid="chain-save"
          >
            Save rules{isDirty ? ' •' : ''}
          </button>
          {isDirty && (
            <span
              className="text-xs text-amber-600"
              aria-label="Unsaved changes"
              role="status"
            >
              Unsaved changes
            </span>
          )}
        </div>
      )}

      {/* Preview panel */}
      <div className="border border-line mt-3" data-testid="preview-panel">
        <button
          type="button"
          className="w-full text-left px-3 py-2 text-xs uppercase text-zinc-500 hover:bg-zinc-50 flex items-center gap-1"
          onClick={() => setShowPreview((s) => !s)}
          aria-expanded={showPreview}
        >
          <span>{showPreview ? '▾' : '▸'}</span>
          <span>Test this chain</span>
        </button>
        {showPreview && (
          <div className="p-3 border-t border-line grid gap-2 text-sm" data-testid="preview-inputs">
            <div className="flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-1 text-xs">
                Category:
                <select
                  className="border border-line px-1 py-0.5 text-xs"
                  value={previewCtx.category ?? ''}
                  onChange={(e) =>
                    setPreviewCtx((c) => ({ ...c, category: e.target.value }))
                  }
                  aria-label="Preview category"
                >
                  <option value="">—</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-xs">
                Subcategory:
                <input
                  type="text"
                  className="border border-line px-1 py-0.5 text-xs"
                  style={{ width: 90 }}
                  value={previewCtx.subcategory ?? ''}
                  onChange={(e) =>
                    setPreviewCtx((c) => ({ ...c, subcategory: e.target.value }))
                  }
                  aria-label="Preview subcategory"
                />
              </label>
              <label className="flex items-center gap-1 text-xs">
                Tags (comma):
                <input
                  type="text"
                  className="border border-line px-1 py-0.5 text-xs"
                  style={{ width: 130 }}
                  placeholder="premium,indoor"
                  onChange={(e) =>
                    setPreviewCtx((c) => ({
                      ...c,
                      tags: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                  aria-label="Preview tags"
                />
              </label>
              <label className="flex items-center gap-1 text-xs">
                Batch price:
                <input
                  type="number"
                  className="border border-line px-1 py-0.5 text-xs"
                  style={{ width: 80 }}
                  value={previewCtx.batchPostedPrice ?? ''}
                  onChange={(e) =>
                    setPreviewCtx((c) => ({
                      ...c,
                      batchPostedPrice: Number(e.target.value),
                    }))
                  }
                  aria-label="Preview batch price"
                />
              </label>
              <label className="flex items-center gap-1 text-xs">
                Unit cost:
                <input
                  type="number"
                  className="border border-line px-1 py-0.5 text-xs"
                  style={{ width: 80 }}
                  value={previewCtx.unitCost ?? ''}
                  onChange={(e) =>
                    setPreviewCtx((c) => ({
                      ...c,
                      unitCost: Number(e.target.value),
                    }))
                  }
                  aria-label="Preview unit cost"
                />
              </label>
            </div>
            {previewResult && (
              <div
                className="text-xs border border-line p-2 bg-zinc-50"
                data-testid="preview-result"
              >
                <strong>
                  → {previewResult.clauseName ?? previewResult.source}
                </strong>{' '}
                {previewResult.basis === 'percent'
                  ? `${(previewResult.amount * 100).toFixed(1)}% markup`
                  : `+$${previewResult.amount.toFixed(2)} markup`}
                {suggestedPrice !== null && previewCtx.unitCost
                  ? ` → suggested price $${suggestedPrice.toFixed(2)}`
                  : ''}
                <span className="ml-2 text-zinc-400">(before guardrail)</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
