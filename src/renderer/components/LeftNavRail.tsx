import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { Calendar, Clock, Film, HelpCircle, Layers, ListOrdered, Settings } from 'lucide-react';

interface LeftNavRailProps {
  onOpenShortcuts?: () => void;
}

export const LeftNavRail: React.FC<LeftNavRailProps> = ({ onOpenShortcuts }) => {
  const { activeTab, setActiveTab, jobs, scheduleConfig, setShowScheduleModal } = useQueueStore();

  const queuedCount = jobs.filter(
    (j) => j.enabled && (j.status === 'Queued' || j.status === 'Rendering'),
  ).length;

  const navItems = [
    {
      id: 'queue' as const,
      label: 'Queue',
      icon: ListOrdered,
      badge: queuedCount > 0 ? queuedCount : null,
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
      tooltip: 'Image Sequence Player & Converter (Ctrl+3)',
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      icon: Settings,
      tooltip: 'Preferences & Engine Settings (Ctrl+,)',
    },
  ];

  return (
    <aside className="flex w-14 flex-shrink-0 flex-col justify-between border-r border-rn-border bg-[#181818] py-2 select-none z-30">
      {/* Top Group: Brand Mark & Nav Items */}
      <div className="flex flex-col items-center space-y-1">
        {/* Brand Icon */}
        <div
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-rn-accent/20 text-rn-accent shadow-sm"
          title="Render Night - Local Blender Batch Queue"
        >
          <Layers className="h-5 w-5 text-rn-accent" />
        </div>

        {/* Navigation Buttons */}
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
              className={`group relative flex w-12 flex-col items-center justify-center rounded-md py-2 transition-all duration-100 ${
                isActive
                  ? 'bg-rn-panel text-white shadow-sm'
                  : 'text-rn-muted hover:bg-rn-subpanel hover:text-rn-text'
              }`}
              title={item.tooltip}
            >
              {/* Left Active Accent Pill */}
              {isActive && (
                <span className="absolute -left-1 top-2 bottom-2 w-1 rounded-r bg-rn-accent" />
              )}

              <div className="relative">
                <Icon
                  className={`h-4 w-4 ${isActive ? 'text-rn-accent' : 'text-rn-muted group-hover:text-rn-text'}`}
                />
                {item.badge !== null && (
                  <span className="absolute -top-1 -right-2 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-rn-rendering px-1 text-[9px] font-bold text-white leading-none">
                    {item.badge}
                  </span>
                )}
              </div>

              <span
                className={`mt-1 text-[10px] font-medium tracking-tight ${isActive ? 'text-white' : 'text-rn-muted'}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom Group: Scheduling & Keyboard Shortcuts */}
      <div className="flex flex-col items-center space-y-2 border-t border-rn-border/50 pt-2">
        {/* Schedule Quick Indicator */}
        <button
          type="button"
          onClick={() => setShowScheduleModal(true)}
          className={`flex h-8 w-8 items-center justify-center rounded transition ${
            scheduleConfig.enabled
              ? 'bg-rn-accent/20 text-rn-accent border border-rn-accent'
              : 'text-rn-muted hover:bg-rn-subpanel hover:text-rn-text'
          }`}
          title={
            scheduleConfig.enabled
              ? `Scheduled at ${scheduleConfig.time}`
              : 'Schedule queue start time'
          }
        >
          <Calendar className="h-4 w-4" />
        </button>

        {/* Shortcuts Help Modal */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="flex h-8 w-8 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
          title="Keyboard shortcuts cheat sheet (?)"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
};
