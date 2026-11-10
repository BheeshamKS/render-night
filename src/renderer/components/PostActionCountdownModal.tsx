import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { AlertOctagon, Power, X } from 'lucide-react';

export const PostActionCountdownModal: React.FC = () => {
  const {
    showPostActionModal,
    postActionCountdown,
    postAction,
    cancelPostActionCountdown,
    executePostActionImmediately,
  } = useQueueStore();

  if (!showPostActionModal || postAction === 'none' || postActionCountdown === null) {
    return null;
  }

  const actionLabels: Record<string, string> = {
    shutdown: 'Shutting Down System',
    restart: 'Restarting System',
    sleep: 'Putting System to Sleep',
    hibernate: 'Hibernating System',
    close_app: 'Closing Night Render',
  };

  const title = actionLabels[postAction] || 'Executing Post-Queue Action';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none animate-in fade-in">
      <div className="w-full max-w-md rounded-lg border border-rn-rendering/60 bg-rn-panel p-6 shadow-2xl">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rn-rendering/20 text-rn-rendering">
            <Power className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-rn-text">{title}</h2>
            <p className="text-xs text-rn-muted">Queue rendering completed gracefully.</p>
          </div>
        </div>

        <div className="my-6 flex flex-col items-center justify-center rounded-lg bg-rn-subpanel/50 p-6 border border-rn-border">
          <span className="text-5xl font-mono font-bold text-rn-rendering tabular-nums">
            {postActionCountdown}s
          </span>
          <span className="mt-2 text-xs text-rn-muted text-center">
            Executing <strong className="text-rn-text">{postAction}</strong> in{' '}
            {postActionCountdown} seconds unless cancelled.
          </span>
        </div>

        <div className="flex items-center justify-between space-x-3">
          <button
            onClick={cancelPostActionCountdown}
            className="flex-1 rounded border border-rn-border bg-rn-subpanel px-4 py-2 text-xs font-semibold text-rn-text hover:bg-rn-subpanel/80 hover:text-white transition flex items-center justify-center space-x-1.5"
          >
            <X className="h-4 w-4" />
            <span>Cancel (Keep System On)</span>
          </button>
          <button
            onClick={executePostActionImmediately}
            className="rounded bg-rn-rendering px-4 py-2 text-xs font-semibold text-white hover:brightness-110 active:brightness-95 transition flex items-center justify-center space-x-1.5"
          >
            <AlertOctagon className="h-4 w-4" />
            <span>Execute Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
