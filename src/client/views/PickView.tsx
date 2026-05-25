// CAP-030 / TER-1513 — Mobile pick route (/pick)
import { useState } from 'react';
import { trpc } from '../api/trpc';
import { usePickWorkLoopGuard } from '../hooks/usePickWorkLoopGuard';
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
    setSelectedLine(null);
    setScreen('list');
    void utils.queries.pickListWithLines.invalidate({ pickListId: selectedPickList?.id ?? '' });
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
