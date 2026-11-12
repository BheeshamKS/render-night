import type { FrameRangeConfig, FrameRangeMode } from '../../core/schemas/queue-state';
import { useQueueStore, type QueueJob } from '../store/queueStore';
import { AdvancedJobDrawer } from './drawer';

import React, { useState } from 'react';

import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  Film,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Terminal,
  Trash2,
} from 'lucide-react';

interface JobCardProps {
  job: QueueJob;
  index: number;
  total: number;
}

export const JobCard: React.FC<JobCardProps> = ({ job, index, total }) => {
  const {
    blenders,
    updateJob,
    removeJob,
    moveJob,
    retryFailedFrames,
    duplicateJob,
    expandAllCameras,
    expandAllScenes,
    openInBlender,
    runPreflightCheck,
    setShowPreflightModal,
    setActiveTab,
  } = useQueueStore();
  const [showConsole, setShowConsole] = useState(false);
  const [showAdvancedDrawer, setShowAdvancedDrawer] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const currentScene = job.scenes.find((s) => s.name === job.selectedScene);
  const sceneDefaults = {
    start: currentScene?.frameStart ?? 1,
    end: currentScene?.frameEnd ?? 250,
    step: currentScene?.frameStep ?? 1,
  };
  const rangeConfig = job.rangeConfig || { mode: 'scene_default' };

  const handleRangeModeChange = (mode: FrameRangeMode) => {
    let newConfig: FrameRangeConfig;
    if (mode === 'scene_default') {
      newConfig = { mode: 'scene_default' };
    } else if (mode === 'simple') {
      newConfig = {
        mode: 'simple',
        simple: rangeConfig.simple || {
          start: sceneDefaults.start,
          end: sceneDefaults.end,
          step: job.isVideo ? 1 : sceneDefaults.step,
        },
      };
    } else if (mode === 'custom') {
      newConfig = {
        mode: 'custom',
        customExpression:
          rangeConfig.customExpression || `${sceneDefaults.start}-${sceneDefaults.end}`,
      };
    } else {
      newConfig = {
        mode: 'single_still',
        singleStillFrame: rangeConfig.singleStillFrame ?? sceneDefaults.start,
      };
    }
    updateJob(job.id, { rangeConfig: newConfig });
  };

  const handleBrowseOutput = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const selected = await window.rnApi.selectDirectory(job.outputPathPattern);
      if (selected) {
        const newPattern = `${selected}/{project}_{scene}_{camera}_####.png`;
        updateJob(job.id, { outputPathPattern: newPattern });
      }
    }
  };

  const handleOpenOutputFolder = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.openPath(job.outputPreview || job.outputPathPattern, job.filePath);
    }
  };

  const handleOpenLogsFolder = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      await window.rnApi.openLogsFolder(job.id);
    }
  };

  const getStatusBadge = () => {
    switch (job.status) {
      case 'Inspecting':
        return (
          <span className="flex items-center space-x-1 rounded bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Inspecting</span>
          </span>
        );
      case 'Queued':
        return (
          <span className="flex items-center space-x-1 rounded bg-rn-subpanel px-2 py-0.5 text-xs font-medium text-rn-muted">
            <Clock className="h-3 w-3" />
            <span>Queued</span>
          </span>
        );
      case 'Rendering':
        return (
          <span className="flex items-center space-x-1 rounded bg-rn-rendering/20 px-2 py-0.5 text-xs font-medium text-rn-rendering">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Rendering</span>
          </span>
        );
      case 'Completed':
        return (
          <span className="flex items-center space-x-1 rounded bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            <span>Completed</span>
          </span>
        );
      case 'Failed':
        return (
          <button
            onClick={() => setShowErrorDetails(!showErrorDetails)}
            className="flex items-center space-x-1 rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400 hover:bg-red-500/30"
            title="Click to toggle error details"
          >
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </button>
        );
      case 'Skipped':
        return (
          <span className="flex items-center space-x-1 rounded bg-rn-subpanel px-2 py-0.5 text-xs font-medium text-rn-muted">
            <span>Skipped</span>
          </span>
        );
    }
  };

  const renderDeviceBadge = () => {
    if (!job.deviceReport) return null;
    const { mode, fallbackToCpu, devices, computeDeviceType, threads } = job.deviceReport;

    if (fallbackToCpu) {
      return (
        <span
          className="flex items-center space-x-1 rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] font-medium text-yellow-400 border border-yellow-500/30"
          title="Requested GPU but Cycles fell back to CPU"
        >
          <AlertTriangle className="h-3 w-3" />
          <span>GPU fell back to CPU</span>
        </span>
      );
    }

    if (mode === 'GPU') {
      const activeDev = devices.find((d) => d.use && d.type !== 'CPU');
      const devName = activeDev ? activeDev.name : 'GPU';
      return (
        <span
          className="flex items-center space-x-1 rounded bg-rn-accent/20 px-2 py-0.5 text-[10px] font-medium text-rn-accent"
          title={`Compute device: ${computeDeviceType}`}
        >
          <Cpu className="h-3 w-3" />
          <span>
            GPU: {devName} ({computeDeviceType})
          </span>
        </span>
      );
    }

    return (
      <span className="flex items-center space-x-1 rounded bg-rn-subpanel px-2 py-0.5 text-[10px] font-medium text-rn-muted">
        <Cpu className="h-3 w-3" />
        <span>CPU: {threads || 'Auto'} threads</span>
      </span>
    );
  };

  return (
    <div
      className={`rounded border bg-rn-panel p-3 transition-colors ${
        job.enabled ? 'border-rn-border' : 'border-rn-border/50 opacity-60'
      }`}
    >
      {/* Top Row: Reorder, Checkbox, Filename, Device Badge, Status, Console Toggle, Remove */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          {/* Reorder Buttons */}
          <div className="flex flex-col space-y-0.5">
            <button
              disabled={index === 0}
              onClick={() => moveJob(job.id, 'up')}
              className="text-rn-muted hover:text-rn-text disabled:opacity-20"
              title="Move Up"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              disabled={index === total - 1}
              onClick={() => moveJob(job.id, 'down')}
              className="text-rn-muted hover:text-rn-text disabled:opacity-20"
              title="Move Down"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Enable Checkbox */}
          <input
            type="checkbox"
            checked={job.enabled}
            onChange={(e) => updateJob(job.id, { enabled: e.target.checked })}
            className="h-4 w-4 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0 cursor-pointer"
            title="Enable/disable job"
          />

          {/* Filename & Path Tooltip */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium text-sm text-rn-text truncate" title={job.filePath}>
                {job.fileName}
              </span>
              {job.savedWithVersion && (
                <span className="rounded bg-rn-subpanel px-1.5 py-0.5 text-[10px] text-rn-muted font-mono">
                  Blender {job.savedWithVersion}
                </span>
              )}
              {renderDeviceBadge()}
            </div>
            <div className="text-[11px] text-rn-muted truncate" title={job.filePath}>
              {job.filePath}
            </div>
          </div>
        </div>

        {/* Status Badge, Console Toggle, Overrides Toggle, Remove Button */}
        <div className="flex items-center space-x-2 pl-3">
          {getStatusBadge()}

          {/* Overrides Drawer Button */}
          <button
            onClick={() => setShowAdvancedDrawer(!showAdvancedDrawer)}
            className={`flex items-center space-x-1.5 rounded px-2 py-0.5 text-xs transition ${
              showAdvancedDrawer
                ? 'bg-rn-accent text-white font-medium'
                : Object.keys(job.overrides || {}).length > 0
                  ? 'bg-rn-accent/20 border border-rn-accent/40 text-rn-accent'
                  : 'bg-rn-subpanel text-rn-muted hover:text-rn-text'
            }`}
            title="Toggle advanced properties and overrides drawer"
          >
            <Sliders className="h-3 w-3" />
            <span>Overrides</span>
            {Object.keys(job.overrides || {}).length > 0 && (
              <span className="rounded bg-rn-accent px-1 py-0.2 text-[10px] text-white font-mono">
                {Object.keys(job.overrides || {}).length}
              </span>
            )}
          </button>

          {/* Console Drawer Button */}
          <button
            onClick={() => setShowConsole(!showConsole)}
            className={`flex items-center space-x-1 rounded px-2 py-0.5 text-xs font-mono transition ${
              showConsole
                ? 'bg-rn-accent text-white'
                : 'bg-rn-subpanel text-rn-muted hover:text-rn-text'
            }`}
            title="Toggle raw output and error drawer"
          >
            <Terminal className="h-3 w-3" />
            <span>{job.logs?.length || 0}</span>
          </button>

          <button
            onClick={() => removeJob(job.id)}
            className="rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-error transition"
            title="Remove from queue"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Middle Row: Scene, Camera, & Blender Override Dropdowns */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Scene Dropdown */}
        <div>
          <label className="block text-[11px] text-rn-muted mb-1">Scene</label>
          <select
            value={job.selectedScene}
            onChange={(e) => updateJob(job.id, { selectedScene: e.target.value })}
            disabled={job.scenes.length === 0}
            className="w-full rounded border border-rn-border bg-rn-input px-2 py-1 text-xs text-rn-text focus:border-rn-accent focus:outline-none disabled:opacity-50"
          >
            {job.scenes.length > 0 ? (
              job.scenes.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.frameStart}-{s.frameEnd})
                </option>
              ))
            ) : (
              <option value="Scene">Scene (Default)</option>
            )}
          </select>
        </div>

        {/* Camera Dropdown */}
        <div>
          <label className="block text-[11px] text-rn-muted mb-1">Camera</label>
          <select
            value={job.selectedCamera}
            onChange={(e) => updateJob(job.id, { selectedCamera: e.target.value })}
            disabled={job.availableCameras.length === 0}
            className="w-full rounded border border-rn-border bg-rn-input px-2 py-1 text-xs text-rn-text focus:border-rn-accent focus:outline-none disabled:opacity-50"
          >
            {job.availableCameras.length > 0 ? (
              job.availableCameras.map((cam) => (
                <option key={cam} value={cam}>
                  {cam}
                </option>
              ))
            ) : (
              <option value="">No Camera Found</option>
            )}
          </select>
        </div>

        {/* Blender Override Dropdown */}
        <div>
          <label className="block text-[11px] text-rn-muted mb-1">Blender Version</label>
          <select
            value={job.blenderOverrideId || ''}
            onChange={(e) =>
              updateJob(job.id, {
                blenderOverrideId: e.target.value ? e.target.value : undefined,
              })
            }
            className="w-full rounded border border-rn-border bg-rn-input px-2 py-1 text-xs text-rn-text focus:border-rn-accent focus:outline-none"
          >
            <option value="">Global Default</option>
            {blenders.map((b) => (
              <option key={b.id} value={b.id}>
                v{b.version} ({b.source})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Frame Range Section */}
      <div className="mt-3 rounded border border-rn-border/70 bg-rn-subpanel/30 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <label className="text-[11px] font-medium text-rn-muted">Frame Range:</label>
            <select
              value={rangeConfig.mode}
              onChange={(e) => handleRangeModeChange(e.target.value as FrameRangeMode)}
              className="rounded border border-rn-border bg-rn-input px-2 py-0.5 text-xs text-rn-text focus:border-rn-accent focus:outline-none"
            >
              <option value="scene_default">Scene Default</option>
              <option value="simple">Simple (Start / End / Step)</option>
              <option value="custom" disabled={job.isVideo}>
                Custom {job.isVideo ? '(Images Only)' : ''}
              </option>
              <option value="single_still" disabled={job.isVideo}>
                Single Still {job.isVideo ? '(Images Only)' : ''}
              </option>
            </select>
          </div>

          {/* Live Frame Count / Status Badge */}
          <div className="flex items-center space-x-1.5 text-xs font-mono">
            {job.customRangeError ? (
              <span className="rounded bg-red-500/20 px-2 py-0.5 text-red-400 font-sans text-[11px]">
                {job.customRangeError}
              </span>
            ) : (
              <span className="rounded bg-rn-panel border border-rn-border px-2 py-0.5 text-rn-accent">
                {job.customRangeLiveCount !== undefined
                  ? `${job.customRangeLiveCount} frame${job.customRangeLiveCount === 1 ? '' : 's'}`
                  : '—'}
              </span>
            )}
          </div>
        </div>

        {/* Mode-specific input row */}
        {rangeConfig.mode === 'scene_default' && (
          <div className="text-[11px] text-rn-muted font-mono">
            Inspected scene frames: {sceneDefaults.start} to {sceneDefaults.end} (step{' '}
            {sceneDefaults.step})
          </div>
        )}

        {rangeConfig.mode === 'simple' && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center space-x-1">
              <label className="text-[11px] text-rn-muted">Start:</label>
              <input
                type="number"
                value={rangeConfig.simple?.start ?? sceneDefaults.start}
                onChange={(e) =>
                  updateJob(job.id, {
                    rangeConfig: {
                      mode: 'simple',
                      simple: {
                        start: parseInt(e.target.value, 10) || 1,
                        end: rangeConfig.simple?.end ?? sceneDefaults.end,
                        step: job.isVideo ? 1 : (rangeConfig.simple?.step ?? 1),
                      },
                    },
                  })
                }
                className="w-16 rounded border border-rn-border bg-rn-input px-1.5 py-0.5 text-xs font-mono text-rn-text focus:border-rn-accent focus:outline-none"
              />
            </div>

            <div className="flex items-center space-x-1">
              <label className="text-[11px] text-rn-muted">End:</label>
              <input
                type="number"
                value={rangeConfig.simple?.end ?? sceneDefaults.end}
                onChange={(e) =>
                  updateJob(job.id, {
                    rangeConfig: {
                      mode: 'simple',
                      simple: {
                        start: rangeConfig.simple?.start ?? sceneDefaults.start,
                        end: parseInt(e.target.value, 10) || 1,
                        step: job.isVideo ? 1 : (rangeConfig.simple?.step ?? 1),
                      },
                    },
                  })
                }
                className="w-16 rounded border border-rn-border bg-rn-input px-1.5 py-0.5 text-xs font-mono text-rn-text focus:border-rn-accent focus:outline-none"
              />
            </div>

            <div className="flex items-center space-x-1">
              <label className="text-[11px] text-rn-muted">Step:</label>
              <input
                type="number"
                min="1"
                disabled={job.isVideo}
                value={job.isVideo ? 1 : (rangeConfig.simple?.step ?? 1)}
                onChange={(e) =>
                  updateJob(job.id, {
                    rangeConfig: {
                      mode: 'simple',
                      simple: {
                        start: rangeConfig.simple?.start ?? sceneDefaults.start,
                        end: rangeConfig.simple?.end ?? sceneDefaults.end,
                        step: Math.max(1, parseInt(e.target.value, 10) || 1),
                      },
                    },
                  })
                }
                className="w-14 rounded border border-rn-border bg-rn-input px-1.5 py-0.5 text-xs font-mono text-rn-text focus:border-rn-accent focus:outline-none disabled:opacity-50"
                title={job.isVideo ? 'Step locked to 1 for video containers' : 'Frame step'}
              />
            </div>
          </div>
        )}

        {rangeConfig.mode === 'custom' && (
          <div className="space-y-1 pt-1">
            <input
              type="text"
              value={rangeConfig.customExpression ?? ''}
              onChange={(e) =>
                updateJob(job.id, {
                  rangeConfig: {
                    mode: 'custom',
                    customExpression: e.target.value,
                  },
                })
              }
              placeholder="e.g. 50-200, 200-300 or 1-50, 75, 120-240x2"
              className="w-full rounded border border-rn-border bg-rn-input px-2 py-1 text-xs font-mono text-rn-text focus:border-rn-accent focus:outline-none"
            />
            <div className="text-[10px] text-rn-muted">
              Supports comma-separated ranges, steps (
              <span className="text-rn-accent">120-240x2</span>), and single frames. Overlaps are
              deduplicated automatically.
            </div>
          </div>
        )}

        {rangeConfig.mode === 'single_still' && (
          <div className="flex items-center space-x-2 pt-1">
            <label className="text-[11px] text-rn-muted">Frame Number:</label>
            <input
              type="number"
              value={rangeConfig.singleStillFrame ?? sceneDefaults.start}
              onChange={(e) =>
                updateJob(job.id, {
                  rangeConfig: {
                    mode: 'single_still',
                    singleStillFrame: parseInt(e.target.value, 10) || 1,
                  },
                })
              }
              className="w-20 rounded border border-rn-border bg-rn-input px-2 py-0.5 text-xs font-mono text-rn-text focus:border-rn-accent focus:outline-none"
            />
          </div>
        )}

        {/* Video Rule Violation Warning */}
        {job.videoRuleError && (
          <div className="flex items-center space-x-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1.5 text-xs text-yellow-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" />
            <span>{job.videoRuleError}</span>
          </div>
        )}

        {/* Render Missing Frames Only (Image formats only) */}
        {!job.isVideo && (
          <div className="pt-1 border-t border-rn-border/40 mt-1">
            <label className="flex items-center space-x-1.5 text-xs text-rn-muted hover:text-rn-text cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!job.renderMissingOnly}
                onChange={(e) => updateJob(job.id, { renderMissingOnly: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0 cursor-pointer"
              />
              <span>Render Missing Frames Only (scans output folder and skips existing files)</span>
            </label>
          </div>
        )}
      </div>

      {/* Failed Frames List & Retry Button */}
      {job.failedFrames && job.failedFrames.length > 0 && (
        <div className="mt-2.5 rounded border border-red-500/40 bg-red-500/10 p-2.5 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-red-400 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Failed Frames ({job.failedFrames.length}):</span>
              <span className="font-mono text-rn-text">
                [{job.failedFrames.map((f) => f.frame).join(', ')}]
              </span>
            </div>
            <button
              onClick={() => retryFailedFrames(job.id)}
              className="flex items-center space-x-1 rounded bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-500/30 border border-red-500/40 transition"
              title="Queue retry of failed frames"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Retry Failed Frames</span>
            </button>
          </div>
          {job.failedFrames.some((f) => f.stderrTail) && (
            <div className="text-[10px] font-mono text-red-300/80 max-h-20 overflow-y-auto whitespace-pre-wrap bg-black/40 p-1.5 rounded">
              {job.failedFrames
                .filter((f) => f.stderrTail)
                .map((f) => `[Frame ${f.frame}] ${f.stderrTail}`)
                .join('\n---\n')}
            </div>
          )}
        </div>
      )}

      {/* Bottom Row: Output Path & Dynamic Token Preview */}
      <div className="mt-3 space-y-1">
        <label className="block text-[11px] text-rn-muted">
          Output Pattern (supports <span className="font-mono text-rn-accent">{'{project}'}</span>,{' '}
          <span className="font-mono text-rn-accent">{'{scene}'}</span>,{' '}
          <span className="font-mono text-rn-accent">{'{camera}'}</span>,{' '}
          <span className="font-mono text-rn-accent">####</span>)
        </label>
        <div className="flex items-center space-x-1.5">
          <input
            type="text"
            value={job.outputPathPattern}
            onChange={(e) => updateJob(job.id, { outputPathPattern: e.target.value })}
            className="flex-1 rounded border border-rn-border bg-rn-input px-2.5 py-1 text-xs font-mono text-rn-text focus:border-rn-accent focus:outline-none"
            placeholder="//render/{project}/{scene}_{camera}_####.png"
          />
          <button
            onClick={handleBrowseOutput}
            className="flex items-center space-x-1 rounded border border-rn-border bg-rn-subpanel px-2.5 py-1 text-xs text-rn-muted hover:text-rn-text transition"
            title="Browse directory"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Browse</span>
          </button>
        </div>

        {/* Dynamic Token Preview */}
        <div className="flex items-center space-x-1 text-[11px] text-rn-muted pt-0.5">
          <span>Preview:</span>
          <span className="font-mono text-rn-accent truncate" title={job.outputPreview}>
            {job.outputPreview}
          </span>
        </div>

        {/* Stitch to MP4 when finished option (Image formats only) */}
        {!job.isVideo && (
          <div className="flex items-center space-x-2 pt-1.5 text-xs">
            <label className="flex items-center space-x-1.5 cursor-pointer text-rn-muted hover:text-rn-text">
              <input
                type="checkbox"
                checked={job.stitchToMp4 || false}
                onChange={(e) => updateJob(job.id, { stitchToMp4: e.target.checked })}
                className="rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0 focus:ring-offset-0"
              />
              <span>Stitch to MP4 when finished</span>
            </label>
          </div>
        )}
      </div>

      {/* Job Tools Toolbar */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-rn-border/50 pt-2 text-xs">
        <div className="flex items-center space-x-1.5">
          {/* Preflight Check Button */}
          <button
            onClick={async () => {
              await runPreflightCheck(job.id);
              setShowPreflightModal(true);
            }}
            className="flex items-center space-x-1 rounded bg-rn-subpanel px-2 py-0.5 text-[11px] text-rn-text hover:bg-rn-accent hover:text-white transition"
            title="Run pre-flight validation on this job"
          >
            <ShieldCheck className="h-3 w-3 text-rn-accent" />
            <span>Pre-flight</span>
          </button>

          {/* Duplicate Job */}
          <button
            onClick={() => duplicateJob(job.id)}
            className="flex items-center space-x-1 rounded bg-rn-subpanel px-2 py-0.5 text-[11px] text-rn-muted hover:text-rn-text transition"
            title="Duplicate job"
          >
            <Copy className="h-3 w-3" />
            <span>Duplicate</span>
          </button>

          {/* Render All Cameras */}
          <button
            onClick={() => expandAllCameras(job.id)}
            disabled={job.availableCameras.length <= 1}
            className="flex items-center space-x-1 rounded bg-rn-subpanel px-2 py-0.5 text-[11px] text-rn-muted hover:text-rn-text transition disabled:opacity-30 disabled:cursor-not-allowed"
            title={
              job.availableCameras.length > 1
                ? `Expand into ${job.availableCameras.length} separate jobs (one per camera)`
                : 'Only 1 camera available'
            }
          >
            <Camera className="h-3 w-3" />
            <span>All Cameras ({job.availableCameras.length})</span>
          </button>

          {/* Render All Scenes */}
          <button
            onClick={() => expandAllScenes(job.id)}
            disabled={job.scenes.length <= 1}
            className="flex items-center space-x-1 rounded bg-rn-subpanel px-2 py-0.5 text-[11px] text-rn-muted hover:text-rn-text transition disabled:opacity-30 disabled:cursor-not-allowed"
            title={
              job.scenes.length > 1
                ? `Expand into ${job.scenes.length} separate jobs (one per scene)`
                : 'Only 1 scene available'
            }
          >
            <Layers className="h-3 w-3" />
            <span>All Scenes ({job.scenes.length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* View Sequence in Viewer (Completed image jobs) */}
          {job.status === 'Completed' && !job.isVideo && (
            <button
              onClick={() => {
                setActiveTab('sequences');
              }}
              className="flex items-center space-x-1 rounded bg-rn-accent/20 border border-rn-accent/40 px-2 py-0.5 text-[11px] text-rn-accent hover:bg-rn-accent hover:text-white transition"
              title="Open Sequence Viewer for this job's rendered frames"
            >
              <Film className="h-3 w-3" />
              <span>View Sequence</span>
            </button>
          )}

          {/* Open in Blender GUI */}
          <button
            onClick={() => openInBlender(job.id)}
            className="flex items-center space-x-1 rounded bg-rn-subpanel px-2 py-0.5 text-[11px] text-rn-muted hover:text-rn-accent hover:bg-rn-subpanel/80 transition"
            title="Open this file in Blender GUI (runs separately from queue)"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Open in Blender</span>
          </button>
        </div>
      </div>

      {/* Advanced Properties & Overrides Drawer */}
      {showAdvancedDrawer && <AdvancedJobDrawer job={job} />}

      {/* Collapsible Console Drawer */}
      {showConsole && (
        <div className="mt-3 rounded border border-rn-border bg-black/60 p-2 text-xs font-mono">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-rn-border/50 text-[11px] text-rn-muted">
            <div className="flex items-center space-x-1">
              <Terminal className="h-3.5 w-3.5 text-rn-accent" />
              <span>Job Console ({job.logs?.length || 0} lines)</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleOpenOutputFolder}
                className="flex items-center space-x-1 text-rn-muted hover:text-rn-text"
                title="Open output destination folder in file explorer"
              >
                <FolderOpen className="h-3 w-3" />
                <span>Open Output Folder</span>
              </button>
              <button
                onClick={handleOpenLogsFolder}
                className="flex items-center space-x-1 text-rn-muted hover:text-rn-text"
                title="Open log files on disk"
              >
                <HardDrive className="h-3 w-3" />
                <span>Open Logs Folder</span>
              </button>
            </div>
          </div>

          {/* Overrides Report if emitted by runner */}
          {job.overridesReport && (
            <div className="mb-2 p-2 rounded bg-rn-panel/80 border border-rn-border font-sans text-[11px] space-y-1">
              <div className="font-semibold text-rn-text flex items-center justify-between">
                <span>Runner Overrides Report:</span>
                <span className="text-[10px] text-rn-muted font-mono">
                  {job.overridesReport.applied?.length || 0} applied
                  {job.overridesReport.skipped?.length
                    ? `, ${job.overridesReport.skipped.length} skipped`
                    : ''}
                </span>
              </div>
              {job.overridesReport.applied && job.overridesReport.applied.length > 0 && (
                <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                  {job.overridesReport.applied.map((app, idx) => (
                    <span key={idx} className="rounded bg-rn-input px-1.5 py-0.5 text-green-400">
                      {app.rnaPath}: {String(app.value)}
                    </span>
                  ))}
                </div>
              )}
              {job.overridesReport.skipped && job.overridesReport.skipped.length > 0 && (
                <div className="space-y-0.5 pt-1 border-t border-rn-border/50 text-yellow-400">
                  {job.overridesReport.skipped.map((sk, idx) => (
                    <div key={idx} className="font-mono text-[10px]">
                      Skipped {sk.rnaPath}: {sk.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 select-text">
            {job.logs && job.logs.length > 0 ? (
              job.logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`leading-tight break-all ${
                    log.isError
                      ? 'text-red-400 font-semibold'
                      : log.stream === 'stderr'
                        ? 'text-yellow-400/80'
                        : 'text-rn-text/70'
                  }`}
                >
                  {log.line}
                </div>
              ))
            ) : (
              <div className="text-rn-muted py-2 text-center">No logs recorded yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Error Details Accordion when Failed */}
      {job.status === 'Failed' && showErrorDetails && (
        <div className="mt-2 rounded bg-black/40 p-2 text-xs text-red-300 font-mono overflow-x-auto">
          <div className="font-semibold text-red-400">Error:</div>
          <div>{job.error || job.inspectError}</div>
          {job.inspectStderrTail && (
            <div className="mt-1">
              <div className="font-semibold text-red-400">Blender stderr:</div>
              <pre className="text-[10px] whitespace-pre-wrap">{job.inspectStderrTail}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
