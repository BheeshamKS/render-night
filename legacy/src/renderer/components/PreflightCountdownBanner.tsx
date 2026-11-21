import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { AlertTriangle, Eye, Play, X } from 'lucide-react';

export const PreflightCountdownBanner: React.FC = () => {
  const {
    preflightCountdown,
    forceStartQueue,
    cancelPreflightCountdown,
    setShowPreflightModal,
    preflightReport,
  } = useQueueStore();

  if (preflightCountdown === null) return null;

  const warningCount = preflightReport?.warnings.length || 0;

  return (
    <div className="flex items-center justify-between border-b border-rn-warning/40 bg-rn-warning/15 px-4 py-2 text-xs text-rn-text animate-in slide-in-from-top duration-200">
      <div className="flex items-center space-x-2.5">
        <AlertTriangle className="h-4 w-4 text-rn-warning flex-shrink-0 animate-pulse" />
        <div>
          <span className="font-semibold text-rn-warning">
            Pre-flight warnings detected ({warningCount}).
          </span>{' '}
          <span className="text-rn-text/80">
            Auto-continuing render queue in{' '}
            <strong className="font-mono text-rn-warning text-sm">{preflightCountdown}s</strong>...
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={() => setShowPreflightModal(true)}
          className="flex items-center space-x-1 rounded border border-rn-border bg-rn-subpanel px-2.5 py-1 text-xs text-rn-text hover:bg-rn-panel transition"
          title="Inspect warning details"
        >
          <Eye className="h-3 w-3" />
          <span>Review</span>
        </button>

        <button
          onClick={forceStartQueue}
          className="flex items-center space-x-1 rounded bg-rn-accent px-2.5 py-1 text-xs font-semibold text-[#0f0f10] hover:brightness-110 active:scale-95 transition"
          title="Bypass countdown and start rendering now"
        >
          <Play className="h-3 w-3 fill-current" />
          <span>Render Anyway</span>
        </button>

        <button
          onClick={cancelPreflightCountdown}
          className="rounded p-1 text-rn-muted hover:text-rn-text transition"
          title="Cancel countdown"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
