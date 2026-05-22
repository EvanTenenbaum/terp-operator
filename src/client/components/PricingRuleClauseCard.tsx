import { useState } from 'react';
import type { FilterGroupInput } from '../../shared/filterSchemas';

// The input shape for a clause being edited (may not have an id yet)
export interface PricingRuleClauseInput {
  id?: string;
  name?: string | null;
  conditions: FilterGroupInput | null;
  actionBasis: 'percent' | 'dollar';
  actionAmount: number;
  active: boolean;
}

// Metadata about a condition field for the UI picker
const PRICING_FIELDS = [
  { key: 'category',    label: 'Category',         type: 'text'    },
  { key: 'subcategory', label: 'Subcategory',       type: 'text'    },
  { key: 'tags',        label: 'Tags',              type: 'array'   },
  { key: 'unitPrice',   label: 'Batch posted price',type: 'numeric' },
  { key: 'unitCost',    label: 'Unit cost (COGS)',  type: 'numeric' },
] as const;

type PricingFieldKey = typeof PRICING_FIELDS[number]['key'];

const TEXT_OPERATORS = [
  { key: 'equals',        label: 'equals' },
  { key: 'not_equals',    label: 'not equals' },
  { key: 'text_contains', label: 'contains' },
];

const NUMERIC_OPERATORS = [
  { key: 'equals',                  label: '=' },
  { key: 'greater_than',            label: '>' },
  { key: 'greater_than_or_equal',   label: '≥' },
  { key: 'less_than',               label: '<' },
  { key: 'less_than_or_equal',      label: '≤' },
  { key: 'between',                 label: 'between' },
];

const ARRAY_OPERATORS = [
  { key: 'array_contains',     label: 'contains any' },
  { key: 'array_contains_all', label: 'contains all' },
  { key: 'array_not_contains', label: 'does not contain' },
];

function getOperators(fieldKey: string) {
  if (fieldKey === 'tags') return ARRAY_OPERATORS;
  if (fieldKey === 'unitPrice' || fieldKey === 'unitCost') return NUMERIC_OPERATORS;
  return TEXT_OPERATORS;
}

function defaultOperator(fieldKey: string): string {
  return getOperators(fieldKey)[0].key;
}

interface Props {
  clause: PricingRuleClauseInput;
  index: number;
  /** Total number of cards in the chain (including catch-all) */
  total: number;
  /** True for the final global catch-all card */
  isCatchAll: boolean;
  onChange: (updated: PricingRuleClauseInput) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  compact?: boolean;
  readOnly?: boolean;
  categories: string[];
}

function conditionSummary(cond: Record<string, unknown>): string {
  const field = PRICING_FIELDS.find(f => f.key === cond.field);
  const fieldLabel = field?.label ?? String(cond.field ?? '');
  const op = String(cond.operator ?? '').replace(/_/g, ' ');
  const val = Array.isArray(cond.value)
    ? (cond.value as unknown[]).join(', ')
    : String(cond.value ?? '');
  return `${fieldLabel} ${op} ${val}`;
}

