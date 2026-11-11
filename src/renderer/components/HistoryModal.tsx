import type { HistoryFilter } from '../../core/history';
import type { HistoryEntry, HistoryResult } from '../../core/schemas/history';
import { useQueueStore } from '../store/queueStore';

import React, { useEffect, useState } from 'react';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderOpen,
  PlusCircle,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

export const HistoryModal: React.FC = () => {
  const { showHistoryModal, setShowHistoryModal, addFiles } = useQueueStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterResult, setFilterResult] = useState<HistoryResult | 'all'>('all');

  useEffect(() => {
    if (!showHistoryModal) return;

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
  }, [showHistoryModal, searchQuery, filterResult]);

  if (!showHistoryModal) return null;

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear all render history?')) {
      if (typeof window !== 'undefined' && window.rnApi) {
        await window.rnApi.clearHistory();
        setEntries([]);
      }
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.deleteHistoryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const handleOpenFolder = async (outputPath: string) => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.openPath(outputPath);
    }
  };

  const handleReAddToQueue = async (entry: HistoryEntry) => {
    await addFiles([entry.filePath]);
    setShowHistoryModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none animate-in fade-in p-6">
      <div className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-rn-border bg-rn-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rn-border px-5 py-3">
          <div className="flex items-center space-x-2.5">
            <Clock className="h-4 w-4 text-rn-accent" />
            <h2 className="text-sm font-semibold text-rn-text">Render History</h2>
            <span className="rounded bg-rn-subpanel px-2 py-0.5 text-xs text-rn-muted font-mono">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {entries.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="flex items-center space-x-1 rounded border border-rn-border bg-rn-subpanel px-2.5 py-1 text-xs text-rn-muted hover:text-red-400 hover:border-red-400/50 transition"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear History</span>
              </button>
            )}
            <button
              onClick={() => setShowHistoryModal(false)}
              className="rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center space-x-3 border-b border-rn-border bg-rn-subpanel/40 px-5 py-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-rn-muted" />
            <input
              type="text"
              placeholder="Search history"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-rn-border bg-rn-input pl-8 pr-3 py-1 text-xs text-rn-text placeholder-rn-muted focus:border-rn-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-xs text-rn-muted">Status:</label>
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value as HistoryResult | 'all')}
              className="rounded border border-rn-border bg-rn-input px-2.5 py-1 text-xs text-rn-text focus:border-rn-accent focus:outline-none"
            >
              <option value="all">All Results</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-xs text-rn-muted">
              Loading render history...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center space-y-2 text-rn-muted">
              <Clock className="h-8 w-8 stroke-1 text-rn-muted/50" />
              <p className="text-xs">No render history records found.</p>
            </div>
          ) : (
            entries.map((entry) => {
              const dateStr = new Date(entry.timestamp).toLocaleString();
              const isSuccess = entry.result === 'completed';
              const isFailed = entry.result === 'failed';

              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-rn-border bg-rn-subpanel p-3.5 text-xs text-rn-text shadow-sm hover:border-rn-border/80 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {isSuccess && (
                        <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                      )}
                      {isFailed && <XCircle className="h-4 w-4 text-rn-error flex-shrink-0" />}
                      {entry.result === 'canceled' && (
                        <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-sm text-rn-text">{entry.fileName}</span>
                      <span className="rounded bg-rn-input px-2 py-0.5 text-[10px] font-mono text-rn-muted">
                        {dateStr}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleReAddToQueue(entry)}
                        className="flex items-center space-x-1 rounded bg-rn-accent/20 border border-rn-accent/40 px-2.5 py-1 text-[11px] font-medium text-rn-accent hover:bg-rn-accent hover:text-white transition"
                        title="Re-add file to queue"
                      >
                        <PlusCircle className="h-3 w-3" />
                        <span>Re-add</span>
                      </button>
                      <button
                        onClick={() => handleOpenFolder(entry.outputPath)}
                        className="flex items-center space-x-1 rounded border border-rn-border bg-rn-input px-2.5 py-1 text-[11px] text-rn-muted hover:text-rn-text transition"
                        title="Open output folder"
                      >
                        <FolderOpen className="h-3 w-3" />
                        <span>Folder</span>
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="rounded p-1 text-rn-muted hover:text-red-400 transition"
                        title="Delete this history record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 rounded bg-rn-input/60 p-2 border border-rn-border/40 font-mono text-[11px]">
                    <div>
                      <span className="text-rn-muted">Scene / Cam: </span>
                      <span className="text-rn-text">
                        {entry.scene} / {entry.camera}
                      </span>
                    </div>
                    <div>
                      <span className="text-rn-muted">Frames: </span>
                      <span className="text-rn-text font-semibold">{entry.frameCount} frames</span>
                    </div>
                    <div>
                      <span className="text-rn-muted">Total / Avg: </span>
                      <span className="text-rn-text">
                        {entry.totalTimeSeconds}s ({entry.averageFrameTimeSeconds}s/f)
                      </span>
                    </div>
                    <div>
                      <span className="text-rn-muted">Engine: </span>
                      <span className="text-rn-text">{entry.engine}</span>
                    </div>
                  </div>

                  {/* Device Actually Used */}
                  <div className="mt-2 flex items-center space-x-1.5 text-[11px]">
                    <span className="text-rn-muted">Device:</span>
                    <span className="rounded bg-rn-panel px-2 py-0.5 text-rn-text font-mono border border-rn-border/60">
                      {entry.device}
                    </span>
                  </div>

                  {/* Failed frames warning if any */}
                  {entry.failedFrames && entry.failedFrames.length > 0 && (
                    <div className="mt-2 text-[11px] text-rn-error">
                      Failed frames: {entry.failedFrames.join(', ')}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
