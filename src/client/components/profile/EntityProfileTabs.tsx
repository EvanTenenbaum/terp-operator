interface Tab { key: string; label: string; show: boolean; }

interface EntityProfileTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function EntityProfileTabs({ tabs, activeTab, onTabChange }: EntityProfileTabsProps) {
  const visibleTabs = tabs.filter((t) => t.show);
  return (
    <nav role="tablist" aria-label="Profile sections" className="flex gap-1 border-b border-line px-4">
      {visibleTabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`text-button px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
            activeTab === tab.key
              ? 'font-semibold border-accent text-ink'
              : 'border-transparent text-zinc-500 hover:text-ink'
          }`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
