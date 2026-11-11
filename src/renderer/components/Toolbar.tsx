import type { PostAction } from '../../core/schemas/queue-state';
import { useQueueStore } from '../store/queueStore';
import { BlenderDropdown } from './controls/BlenderDropdown';

import React, { useState } from 'react';

import {
  Calendar,
  HelpCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';

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
    setShowSoundModal,
    setShowScheduleModal,
    setShowShortcutsModal,
    activeJobId,
    addFiles,
  } = useQueueStore();

  const [overflowOpen, setOverflowOpen] = useState(false);

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

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-rn-border bg-[#0f0f10] px-3 select-none z-20">
      {/* ============================================================== */}
      {/* 1. Left Group: Primary "+ Add .blend" & Conditional Blender    */}
      {/* ============================================================== */}
      <div className="flex items-center space-x-2.5">
        <button
          type="button"
          onClick={handleAddFiles}
          disabled={isBusy}
          className="flex h-8 items-center space-x-1.5 rounded-lg bg-[#ededed] px-3.5 text-xs font-semibold text-[#141415] shadow-sm transition hover:bg-white active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Add .blend files to the queue (Ctrl+O)"
        >
          <Plus className="h-4 w-4 stroke-[2]" />
          <span>Add .blend</span>
        </button>

        {/* Blender Selector: ONLY show when multiple Blenders are detected */}
        {blenders.length > 1 && (
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px] text-rn-muted font-medium">Blender:</span>
            <BlenderDropdown
              value={selectedBlenderId || blenders[0]?.id || ''}
              options={blenderOptions}
              onChange={(val) => setSelectedBlenderId(val)}
              disabled={isBusy}
              className="w-40"
              title="Select Blender version for jobs"
            />
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 2. Centre Group: Big Start Queue & Post-Action Selector        */}
      {/* ============================================================== */}
      <div className="flex items-center space-x-3">
        {/* Render Control (Big Start vs Segmented Pause/Stop) */}
        {!isBusy ? (
          <button
            type="button"
            onClick={startQueueWithPreflight}
            disabled={!hasEligibleJobs}
            className="flex h-8 items-center space-x-2 rounded-lg bg-rn-accent px-5 text-xs font-semibold text-[#0f0f10] shadow-sm transition-colors hover:brightness-110 active:brightness-95 disabled:bg-rn-input disabled:text-rn-muted disabled:border disabled:border-rn-border disabled:shadow-none disabled:hover:brightness-100 disabled:cursor-not-allowed"
            title="Start batch render queue (Ctrl+Enter)"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Start Queue</span>
          </button>
        ) : (
          <div className="flex h-8 items-center rounded-lg border border-rn-border bg-rn-panel p-0.5 shadow-sm">
            {isRunning ? (
              <button
                type="button"
                onClick={pauseQueue}
                className="flex h-7 items-center space-x-1.5 rounded-md px-3 text-xs font-semibold text-rn-accent transition hover:bg-rn-accent/15 active:bg-rn-accent/25"
                title={pauseTooltip}
              >
                <Pause className="h-3.5 w-3.5" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeQueue}
                className="flex h-7 items-center space-x-1.5 rounded-md px-3 text-xs font-semibold text-rn-success transition hover:bg-rn-success/15 active:bg-rn-success/25"
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
              className="flex h-7 items-center space-x-1.5 rounded-md px-3 text-xs font-semibold text-rn-error transition hover:bg-rn-error/15 active:bg-rn-error/25"
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
      {/* 3. Right Group: Single Overflow Menu (MoreHorizontal)          */}
      {/* ============================================================== */}
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={() => setOverflowOpen(!overflowOpen)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
            overflowOpen
              ? 'border-rn-accent bg-rn-subpanel text-rn-text'
              : 'border-rn-border bg-rn-panel text-rn-muted hover:border-rn-muted hover:text-rn-text'
          }`}
          title="More tools & settings"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {/* Overflow Dropdown */}
        {overflowOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOverflowOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-rn-border bg-rn-subpanel py-1 shadow-2xl animate-in fade-in zoom-in-95 text-xs select-none">
              <button
                type="button"
                onClick={() => {
                  setOverflowOpen(false);
                  setShowScheduleModal(true);
                }}
                className="flex w-full items-center space-x-2 px-3 py-2 text-left text-rn-text hover:bg-rn-panel transition"
              >
                <Calendar className="h-3.5 w-3.5 text-rn-accent" />
                <span>Schedule Queue...</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOverflowOpen(false);
                  setShowSoundModal(true);
                }}
                className="flex w-full items-center space-x-2 px-3 py-2 text-left text-rn-text hover:bg-rn-panel transition"
              >
                {soundSettings.isMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-rn-muted" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-rn-success" />
                )}
                <span>Finish Sound Settings...</span>
              </button>

              <div className="my-1 h-px bg-rn-border/60" />

              <button
                type="button"
                onClick={() => {
                  setOverflowOpen(false);
                  setShowShortcutsModal(true);
                }}
                className="flex w-full items-center space-x-2 px-3 py-2 text-left text-rn-text hover:bg-rn-panel transition"
              >
                <HelpCircle className="h-3.5 w-3.5 text-rn-muted" />
                <span>Keyboard Shortcuts (?)</span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
