// CAP-030 / TER-1513 — Mobile pick route (/pick)
// Work-loop RBAC guard wired from TER-1503.
import { useState } from 'react';
import { trpc } from '../api/trpc';
import { usePickWorkLoopGuard } from '../hooks/usePickWorkLoopGuard';
import { QueueScreen } from '../components/pick/QueueScreen';
import { PickListScreen } from '../components/pick/PickListScreen';
import { PickLineScreen } from '../components/pick/PickLineScreen';
import type { PickQueueItem, PickLine, PickListWithLines, WarehouseAlertInterrupt } from '../components/pick/pickTypes';

type Screen = 'queue' | 'list' | 'line';

// Stub empty data — replace with trpc.queries.pickQueue.useQuery() when backend merges
const STUB_QUEUE: PickQueueItem[] = [];
const STUB_LIST: PickListWithLines | null = null;

export function PickView() {
  const me = trpc.auth.me.useQuery();
  usePickWorkLoopGuard(me.data ?? null);

  const [screen, setScreen] = useState<Screen>('queue');
  const [selectedPickList, setSelectedPickList] = useState<PickQueueItem | null>(null);
  const [selectedLine, setSelectedLine] = useState<PickLine | null>(null);
  const [activeInterrupt, setActiveInterrupt] = useState<WarehouseAlertInterrupt | null>(null);

  // TODO: replace with trpc.queries.pickQueue.useQuery() when CAP-030 backend merges (TER-1498)
  const queueItems: PickQueueItem[] = STUB_QUEUE;
  const queueLoading = false;

  // TODO: replace with trpc.queries.pickListWithLines.useQuery({ pickListId: selectedPickList?.id }, { enabled: ... }) when backend merges
  const pickList: PickListWithLines | null = STUB_LIST;
  const pickListLoading = false;

  function handleRefreshQueue() {
    // TODO: call queryClient.invalidateQueries() or trpc.useUtils().queries.pickQueue.invalidate() when backend merges
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
    // TODO: invalidate pickListWithLines query when backend merges
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
