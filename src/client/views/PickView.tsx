// CAP-030 / TER-1513 — Mobile pick route (/pick)
import { useState, useEffect } from 'react';
import { trpc } from '../api/trpc';
import { usePickWorkLoopGuard } from '../hooks/usePickWorkLoopGuard';
import { useCommandRunner } from '../components/useCommandRunner';
import { QueueScreen } from '../components/pick/QueueScreen';
import { PickListScreen } from '../components/pick/PickListScreen';
import { PickLineScreen } from '../components/pick/PickLineScreen';
import type { PickQueueItem, PickLine, PickListWithLines, WarehouseAlertInterrupt } from '../components/pick/pickTypes';

type Screen = 'queue' | 'list' | 'line';

export function PickView() {
  const [screen, setScreen] = useState<Screen>('queue');
  const [selectedPickList, setSelectedPickList] = useState<PickQueueItem | null>(null);
  const [selectedLine, setSelectedLine] = useState<PickLine | null>(null);
  const [activeInterrupt, setActiveInterrupt] = useState<WarehouseAlertInterrupt | null>(null);

  const me = trpc.auth.me.useQuery();
  usePickWorkLoopGuard(me.data ?? null);

  const utils = trpc.useUtils();
  // GH #347: command runner for Complete Order / markOrderFulfilled
  const { runCommand: runPickCommand, isRunning: isCompletingOrder } = useCommandRunner();

  const queueQuery = trpc.queries.pickQueue.useQuery(undefined, { refetchInterval: 30000 });
  const queueItems = (queueQuery.data ?? []) as PickQueueItem[];
  const queueLoading = queueQuery.isLoading;

  const blankId = '00000000-0000-0000-0000-000000000000';
  const pickListQuery = trpc.queries.pickListWithLines.useQuery(
    { pickListId: selectedPickList?.id ?? blankId },
    { enabled: Boolean(selectedPickList?.id), refetchInterval: 10000 }
  );
  const pickList: PickListWithLines | null = pickListQuery.data
    ? {
        pickListId: pickListQuery.data.header.id,
        pickNo: pickListQuery.data.header.pickNo,
        customer: pickListQuery.data.header.customer,
        lines: pickListQuery.data.lines.map((l) => ({
          id: l.id,
          pickListId: selectedPickList?.id ?? '',
          orderId: pickListQuery.data!.header.orderId,
          itemName: l.displayName ?? l.itemName,
          batchCode: l.batchCode,
          expectedQty: l.expectedQty,
          actualQty: l.actualQty ?? undefined,
          actualWeight: undefined,
          bagCode: l.bagCode ?? undefined,
          status: (l.pickStatus ?? l.status) as PickLine['status'],
          alertCount: Array.isArray(l.warehouseAlerts) ? l.warehouseAlerts.length : 0,
        }))
      }
    : null;
  const pickListLoading = pickListQuery.isLoading;

  // GH #346: derive activeInterrupt from raw query data whenever the selected line or query data changes
  useEffect(() => {
    if (screen !== 'line' || !selectedLine) {
      setActiveInterrupt(null);
      return;
    }
    const rawLine = pickListQuery.data?.lines.find((l) => l.id === selectedLine.id);
    if (!rawLine) return;
    const rawAlerts = Array.isArray(rawLine.warehouseAlerts)
      ? (rawLine.warehouseAlerts as Array<{ id: string; type: string; message: string; status: string }>)
      : [];
    const alertIdx = rawAlerts.findIndex((a) => a.status !== 'acknowledged');
    if (alertIdx >= 0) {
      const alert = rawAlerts[alertIdx];
      setActiveInterrupt({
        id: alert.id,
        lineId: selectedLine.id,
        message: alert.message,
        type: alert.type,
        fulfillmentLineId: selectedLine.id,
        alertIndex: alertIdx,
      });
    } else {
      setActiveInterrupt(null);
    }
  }, [pickListQuery.data, selectedLine, screen]);

  function handleRefreshQueue() {
    void utils.queries.pickQueue.invalidate();
  }

  function handleSelectPickList(item: PickQueueItem) {
    setSelectedPickList(item);
    setScreen('list');
  }

  function handleSelectLine(line: PickLine) {
    setSelectedLine(line);
    setScreen('line');
  }

  function handleLinePicked() {
    // GH #345: auto-advance to next unpacked line instead of always returning to list
    const currentLines = pickList?.lines ?? [];
    const nextLine = currentLines.find(
      (l) => l.id !== selectedLine?.id && l.status !== 'packed' && l.status !== 'cancelled'
    ) ?? null;
    void utils.queries.pickListWithLines.invalidate({ pickListId: selectedPickList?.id ?? '' });
    if (nextLine) {
      // Stay on 'line' screen, just swap to the next line
      setSelectedLine(nextLine);
    } else {
      // All lines packed — return to list
      setSelectedLine(null);
      setScreen('list');
    }
  }

  async function handleCompleteOrder() {
    // GH #347: mark the order fulfilled after all lines are packed
    const orderId = selectedPickList?.orderId;
    if (!orderId) return;
    await runPickCommand('markOrderFulfilled', { orderId }, 'Complete order from PickListScreen');
    setScreen('queue');
    void utils.queries.pickQueue.invalidate();
  }

  if (screen === 'line') {
    return (
      <PickLineScreen
        line={selectedLine}
        pickNo={selectedPickList?.pickNo ?? ''}
        customer={selectedPickList?.customer ?? ''}
        interrupt={activeInterrupt}
        onBack={() => {
          setActiveInterrupt(null);
          setScreen('list');
        }}
        onPicked={handleLinePicked}
      />
    );
  }

  if (screen === 'list') {
    return (
      <PickListScreen
        pickList={pickList}
        loading={pickListLoading}
        onBack={() => setScreen('queue')}
        onSelectLine={handleSelectLine}
        onCompleteOrder={handleCompleteOrder}
        isCompletingOrder={isCompletingOrder}
      />
    );
  }

  return (
    <QueueScreen
      items={queueItems}
      loading={queueLoading}
      onRefresh={handleRefreshQueue}
      onSelect={handleSelectPickList}
    />
  );
}
