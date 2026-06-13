// CAP-030 / TER-1513 — Mobile pick route (/pick)
import { useState, useEffect, useRef } from 'react';
import { trpc } from '../api/trpc';
import { usePickWorkLoopGuard } from '../hooks/usePickWorkLoopGuard';
import { useCommandRunner } from '../components/useCommandRunner';
import { QueueScreen } from '../components/pick/QueueScreen';
import { PickListScreen } from '../components/pick/PickListScreen';
import { PickLineScreen } from '../components/pick/PickLineScreen';
import type { PickQueueItem, PickLine, PickListWithLines, WarehouseAlertInterrupt } from '../components/pick/pickTypes';
import { useOrderSocket } from '../context/SocketContext';

type Screen = 'queue' | 'list' | 'line';

export function PickView() {
  const [screen, setScreen] = useState<Screen>('queue');
  const [selectedPickList, setSelectedPickList] = useState<PickQueueItem | null>(null);
  const [selectedLine, setSelectedLine] = useState<PickLine | null>(null);
  const [activeInterrupt, setActiveInterrupt] = useState<WarehouseAlertInterrupt | null>(null);
  // Scenario B: track when the picker is on a line that gets recalled while they're on it.
  const [recalledLineItem, setRecalledLineItem] = useState<string | null>(null);

  // SX-K10: Push a history entry on each forward screen transition so
  // browser Back/Forward navigates within the pick flow instead of exiting
  // to the previous route. We push a new entry with a synthetic state on
  // every forward move; on popstate we walk the component-level screen
  // stack backwards. The UI "←" buttons call history.back() to keep the
  // browser history and the internal stack in lockstep.
  const screenHistoryRef = useRef<Screen[]>(['queue']);

  function pushPickScreen(next: Screen) {
    const current = screenHistoryRef.current[screenHistoryRef.current.length - 1];
    if (current === next) return; // already on this screen
    screenHistoryRef.current.push(next);
    try {
      history.pushState({ pickDepth: screenHistoryRef.current.length }, '', window.location.href);
    } catch { /* not in a browser */ }
  }

  useEffect(() => {
    function onPopState(_event: PopStateEvent) {
      // When the stack has more than one entry, the user is inside the
      // flow. Pop the top entry and navigate within the component.
      if (screenHistoryRef.current.length > 1) {
        screenHistoryRef.current.pop();
        const prev = screenHistoryRef.current[screenHistoryRef.current.length - 1];
        setScreen(prev);
        if (prev === 'queue') {
          setSelectedPickList(null);
          setSelectedLine(null);
        } else if (prev === 'list') {
          setSelectedLine(null);
        }
      }
      // If the stack has only one entry, the user is on the queue screen.
      // Let the browser handle the popstate normally (exit to previous route).
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const me = trpc.auth.me.useQuery();
  usePickWorkLoopGuard(me.data ?? null);

  const utils = trpc.useUtils();
  // GH #347: command runner for Complete Order / markOrderFulfilled
  const { runCommand: runPickCommand, isRunning: isCompletingOrder } = useCommandRunner();

  // GH #329: subscribe to the order-specific socket room when a pick list is
  // selected so we receive pick:order:{orderId} events for real-time updates.
  const { subscribeOrder, unsubscribeOrder } = useOrderSocket();
  useEffect(() => {
    const orderId = selectedPickList?.orderId;
    if (!orderId) return;
    subscribeOrder(orderId);
    return () => { unsubscribeOrder(orderId); };
  }, [selectedPickList?.orderId, subscribeOrder, unsubscribeOrder]);

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
    if (!rawLine) {
      // The line is gone — recalled by the sales operator (Scenario B).
      setRecalledLineItem(selectedLine.itemName);
      setActiveInterrupt(null);
      return;
    }
    setRecalledLineItem(null); // clear stale recalled state when line is still present
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
    pushPickScreen('list');
  }

  function handleSelectLine(line: PickLine) {
    setSelectedLine(line);
    setScreen('line');
    pushPickScreen('line');
  }

  function handleLinePicked() {
    // GH #345: auto-advance to next unpacked line instead of always returning to list
    const currentLines = pickList?.lines ?? [];
    const nextLine = currentLines.find(
      (l) => l.id !== selectedLine?.id && l.status !== 'packed' && l.status !== 'cancelled'
    ) ?? null;
    void utils.queries.pickListWithLines.invalidate({ pickListId: selectedPickList?.id ?? '' });
    if (nextLine) {
      // Stay on 'line' screen, just swap to the next line (same depth)
      setSelectedLine(nextLine);
    } else {
      // All lines packed — return to list via history.back()
      setSelectedLine(null);
      history.back();
    }
  }

  async function handleCompleteOrder() {
    // GH #347: mark the order fulfilled after all lines are packed
    const orderId = selectedPickList?.orderId;
    if (!orderId) return;
    await runPickCommand('markOrderFulfilled', { orderId }, 'Complete order from PickListScreen');
    // Pop all the way back to queue
    screenHistoryRef.current = ['queue'];
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
        recalled={Boolean(recalledLineItem)}
        recalledItemName={recalledLineItem ?? ''}
        onBack={() => {
          setActiveInterrupt(null);
          setRecalledLineItem(null);
          // Use history.back() so popstate handles the state restoration
          // and the stack stays consistent with browser history.
          history.back();
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
        onBack={() => history.back()}
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
