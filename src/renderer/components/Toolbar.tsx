import { useQueueStore } from '../store/queueStore';

import React from 'react';

import { Pause, Play, Plus, Shield, Square, Terminal } from 'lucide-react';

export const Toolbar: React.FC = () => {
  const {
    blenders,
    selectedBlenderId,
    setSelectedBlenderId,
    isolatedMode,
    setIsolatedMode,
    autoExec,
    setAutoExec,
    addFiles,
  } = useQueueStore();

  const handleAddFiles = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const files = await window.rnApi.selectBlendFiles();
      if (files && files.length > 0) {
        await addFiles(files);
      }
    }
  };

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
          className="flex items-center space-x-1.5 rounded bg-rn-accent px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 active:brightness-95"
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
            className="rounded border border-rn-border bg-rn-input px-2.5 py-1 text-xs text-rn-text focus:border-rn-accent focus:outline-none"
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

      {/* Right: Options & Queue Control Buttons (Disabled for now) */}
      <div className="flex items-center space-x-2">
        {/* Isolated Mode Toggle */}
        <button
          onClick={() => setIsolatedMode(!isolatedMode)}
          className={`flex items-center space-x-1 rounded border px-2 py-1 text-xs transition ${
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
          className={`flex items-center space-x-1 rounded border px-2 py-1 text-xs transition ${
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

        {/* Start / Pause / Stop buttons (disabled for now) */}
        <button
          disabled
          className="flex items-center space-x-1 rounded bg-rn-subpanel px-2.5 py-1 text-xs font-medium text-rn-muted opacity-50 cursor-not-allowed"
          title="Start queue (Phase 3)"
        >
          <Play className="h-3 w-3 fill-current" />
          <span>Start</span>
        </button>

        <button
          disabled
          className="flex items-center space-x-1 rounded bg-rn-subpanel px-2.5 py-1 text-xs font-medium text-rn-muted opacity-50 cursor-not-allowed"
          title="Pause queue (Phase 3)"
        >
          <Pause className="h-3 w-3 fill-current" />
          <span>Pause</span>
        </button>

        <button
          disabled
          className="flex items-center space-x-1 rounded bg-rn-subpanel px-2.5 py-1 text-xs font-medium text-rn-muted opacity-50 cursor-not-allowed"
          title="Stop queue (Phase 3)"
        >
          <Square className="h-3 w-3 fill-current" />
          <span>Stop</span>
        </button>
      </div>
    </div>
  );
};