export function PricingRuleClauseCard({
  clause,
  index,
  total,
  isCatchAll,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  compact,
  readOnly,
  categories,
}: Props) {
  const [addingCondition, setAddingCondition] = useState(false);
  const [newField, setNewField] = useState<PricingFieldKey>('category');
  const [newOperator, setNewOperator] = useState<string>(defaultOperator('category'));
  const [newValue, setNewValue] = useState('');
  const [newValueHigh, setNewValueHigh] = useState(''); // for 'between'

  const conditions = (clause.conditions?.conditions ?? []) as Array<Record<string, unknown>>;

  function handleAddCondition() {
    const field = PRICING_FIELDS.find(f => f.key === newField);
    if (!field || !newValue.trim()) return;

    let value: unknown;
    if (field.type === 'numeric') {
      value = newOperator === 'between'
        ? [Number(newValue), Number(newValueHigh)]
        : Number(newValue);
    } else if (field.type === 'array') {
      value = newValue.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      value = newValue;
    }

    const newCond = { field: newField, operator: newOperator, value };
    const existingGroup = clause.conditions ?? { logic: 'AND' as const, conditions: [] };
    onChange({
      ...clause,
      conditions: {
        logic: 'AND',
        conditions: [...(existingGroup.conditions ?? []), newCond as never],
      },
    });
    setAddingCondition(false);
    setNewValue('');
    setNewValueHigh('');
    setNewField('category');
    setNewOperator(defaultOperator('category'));
  }

  function handleRemoveCondition(i: number) {
    if (!clause.conditions) return;
    const updated = clause.conditions.conditions.filter((_, idx) => idx !== i);
    onChange({
      ...clause,
      conditions: updated.length > 0
        ? { ...clause.conditions, conditions: updated as never }
        : null,
    });
  }

  const isFirstExplicit = index === 0;
  // Last explicit clause is (total - 2) for global scope (catch-all is last);
  // for customer scope it's (total - 1). The parent passes total correctly.
  const isLastExplicit = isCatchAll ? false : index === total - (isCatchAll ? 1 : 1) - 1;

  return (
    <div
      className={`border p-3 text-sm ${isCatchAll ? 'border-zinc-300 bg-zinc-50' : 'border-line bg-white'} ${!clause.active && !isCatchAll ? 'opacity-60' : ''}`}
      data-testid={`clause-card-${index}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Reorder buttons (not for catch-all) */}
        {!isCatchAll && !readOnly && (
          <div className="flex gap-0.5 shrink-0">
            <button
              type="button"
              className="text-button px-1"
              disabled={isFirstExplicit}
              onClick={onMoveUp}
              aria-label="Move rule up"
              data-testid={`move-up-${index}`}
            >
              ↑
            </button>
            <button
              type="button"
              className="text-button px-1"
              disabled={isLastExplicit}
              onClick={onMoveDown}
              aria-label="Move rule down"
              data-testid={`move-down-${index}`}
            >
              ↓
            </button>
          </div>
        )}

        {/* Name or catch-all label */}
        {isCatchAll ? (
          <span className="text-xs font-medium uppercase text-zinc-500 flex-1">
            Default (catch-all)
          </span>
        ) : (
          <input
            type="text"
            className="border border-line px-2 py-0.5 text-xs flex-1 min-w-0"
            placeholder="Rule name (optional)"
            value={clause.name ?? ''}
            onChange={e => onChange({ ...clause, name: e.target.value || null })}
            disabled={readOnly}
            aria-label="Rule name"
            data-testid={`clause-name-${index}`}
          />
        )}

        {/* Active toggle + remove */}
        {!readOnly && (
          <>
            {!isCatchAll && (
              <label className="flex items-center gap-1 text-xs shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clause.active}
                  onChange={e => onChange({ ...clause, active: e.target.checked })}
                  data-testid={`clause-active-${index}`}
                />
                Active
              </label>
            )}
            {!isCatchAll && (
              <button
                type="button"
                className="text-button text-red-500 shrink-0"
                onClick={onRemove}
                aria-label="Remove rule"
                data-testid={`clause-remove-${index}`}
              >
                ×
              </button>
            )}
          </>
        )}
      </div>

      {/* Conditions section */}
      <div className={`${compact ? 'mt-1' : 'mt-2'}`}>
        {isCatchAll ? (
          <div className="text-xs text-zinc-500">
            Matches everything — applied when no other rule fires.
          </div>
        ) : (
          <>
            <div className="text-xs uppercase text-zinc-400 mb-1">IF</div>
            <div className="flex flex-wrap gap-1 items-center">
              {conditions.map((cond, i) => (
                <span key={i} className="finder-chip flex items-center gap-1 text-xs">
                  {conditionSummary(cond)}
                  {!readOnly && (
                    <button
                      type="button"
                      className="ml-0.5 text-zinc-500 hover:text-red-500 leading-none"
                      onClick={() => handleRemoveCondition(i)}
                      aria-label={`Remove condition ${i + 1}`}
                      data-testid={`remove-condition-${index}-${i}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {conditions.length === 0 && (
                <span className="text-xs text-zinc-400">
                  No conditions — catches everything.
                </span>
              )}
            </div>

            {/* Add condition toggle */}
            {!readOnly && !addingCondition && (
              <button
                type="button"
                className="text-button mt-1 text-xs"
                onClick={() => setAddingCondition(true)}
                data-testid={`add-condition-${index}`}
              >
                + Add condition
              </button>
            )}

            {/* Inline add-condition form */}
            {!readOnly && addingCondition && (
              <div
                className="mt-2 flex flex-wrap gap-1 items-center border border-line p-2 bg-zinc-50"
                data-testid={`condition-form-${index}`}
              >
                <select
                  value={newField}
                  onChange={e => {
                    const f = e.target.value as PricingFieldKey;
                    setNewField(f);
                    setNewOperator(defaultOperator(f));
                    setNewValue('');
                    setNewValueHigh('');
                  }}
                  className="border border-line px-2 py-1 text-xs"
                  aria-label="Condition field"
                >
                  {PRICING_FIELDS.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>

                <select
                  value={newOperator}
                  onChange={e => setNewOperator(e.target.value)}
                  className="border border-line px-2 py-1 text-xs"
                  aria-label="Condition operator"
                >
                  {getOperators(newField).map(op => (
                    <option key={op.key} value={op.key}>{op.label}</option>
                  ))}
                </select>

                {/* Value input — varies by field type */}
                {newField === 'category' ? (
                  <select
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    className="border border-line px-2 py-1 text-xs"
                    aria-label="Category value"
                  >
                    <option value="">Select…</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : newField === 'tags' ? (
                  <input
                    type="text"
                    placeholder="premium, indoor (comma-separated)"
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    className="border border-line px-2 py-1 text-xs"
                    style={{ width: 200 }}
                    aria-label="Tags value"
                  />
                ) : (
                  <input
                    type={newField === 'unitPrice' || newField === 'unitCost' ? 'number' : 'text'}
                    placeholder="value"
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    className="border border-line px-2 py-1 text-xs"
                    style={{ width: 100 }}
                    aria-label="Condition value"
                  />
                )}

                {/* Second value for 'between' */}
                {newOperator === 'between' && (
                  <>
                    <span className="text-xs text-zinc-500">and</span>
                    <input
                      type="number"
                      placeholder="high"
                      value={newValueHigh}
                      onChange={e => setNewValueHigh(e.target.value)}
                      className="border border-line px-2 py-1 text-xs"
                      style={{ width: 80 }}
                      aria-label="Condition value high"
                    />
                  </>
                )}

                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleAddCondition}
                  disabled={!newValue.trim()}
                  data-testid={`confirm-add-condition-${index}`}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setAddingCondition(false);
                    setNewValue('');
                    setNewValueHigh('');
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action (THEN) section */}
      <div className={`${compact ? 'mt-1' : 'mt-2'} flex items-center gap-2 flex-wrap`}>
        <span className="text-xs uppercase text-zinc-400">THEN</span>
        <select
          className="border border-line px-2 py-1 text-xs"
          value={clause.actionBasis}
          onChange={e => onChange({ ...clause, actionBasis: e.target.value as 'percent' | 'dollar' })}
          disabled={readOnly}
          aria-label="Action basis"
          data-testid={`clause-basis-${index}`}
        >
          <option value="percent">% markup</option>
          <option value="dollar">$ markup</option>
        </select>
        <input
          type="number"
          min={0}
          step="0.01"
          className="border border-line px-2 py-1 text-xs"
          style={{ width: 90 }}
          value={clause.actionAmount}
          onChange={e => onChange({ ...clause, actionAmount: Number(e.target.value) })}
          disabled={readOnly}
          aria-label="Action amount"
          data-testid={`clause-amount-${index}`}
        />
        <span className="text-xs text-zinc-500">
          {clause.actionBasis === 'percent'
            ? `on landed COGS (${(Number(clause.actionAmount) * 100).toFixed(1)}%)`
            : '$ added to landed COGS'}
        </span>
      </div>
    </div>
  );
}
