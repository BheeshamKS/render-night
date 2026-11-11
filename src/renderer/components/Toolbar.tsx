import type { PostAction } from '../../core/schemas/queue-state';
import { useQueueStore } from '../store/queueStore';
import { BlenderDropdown } from './controls/BlenderDropdown';

import React from 'react';

import { Bookmark, Moon, Pause, Play, Plus, Square, Volume2, VolumeX } from 'lucide-react';

export const Toolbar: React.FC = () => {
  const {
    jobs,
    blenders,
    selectedBlenderId,
    setSelectedBlenderId,
    queueState,
    startQueueWithPreflight,
    pauseQueue,
    resumeQueue,
    stopQueue,
    postAction,
    setPostAction,
    soundSettings,
    setSoundSettings,
    activeJobId,
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

  const hasEligibleJobs = jobs.some((j) => j.enabled && j.status !== 'Completed');
  const isRunning = queueState === 'running';
  const isPaused = queueState === 'paused';
  const isBusy = isRunning || isPaused;

  const activeJob = jobs.find((j) => j.id === activeJobId);
  const pauseTooltip = isPaused
    ? 'Resume queue execution'
    : activeJob?.isVideo
      ? 'Pause after finishing current video job'
      : 'Pause after finishing current frame';

  const blenderOptions = blenders.map((b) => ({
    value: b.id,
    label: `Blender ${b.version}`,
    sublabel: b.isPortable ? 'Portable' : b.source,
  }));

  const postActionOptions = [
    { value: 'none', label: 'Do nothing' },
    { value: 'sleep', label: 'Sleep' },
    { value: 'hibernate', label: 'Hibernate' },
    { value: 'shutdown', label: 'Shutdown' },
    { value: 'restart', label: 'Restart' },
    { value: 'close_app', label: 'Close Render Night' },
  ];

  const toggleMute = () => {
    setSoundSettings({ isMuted: !soundSettings.isMuted });
  };

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-rn-border bg-[#202020] px-3 select-none z-20">
      {/* ============================================================== */}
      {/* 1. Left Group: "Add .blend" Primary Button & Blender Dropdown   */}
      {/* ============================================================== */}
      <div className="flex items-center space-x-2.5">
        <button
          type="button"
          onClick={handleAddFiles}
          disabled={isBusy}
          className="flex h-7 items-center space-x-1.5 rounded bg-rn-accent px-3 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Add .blend files to the queue (Ctrl+O)"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add .blend</span>
        </button>

        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] text-rn-muted font-medium">Blender:</span>
          {blenderOptions.length > 0 ? (
            <BlenderDropdown
              value={selectedBlenderId || blenders[0]?.id || ''}
              options={blenderOptions}
              onChange={(val) => setSelectedBlenderId(val)}
              disabled={isBusy}
              className="w-44"
              title="Select Blender version for jobs"
            />
          ) : (
            <span className="rounded bg-rn-subpanel px-2 py-0.5 text-xs text-rn-error">
              No Blender Detected
            </span>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. Centre Group: Big Start / Segmented Pause-Stop & Post-Action */}
      {/* ============================================================== */}
      <div className="flex items-center space-x-3">
        {/* Render Control (Start vs Pause/Stop Segmented Control) */}
        {!isBusy ? (
          <button
            type="button"
            onClick={startQueueWithPreflight}
            disabled={!hasEligibleJobs}
            className="flex h-8 items-center space-x-2 rounded bg-[#388e3c] px-5 text-xs font-bold text-white shadow transition hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Start batch render queue (Ctrl+Enter)"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>Start Queue</span>
          </button>
        ) : (
          <div className="flex h-8 items-center rounded border border-rn-border bg-rn-input p-0.5 shadow-sm">
            {isRunning ? (
              <button
                type="button"
                onClick={pauseQueue}
                className="flex h-7 items-center space-x-1.5 rounded px-3 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-500/20 active:bg-yellow-500/30"
                title={pauseTooltip}
              >
                <Pause className="h-3.5 w-3.5" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeQueue}
                className="flex h-7 items-center space-x-1.5 rounded px-3 text-xs font-semibold text-green-400 transition hover:bg-green-500/20 active:bg-green-500/30"
                title="Resume queue execution"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Resume</span>
              </button>
            )}

            <div className="h-4 w-px bg-rn-border mx-0.5" />

            <button
              type="button"
              onClick={stopQueue}
              className="flex h-7 items-center space-x-1.5 rounded px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 active:bg-red-500/30"
              title="Stop queue cleanly (kills current Blender process and saves progress)"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Stop</span>
            </button>
          </div>
        )}

        {/* Post-Queue Action Selector */}
        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] text-rn-muted font-medium">When finished:</span>
          <BlenderDropdown
            value={postAction}
            options={postActionOptions}
            onChange={(val) => setPostAction(val as PostAction)}
            className="w-40"
            title="Action to execute after all queue jobs complete gracefully"
          />
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. Right Group: Presets, Sound Mute/Volume & Sleep-Lock Pill    */}
      {/* ============================================================== */}
      <div className="flex items-center space-x-2">
        {/* Sleep Lock Status Indicator */}
        {isRunning && (
          <div
            className="flex h-6 items-center space-x-1.5 rounded border border-green-500/40 bg-green-500/10 px-2 text-[10px] font-medium text-green-400 animate-in fade-in"
            title="System sleep is actively prevented while rendering is in progress"
          >
            <Moon className="h-3 w-3" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            <span>Sleep Blocked</span>
          </div>
        )}

        {/* Presets Button */}
        <button
          type="button"
          onClick={() => {
            const { jobs } = useQueueStore.getState();
            if (jobs.length > 0) {
              useQueueStore.getState().addLog(`Presets menu ready.`);
            }
          }}
          className="flex h-7 items-center space-x-1 rounded border border-rn-border bg-rn-panel px-2.5 text-xs text-rn-text transition hover:border-rn-muted hover:bg-rn-subpanel"
          title="Manage and apply render presets"
        >
          <Bookmark className="h-3.5 w-3.5 text-rn-accent" />
          <span>Presets</span>
        </button>

        {/* Volume / Mute Toggle */}
        <button
          type="button"
          onClick={toggleMute}
          className={`flex h-7 w-7 items-center justify-center rounded border transition ${
            soundSettings.isMuted
              ? 'border-rn-border bg-rn-panel text-rn-muted hover:text-rn-text'
              : 'border-rn-border bg-rn-panel text-rn-text hover:border-rn-muted'
          }`}
          title={
            soundSettings.isMuted
              ? 'Unmute finish sound notification'
              : `Finish sound enabled (Volume: ${soundSettings.volume}%)`
          }
        >
          {soundSettings.isMuted ? (
            <VolumeX className="h-3.5 w-3.5 text-rn-muted" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-green-400" />
          )}
        </button>
      </div>
    </header>
  );
};
