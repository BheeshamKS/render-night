import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { Pause, Play, Plus, Shield, Square, Terminal } from 'lucide-react';

export const Toolbar: React.FC = () => {
  const {
    jobs,
    blenders,
    selectedBlenderId,
    setSelectedBlenderId,
    isolatedMode,
    setIsolatedMode,
    autoExec,
    setAutoExec,
    addFiles,
    queueState,
    activeJobId,
    startQueue,
    pauseQueue,
    resumeQueue,
    stopQueue,
  } = useQueueStore();

  const handleAddFiles = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const files = await window.rnApi.selectBlendFiles();
      if (files && files.length > 0) {
        await addFiles(files);
      }
    }
  };

  const hasEligibleJobs = jobs.some((j) => j.enabled && j.status !== 'Completed');
  const isRunning = queueState === 'running';
  const isPaused = queueState === 'paused';
  const isBusy = isRunning || isPaused;

  const activeJob = jobs.find((j) => j.id === activeJobId);
  const pauseLabel = isPaused
    ? 'Resume'
    : activeJob?.isVideo
      ? 'Pause After Job'
      : 'Pause After Frame';

  return (
    <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-rn-border bg-rn-panel px-4 select-none">
      {/* Left: App Title, Version, & Add Button */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <span className="font-bold tracking-wide text-rn-text">Render Night</span>
          <span className="rounded bg-rn-subpanel px-2 py-0.5 text-xs text-rn-muted font-mono">
            v0.1.0-alpha.1
          </span>
        </div>

        <button
          onClick={handleAddFiles}
          disabled={isBusy}
          className="flex items-center space-x-1.5 rounded bg-rn-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Add one or more .blend files to queue"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add .blend</span>
        </button>
      </div>

      {/* Center: Blender Version Selector */}
      <div className="flex items-center space-x-2">
        <label htmlFor="global-blender-select" className="text-xs text-rn-muted">
          Blender:
        </label>
        {blenders.length > 0 ? (
          <select
            id="global-blender-select"
            value={selectedBlenderId || ''}
            onChange={(e) => setSelectedBlenderId(e.target.value)}
            disabled={isBusy}
            className="rounded border border-rn-border bg-rn-input px-2.5 py-1 text-xs text-rn-text focus:border-rn-accent focus:outline-none disabled:opacity-50"
            title="Switch global default Blender version"
          >
            {blenders.map((b) => (
              <option key={b.id} value={b.id}>
                v{b.version} ({b.source}) - {b.displayPath}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded bg-rn-subpanel px-2 py-1 text-xs text-rn-error">
            No Blender found
          </span>
        )}
      </div>

      {/* Right: Options & Queue Control Buttons */}
      <div className="flex items-center space-x-2">
        {/* Isolated Mode Toggle */}
        <button
          onClick={() => setIsolatedMode(!isolatedMode)}
          disabled={isBusy}
          className={`flex items-center space-x-1 rounded border px-2 py-1 text-xs transition disabled:opacity-50 ${
            isolatedMode
              ? 'border-rn-accent bg-rn-accent/20 text-rn-text'
              : 'border-rn-border bg-rn-subpanel text-rn-muted hover:text-rn-text'
          }`}
          title="Isolated Mode (--factory-startup): Disables user preferences and custom addons for clean renders"
        >
          <Shield className="h-3.5 w-3.5" />
          <span>Isolated</span>
        </button>

        {/* Auto-exec Scripts Toggle */}
        <button
          onClick={() => setAutoExec(!autoExec)}
          disabled={isBusy}
          className={`flex items-center space-x-1 rounded border px-2 py-1 text-xs transition disabled:opacity-50 ${
            autoExec
              ? 'border-rn-rendering bg-rn-rendering/20 text-rn-text'
              : 'border-rn-border bg-rn-subpanel text-rn-muted hover:text-rn-text'
          }`}
          title="Auto-exec scripts (--enable-autoexec): Required for files with Python driver scripts"
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>Auto-exec</span>
        </button>

        <div className="h-4 w-[1px] bg-rn-border mx-1" />

        {/* Queue State Pill */}
        {isBusy && (
          <span
            className={`flex items-center space-x-1 rounded px-2 py-0.5 text-xs font-medium font-mono ${
              isRunning
                ? 'bg-rn-rendering/20 text-rn-rendering'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            <span className="capitalize">{queueState}</span>
          </span>
        )}

        {/* Start Button */}
        <button
          onClick={startQueue}
          disabled={!hasEligibleJobs || isBusy}
          className="flex items-center space-x-1 rounded bg-rn-subpanel px-2.5 py-1 text-xs font-medium text-rn-text hover:bg-rn-accent hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          title="Start queue execution"
        >
          <Play className="h-3 w-3 fill-current" />
          <span>Start</span>
        </button>

        {/* Pause / Resume Button */}
        <button
          onClick={isPaused ? resumeQueue : pauseQueue}
          disabled={!isBusy}
          className="flex items-center space-x-1 rounded bg-rn-subpanel px-2.5 py-1 text-xs font-medium text-rn-text hover:bg-rn-subpanel/80 hover:text-yellow-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
          title={isPaused ? 'Resume queue' : 'Pause queue'}
        >
          {isPaused ? (
            <Play className="h-3 w-3 fill-current" />
          ) : (
            <Pause className="h-3 w-3 fill-current" />
          )}
          <span>{pauseLabel}</span>
        </button>

        {/* Stop Button */}
        <button
          onClick={stopQueue}
          disabled={!isBusy}
          className="flex items-center space-x-1 rounded bg-rn-subpanel px-2.5 py-1 text-xs font-medium text-rn-text hover:bg-red-600 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          title="Stop queue and terminate active process"
        >
          <Square className="h-3 w-3 fill-current" />
          <span>Stop</span>
        </button>
      </div>
    </div>
  );
};
