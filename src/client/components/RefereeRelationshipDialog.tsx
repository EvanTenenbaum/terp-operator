import { useMemo, useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { FormDialog, FormField } from './templates';

interface RefereeRelationshipDialogProps {
  refereeId: string;
  refereeName: string;
  onClose: () => void;
}

interface ValidationErrors {
  entity?: string;
  percentage?: string;
  fixedAmount?: string;
}

export function RefereeRelationshipDialog({ refereeId, refereeName, onClose }: RefereeRelationshipDialogProps) {
  const reference = trpc.queries.reference.useQuery();
  const { runCommand, isRunning } = useCommandRunner();

  const [entityType, setEntityType] = useState<'customer' | 'vendor'>('customer');
  const [entityId, setEntityId] = useState('');
  const [feeType, setFeeType] = useState<'percentage' | 'fixed' | 'hybrid'>('percentage');
  const [feePercentage, setFeePercentage] = useState('5.0');
  const [feeFixedAmount, setFeeFixedAmount] = useState('');
  const [applyByDefault, setApplyByDefault] = useState(true);
  const [notes, setNotes] = useState('');

  const entities = entityType === 'customer'
    ? (reference.data?.customers ?? [])
    : (reference.data?.vendors ?? []);

  const errors: ValidationErrors = useMemo(() => {
    const next: ValidationErrors = {};
    if (!entityId) {
      next.entity = `Please select a ${entityType}`;
    }
    if (feeType === 'percentage' || feeType === 'hybrid') {
      const pct = parseFloat(feePercentage);
      if (!pct || pct <= 0 || pct > 100) {
        next.percentage = 'Percentage must be between 0 and 100';
      }
    }
    if (feeType === 'fixed' || feeType === 'hybrid') {
      const amt = parseFloat(feeFixedAmount);
      if (!amt || amt <= 0) {
        next.fixedAmount = 'Fixed amount must be greater than 0';
      }
    }
    return next;
  }, [entityId, entityType, feeType, feePercentage, feeFixedAmount]);

  const hasErrors = Object.keys(errors).length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasErrors) return;

    const payload: Record<string, unknown> = {
      refereeId,
      entityType,
      entityId,
      feeType,
      applyByDefault,
      notes: notes || null
    };

    if (feeType === 'percentage' || feeType === 'hybrid') {
      payload.feePercentage = parseFloat(feePercentage);
    }

    if (feeType === 'fixed' || feeType === 'hybrid') {
      payload.feeFixedAmount = parseFloat(feeFixedAmount);
    }

    const result = await runCommand('addRefereeRelationship', payload, 'Add referee relationship');
    if (result.ok) {
      onClose();
    }
  }

  return (
    <FormDialog
      title="Add Referee Relationship"
      titleId="rrd-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Create Relationship"
      pendingLabel="Creating..."
      pending={isRunning}
      submitDisabled={hasErrors}
      description={
        <>
          Link <strong>{refereeName}</strong> to a customer or vendor
        </>
      }
    >
      <FormField id="rrd-entity-type" label="Entity Type">
        <select
          id="rrd-entity-type"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value as 'customer' | 'vendor');
            setEntityId('');
          }}
          className="w-full rounded border border-zinc-300 px-3 py-2"
        >
          <option value="customer">Customer</option>
          <option value="vendor">Vendor</option>
        </select>
      </FormField>

      <FormField id="rrd-entity" label={entityType === 'customer' ? 'Customer' : 'Vendor'}>
        <select
          id="rrd-entity"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
        >
          <option value="">Choose {entityType}</option>
          {entities.map((entity: { id: string; name: string }) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
        {errors.entity && (
          <p className="mt-1 text-sm text-red-600">{errors.entity}</p>
        )}
      </FormField>

      <FormField id="rrd-fee-type" label="Fee Structure">
        <select
          id="rrd-fee-type"
          value={feeType}
          onChange={(e) => setFeeType(e.target.value as 'percentage' | 'fixed' | 'hybrid')}
          className="w-full rounded border border-zinc-300 px-3 py-2"
        >
          <option value="percentage">Percentage of transaction</option>
          <option value="fixed">Fixed amount per transaction</option>
          <option value="hybrid">Both percentage + fixed</option>
        </select>
      </FormField>

      {(feeType === 'percentage' || feeType === 'hybrid') && (
        <FormField id="rrd-percentage" label="Percentage (%)">
          <input
            id="rrd-percentage"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={feePercentage}
            onChange={(e) => setFeePercentage(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            placeholder="5.0"
          />
          {errors.percentage && (
            <p className="mt-1 text-sm text-red-600">{errors.percentage}</p>
          )}
        </FormField>
      )}

      {(feeType === 'fixed' || feeType === 'hybrid') && (
        <FormField id="rrd-fixed-amount" label="Fixed Amount ($)">
          <input
            id="rrd-fixed-amount"
            type="number"
            step="0.01"
            min="0"
            value={feeFixedAmount}
            onChange={(e) => setFeeFixedAmount(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            placeholder="25.00"
          />
          {errors.fixedAmount && (
            <p className="mt-1 text-sm text-red-600">{errors.fixedAmount}</p>
          )}
        </FormField>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="rrd-apply-by-default"
          checked={applyByDefault}
          onChange={(e) => setApplyByDefault(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        <label htmlFor="rrd-apply-by-default" className="text-sm text-zinc-700">
          Apply by default to transactions
        </label>
      </div>

      <FormField id="rrd-notes" label="Notes (optional)">
        <textarea
          id="rrd-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          rows={2}
          placeholder="Additional notes about this relationship"
        />
      </FormField>
    </FormDialog>
  );
}
