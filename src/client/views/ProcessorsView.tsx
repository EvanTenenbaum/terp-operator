import { useState } from 'react';
import { GridView } from '../templates/GridView';
import { trpc } from '../api/trpc';
import { useCommandRunner } from '../components/useCommandRunner';
import { ProcessorDetailPanel } from '../components/ProcessorDetailPanel';

export function ProcessorsView() {
  const activeProcessors = trpc.queries.activeProcessors.useQuery();
  const { runCommand } = useCommandRunner();
  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null);

  const activeCount = activeProcessors.data?.length ?? 0;

  async function handleCreateProcessor() {
    const name = prompt('Processor name:');
    if (!name) return;
    const processorType = prompt('Processor type (crypto/check/wire):');
    if (!processorType) return;
    const feeType = prompt('Fee type (percentage/fixed/hybrid):');
    if (!feeType) return;
    let feePercentage = null;
    let feeFixedAmount = null;
    if (feeType === 'percentage' || feeType === 'hybrid') {
      feePercentage = Number(prompt('Fee percentage (e.g., 3.5):'));
    }
    if (feeType === 'fixed' || feeType === 'hybrid') {
      feeFixedAmount = Number(prompt('Fixed fee amount (e.g., 0.30):'));
    }
    const defaultUserSplit = Number(prompt('Default user split % (e.g., 25):'));
    const defaultProcessorSplit = 100 - defaultUserSplit;
    await runCommand('createPaymentProcessor', {
      name,
      processorType,
      feeType,
      feePercentage,
      feeFixedAmount,
      defaultUserSplit,
      defaultProcessorSplit
    }, 'Create payment processor from processors view');
  }

  // Reference to keep TS happy with unused but required-preserved functions:
  void handleCreateProcessor;
  void activeCount;

  return (
    <div className="h-full flex flex-col">
      <GridView viewKey="processors" entityType="user" />

      {detailFor && (
        <ProcessorDetailPanel
          processorId={detailFor.id}
          processorName={detailFor.name}
          onClose={() => setDetailFor(null)}
        />
      )}
    </div>
  );
}
