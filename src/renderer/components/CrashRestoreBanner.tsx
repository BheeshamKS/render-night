import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { AlertTriangle, RefreshCw, X } from 'lucide-react';

export const CrashRestoreBanner: React.FC = () => {
  const { showCrashRestoreBanner, resumeFromCrash, dismissCrashBanner } = useQueueStore();

  if (!showCrashRestoreBanner) return null;

  return (
    <div className="flex items-center justify-between border-b border-rn-rendering/40 bg-rn-rendering/10 px-4 py-2.5 text-xs text-rn-text animate-in fade-in select-none">
      <div className="flex items-center space-x-2.5">
        <AlertTriangle className="h-4 w-4 text-rn-rendering flex-shrink-0 animate-pulse" />
        <div>
          <span className="font-semibold text-rn-rendering">
            Previous session ended unexpectedly.
          </span>{' '}
          <span className="text-rn-muted">
            Resume queue where it left off from the first unfinished frame?
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={resumeFromCrash}
          className="flex items-center space-x-1 rounded bg-rn-rendering px-3 py-1 font-medium text-white transition hover:brightness-110 active:brightness-95 shadow-sm"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Resume Queue</span>
        </button>
        <button
          onClick={dismissCrashBanner}
          className="rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
          title="Dismiss restore banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
