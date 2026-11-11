import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { Clock, Film, ListOrdered, Settings } from 'lucide-react';

export const LeftNavRail: React.FC = () => {
  const { activeTab, setActiveTab } = useQueueStore();

  const navItems = [
    {
      id: 'queue' as const,
      label: 'Queue',
      icon: ListOrdered,
      tooltip: 'Render Queue (Ctrl+1)',
    },
    {
      id: 'history' as const,
      label: 'History',
      icon: Clock,
      tooltip: 'Finished Jobs & History (Ctrl+2)',
    },
    {
      id: 'sequences' as const,
      label: 'Sequences',
      icon: Film,
      tooltip: 'Image Sequences & MP4 Converter (Ctrl+3)',
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      icon: Settings,
      tooltip: 'Application Settings (Ctrl+,)',
    },
  ];

  return (
    <aside className="flex w-16 flex-shrink-0 flex-col items-center border-r border-rn-border bg-[#0f0f10] py-2 select-none z-30">
      {/* Navigation Items: Icon + Label Only */}
      <div className="flex flex-col items-center space-y-1 w-full px-1">
        {navItems.map((item) => {
          const isActive =
            activeTab === item.id ||
            (item.id === 'sequences' && (activeTab as string) === 'sequence');
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`group relative flex w-full flex-col items-center justify-center rounded-md py-2 transition-colors ${
                isActive
                  ? 'bg-rn-panel text-rn-text'
                  : 'text-rn-muted hover:bg-rn-subpanel/70 hover:text-rn-text'
              }`}
              title={item.tooltip}
            >
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-rn-accent" />
              )}

              <Icon
                className={`h-4 w-4 ${isActive ? 'text-rn-accent' : 'text-rn-muted group-hover:text-rn-text'}`}
              />

              <span
                className={`mt-1 text-[10px] font-medium tracking-tight ${isActive ? 'text-rn-text' : 'text-rn-muted'}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
