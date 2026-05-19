import { useState } from 'react';
import { X } from 'lucide-react';
import { RefereeRelationshipsList } from './RefereeRelationshipsList';
import { RefereeCreditsList } from './RefereeCreditsList';

interface RefereeDetailPanelProps {
  refereeId: string;
  refereeName: string;
  onClose: () => void;
}

type Tab = 'relationships' | 'credits';

export function RefereeDetailPanel({ refereeId, refereeName, onClose }: RefereeDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('relationships');

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[480px] flex-col border-l border-zinc-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-900">{refereeName}</h2>
        <button
          onClick={onClose}
          className="rounded p-1 hover:bg-zinc-100"
          aria-label="Close panel"
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav role="tablist" className="flex border-b border-zinc-200 px-2">
        <button
          role="tab"
          aria-selected={tab === 'relationships'}
          onClick={() => setTab('relationships')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'relationships'
              ? 'border-b-2 border-accent text-accent'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
          type="button"
        >
          Relationships
        </button>
        <button
          role="tab"
          aria-selected={tab === 'credits'}
          onClick={() => setTab('credits')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'credits'
              ? 'border-b-2 border-accent text-accent'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
          type="button"
        >
          Credits
        </button>
      </nav>

      <div className="flex-1 overflow-auto">
        {tab === 'relationships' ? (
          <RefereeRelationshipsList refereeId={refereeId} />
        ) : (
          <RefereeCreditsList refereeId={refereeId} />
        )}
      </div>
    </aside>
  );
}
