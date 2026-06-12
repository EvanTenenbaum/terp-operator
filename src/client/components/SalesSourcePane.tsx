/**
 * Sales source pane (#62).
 *
 * Wraps the existing InventoryFinderPanel with a tab strip:
 *   [ Inventory Finder | Recent Sheets ]
 *
 * Both panels render inside the same WorkspacePanel-style container so the
 * focus/expand behavior from #60 keeps working. The active tab determines
 * which panel content shows; selection and customer context are preserved
 * across tab switches.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { WorkspacePanel } from './WorkspacePanel';
import { InventoryFinderPanel, type InventoryFinderBatch } from './InventoryFinderPanel';
import { RecentSheetsPanel } from './RecentSheetsPanel';

type SalesSourceTab = 'finder' | 'recent';
const TAB_ORDER: SalesSourceTab[] = ['finder', 'recent'];

interface SalesSourcePaneProps {
  customerId: string;
  selectedOrderId: string;
  addedBatchIds?: Set<string>;
  initialSearch?: string;
  /** UX-F07 — purchase-history chips passed through to the finder. */
  historyChips?: ReadonlyArray<{ label: string; search: string }>;
  onAddBatch: (batch: InventoryFinderBatch, qty: number) => Promise<void>;
}

export function SalesSourcePane({
  customerId,
  selectedOrderId,
  addedBatchIds,
  initialSearch,
  historyChips,
  onAddBatch
}: SalesSourcePaneProps) {
  const [activeTab, setActiveTab] = useState<SalesSourceTab>('finder');
  const finderTabRef = useRef<HTMLButtonElement | null>(null);
  const recentTabRef = useRef<HTMLButtonElement | null>(null);

  // Issue #62 reviewer fix: ArrowLeft/ArrowRight keyboard navigation across
  // tabs (in addition to Home/End). Matches the WAI-ARIA Authoring Practices
  // tab pattern and lets a keyboard-only operator drive the strip without a
  // mouse.
  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TAB_ORDER.length - 1;
    const next = TAB_ORDER[nextIndex];
    setActiveTab(next);
    (next === 'finder' ? finderTabRef.current : recentTabRef.current)?.focus();
  }

  // Issue #62 reviewer fix: BOTH tabpanels are rendered and we hide the
  // inactive one via the `hidden` attribute. This preserves InventoryFinder
  // state (search text, filters, scroll position, AG Grid selection) across
  // tab switches; previously toggling tabs unmounted Finder and discarded
  // operator setup.
  return (
    <div className="sales-source-pane">
      <div
        role="tablist"
        aria-label="Sales source tabs"
        className="sales-source-tabs"
        onKeyDown={onTabKeyDown}
      >
        <button
          ref={finderTabRef}
          type="button"
          role="tab"
          id="sales-source-tab-finder"
          aria-controls="sales-source-panel-finder"
          aria-selected={activeTab === 'finder'}
          tabIndex={activeTab === 'finder' ? 0 : -1}
          className={clsx('sales-source-tab', activeTab === 'finder' && 'sales-source-tab-active')}
          onClick={() => setActiveTab('finder')}
        >
          Inventory Finder
        </button>
        <button
          ref={recentTabRef}
          type="button"
          role="tab"
          id="sales-source-tab-recent"
          aria-controls="sales-source-panel-recent"
          aria-selected={activeTab === 'recent'}
          tabIndex={activeTab === 'recent' ? 0 : -1}
          className={clsx('sales-source-tab', activeTab === 'recent' && 'sales-source-tab-active')}
          onClick={() => setActiveTab('recent')}
        >
          Recent Sheets
        </button>
      </div>
      <div
        role="tabpanel"
        id="sales-source-panel-finder"
        aria-labelledby="sales-source-tab-finder"
        hidden={activeTab !== 'finder'}
      >
        <InventoryFinderPanel
          selectedOrderId={selectedOrderId}
          customerId={customerId}
          focusKey={customerId}
          addedBatchIds={addedBatchIds}
          initialSearch={initialSearch}
          historyChips={historyChips}
          onAddBatch={onAddBatch}
        />
      </div>
      <div
        role="tabpanel"
        id="sales-source-panel-recent"
        aria-labelledby="sales-source-tab-recent"
        hidden={activeTab !== 'recent'}
      >
        <WorkspacePanel
          panelId="sales:recent-sheets"
          title="Recent Sheets"
          subtitle="Prior customer sheets, newest first"
          testId="recent-sheets-panel"
        >
          <RecentSheetsPanel
            customerId={customerId}
            selectedOrderId={selectedOrderId}
            onAddBatch={onAddBatch}
          />
        </WorkspacePanel>
      </div>
    </div>
  );
}
