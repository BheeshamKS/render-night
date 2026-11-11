import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { CheckSquare, RotateCcw, Sliders, Square, Trash2, X } from 'lucide-react';

export const BulkActionBar: React.FC = () => {
  const {
    selectedJobIds,
    clearJobSelection,
    setSelectedJobsEnabled,
    removeSelectedJobs,
    copiedOverrides,
    pasteOverrides,
    lastRemovedJob,
    undoRemoveJob,
    dismissUndoRemove,
  } = useQueueStore();

  const count = selectedJobIds.length;

  return (
    <>
      {/* 1. Contextual Bulk Action Bar */}
      {count > 1 && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-40 flex items-center space-x-3 rounded-xl border border-rn-border bg-rn-subpanel px-4 py-2 shadow-2xl animate-in slide-in-from-bottom-3 duration-100 select-none">
          <span className="text-xs font-semibold tabular-nums text-rn-text">
            {count} jobs selected
          </span>

          <div className="h-4 w-px bg-rn-border" />

          {/* Enable Selected */}
          <button
            type="button"
            onClick={() => setSelectedJobsEnabled(true)}
            className="flex items-center space-x-1 rounded px-2 py-1 text-xs text-rn-text hover:bg-rn-panel transition"
            title="Enable selected jobs"
          >
            <CheckSquare className="h-3.5 w-3.5 text-rn-success" />
            <span>Enable</span>
          </button>

          {/* Disable Selected */}
          <button
            type="button"
            onClick={() => setSelectedJobsEnabled(false)}
            className="flex items-center space-x-1 rounded px-2 py-1 text-xs text-rn-text hover:bg-rn-panel transition"
            title="Disable (skip) selected jobs"
          >
            <Square className="h-3.5 w-3.5 text-rn-muted" />
            <span>Disable</span>
          </button>

          {/* Paste Overrides to Selected */}
          {copiedOverrides && (
            <button
              type="button"
              onClick={() => pasteOverrides(selectedJobIds)}
              className="flex items-center space-x-1 rounded px-2 py-1 text-xs text-rn-accent hover:bg-rn-accent/15 transition"
              title="Paste clipboard overrides to all selected jobs"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Paste Overrides</span>
            </button>
          )}

          {/* Delete Selected */}
          <button
            type="button"
            onClick={removeSelectedJobs}
            className="flex items-center space-x-1 rounded px-2 py-1 text-xs text-rn-error hover:bg-rn-error/15 transition"
            title="Remove all selected jobs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Remove</span>
          </button>

          <div className="h-4 w-px bg-rn-border" />

          {/* Deselect All */}
          <button
            type="button"
            onClick={clearJobSelection}
            className="rounded p-1 text-rn-muted hover:bg-rn-panel hover:text-rn-text transition"
            title="Deselect all (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. Undo Removal Toast */}
      {lastRemovedJob && (
        <div className="fixed bottom-14 right-6 z-40 flex items-center space-x-3 rounded-xl border border-rn-border bg-rn-subpanel px-4 py-2.5 shadow-2xl animate-in slide-in-from-bottom-2 select-none">
          <span className="text-xs text-rn-muted">
            Removed{' '}
            <strong className="text-rn-text font-medium">{lastRemovedJob.job.fileName}</strong>
          </span>

          <button
            type="button"
            onClick={undoRemoveJob}
            className="flex items-center space-x-1 rounded-md bg-rn-accent px-2.5 py-1 text-xs font-semibold text-[#0f0f10] hover:brightness-110 active:brightness-95 transition shadow-sm"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Undo</span>
          </button>

          <button
            type="button"
            onClick={dismissUndoRemove}
            className="rounded p-1 text-rn-muted hover:text-rn-text transition"
            title="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
