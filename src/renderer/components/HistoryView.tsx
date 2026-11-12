import type { HistoryFilter } from '../../core/history';
import type { HistoryEntry, HistoryResult } from '../../core/schemas/history';
import { useQueueStore } from '../store/queueStore';

import React, { useEffect, useState } from 'react';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Film,
  FolderOpen,
  PlusCircle,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(timestamp: number | string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(timestamp);
  }
}

export const HistoryView: React.FC = () => {
  const { addFiles, loadSequenceFromPath } = useQueueStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterResult, setFilterResult] = useState<HistoryResult | 'all'>('all');

  useEffect(() => {
    let canceled = false;
    const load = async () => {
      if (typeof window !== 'undefined' && window.rnApi) {
        setLoading(true);
        try {
          const filter: HistoryFilter = {};
          if (searchQuery.trim()) filter.query = searchQuery.trim();
          if (filterResult !== 'all') filter.result = filterResult;
          const res = await window.rnApi.getHistory(filter);
          if (!canceled) {
            setEntries(res);
          }
        } finally {
          if (!canceled) {
            setLoading(false);
          }
        }
      }
    };

    load();
    return () => {
      canceled = true;
    };
  }, [searchQuery, filterResult]);

  const handleClearHistory = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.clearHistory();
      setEntries([]);
    }
  };

  const handleRequeue = async (filePath: string) => {
    await addFiles([filePath]);
  };

  const handleOpenFolder = async (outputPath: string, filePath?: string) => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.openPath(outputPath, filePath);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-rn-bg p-6 text-rn-text select-none">
      <div className="flex h-full flex-col rounded-xl border border-rn-border bg-rn-panel shadow-xl overflow-hidden">
        {/* Header & Filter Bar */}
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-rn-border px-5 bg-rn-subpanel/60">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-rn-accent" />
            <h2 className="text-sm font-semibold text-rn-text">Render History</h2>
            <span className="rounded bg-rn-input border border-rn-border/60 px-2 py-0.5 text-xs text-rn-muted font-mono tabular-nums">
              {entries.length} record{entries.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rn-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history..."
                className="h-8 rounded-md border border-rn-border bg-rn-input pl-8 pr-3 text-xs text-rn-text placeholder-rn-muted focus:border-rn-accent focus:outline-none w-48"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex rounded-md border border-rn-border bg-rn-input p-0.5 text-xs">
              {(['all', 'completed', 'failed', 'canceled'] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => setFilterResult(res)}
                  className={`px-2.5 py-1 rounded capitalize font-medium transition ${
                    filterResult === res
                      ? 'bg-rn-subpanel text-rn-text shadow-sm'
                      : 'text-rn-muted hover:text-rn-text'
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>

            {/* Clear History */}
            {entries.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="flex h-8 items-center space-x-1 rounded-md border border-rn-border px-2.5 text-xs text-rn-muted hover:border-rn-error hover:text-rn-error transition"
                title="Clear all past render history"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear History</span>
              </button>
            )}
          </div>
        </div>

        {/* History Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-xs text-rn-muted">
              Loading render history...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-rn-muted">
              <Clock className="h-12 w-12 stroke-[1.2] opacity-30 mb-2" />
              <p className="text-xs font-semibold text-rn-text">No Render History Yet</p>
              <p className="text-[11px] text-rn-muted mt-1 max-w-sm">
                Completed, failed, and canceled render jobs will be recorded here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => {
                const isSuccess = entry.result === 'completed';
                const isFail = entry.result === 'failed';

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border border-rn-border bg-rn-subpanel/50 p-3 text-xs hover:border-rn-muted/70 transition"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {isSuccess ? (
                        <CheckCircle2 className="h-4 w-4 text-rn-success flex-shrink-0" />
                      ) : isFail ? (
                        <XCircle className="h-4 w-4 text-rn-error flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rn-warning flex-shrink-0" />
                      )}

                      <div className="flex flex-col min-w-0 pr-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-rn-text truncate">
                            {entry.fileName}
                          </span>
                          <span className="text-[10px] text-rn-muted font-mono tabular-nums">
                            {formatDate(entry.timestamp)}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 text-[10px] text-rn-muted tabular-nums mt-0.5">
                          <span>Scene: {entry.scene}</span>
                          <span>·</span>
                          <span>Camera: {entry.camera}</span>
                          <span>·</span>
                          <span>Frames: {entry.frameCount}</span>
                          <span>·</span>
                          <span>Duration: {formatDuration(entry.totalTimeSeconds)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {(isSuccess || entry.frameCount > 0) && (
                        <button
                          type="button"
                          onClick={() => {
                            void loadSequenceFromPath(entry.outputPath, entry.filePath);
                          }}
                          className="flex items-center space-x-1 rounded-md bg-rn-accent/15 border border-rn-accent/35 px-2.5 py-1 text-xs font-medium text-rn-accent hover:bg-rn-accent hover:text-[#0f0f10] transition"
                          title="Preview sequence in player"
                        >
                          <Film className="h-3 w-3" />
                          <span>Preview</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenFolder(entry.outputPath, entry.filePath)}
                        className="flex items-center space-x-1 rounded-md border border-rn-border bg-rn-input px-2.5 py-1 text-xs text-rn-muted hover:text-rn-text transition"
                        title="Open output folder"
                      >
                        <FolderOpen className="h-3 w-3" />
                        <span>Folder</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRequeue(entry.filePath)}
                        className="flex items-center space-x-1 rounded-md bg-rn-subpanel border border-rn-border px-2.5 py-1 text-xs text-rn-text hover:border-rn-muted transition"
                        title="Requeue this .blend file"
                      >
                        <PlusCircle className="h-3 w-3" />
                        <span>Requeue</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
