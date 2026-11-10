import { useQueueStore, type QueueJob } from '../store/queueStore';

import React, { useState } from 'react';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FolderOpen,
  Loader2,
  Trash2,
} from 'lucide-react';

interface JobCardProps {
  job: QueueJob;
  index: number;
  total: number;
}

export const JobCard: React.FC<JobCardProps> = ({ job, index, total }) => {
  const { blenders, updateJob, removeJob, moveJob } = useQueueStore();
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const handleBrowseOutput = async () => {
    if (typeof window !== 'undefined' && window.rnApi) {
      const selected = await window.rnApi.selectDirectory(job.outputPathPattern);
      if (selected) {
        // Append token pattern to chosen directory
        const newPattern = `${selected}/{project}_{scene}_{camera}_####.png`;
        updateJob(job.id, { outputPathPattern: newPattern });
      }
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

  return (
    <div
      className={`rounded border bg-rn-panel p-3 transition-colors ${
        job.enabled ? 'border-rn-border' : 'border-rn-border/50 opacity-60'
      }`}
    >
      {/* Top Row: Reorder, Checkbox, Filename, Status, Remove */}
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
            </div>
            <div className="text-[11px] text-rn-muted truncate" title={job.filePath}>
              {job.filePath}
            </div>
          </div>
        </div>

        {/* Status Badge & Remove Button */}
        <div className="flex items-center space-x-2 pl-3">
          {getStatusBadge()}
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
      </div>

      {/* Error Details Accordion when Failed */}
      {job.status === 'Failed' && showErrorDetails && (
        <div className="mt-2 rounded bg-black/40 p-2 text-xs text-red-300 font-mono overflow-x-auto">
          <div className="font-semibold text-red-400">Error:</div>
          <div>{job.inspectError}</div>
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
