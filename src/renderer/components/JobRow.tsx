import { type QueueJob, useQueueStore } from '../store/queueStore';
import { BlenderDropdown } from './controls/BlenderDropdown';

import React, { useMemo, useState } from 'react';

import {
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  Film,
  FolderOpen,
  GripVertical,
  Layers,
  Loader2,
  MoreVertical,
  ShieldCheck,
  Sliders,
  Trash2,
  XCircle,
} from 'lucide-react';

export interface JobRowProps {
  job: QueueJob;
  index: number;
}

export const JobRow: React.FC<JobRowProps> = ({ job, index: _index }) => {
  const {
    selectedJobId,
    selectedJobIds,
    setSelectedJobId,
    toggleSelectJobId,
    selectJobRange,
    updateJob,
    removeJob,
    duplicateJob,
    expandAllCameras,
    expandAllScenes,
    openInBlender,
    runPreflightCheck,
    setShowPreflightModal,
    copyOverrides,
    pasteOverrides,
    copiedOverrides,
  } = useQueueStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const isSelected = selectedJobId === job.id || selectedJobIds.includes(job.id);
  const isPrimarySelected = selectedJobId === job.id;

  // Handle multi-select with Shift and Ctrl/Cmd
  const handleRowClick = (e: React.MouseEvent) => {
    // If clicking on interactive controls (selects, buttons, checkboxes), don't hijack
    if ((e.target as HTMLElement).closest('button, select, input')) {
      return;
    }

    if (e.shiftKey) {
      selectJobRange(job.id);
    } else if (e.ctrlKey || e.metaKey) {
      toggleSelectJobId(job.id);
    } else {
      setSelectedJobId(job.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedJobIds.includes(job.id)) {
      setSelectedJobId(job.id);
    }
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  // Status Chip config
  const statusConfig = useMemo(() => {
    switch (job.status) {
      case 'Inspecting':
        return {
          label: 'Inspecting',
          className: 'bg-blue-950/70 border-blue-800 text-blue-400 animate-pulse',
          icon: Loader2,
          iconClass: 'animate-spin',
        };
      case 'Rendering':
        return {
          label: 'Rendering',
          className: 'bg-amber-950/70 border-amber-800 text-amber-400 font-semibold',
          icon: Loader2,
          iconClass: 'animate-spin',
        };
      case 'Completed':
        return {
          label: 'Completed',
          className: 'bg-emerald-950/70 border-emerald-800 text-emerald-400',
          icon: CheckCircle2,
          iconClass: '',
        };
      case 'Failed':
        return {
          label: 'Failed',
          className: 'bg-rose-950/70 border-rose-800 text-rose-400 font-semibold',
          icon: XCircle,
          iconClass: '',
        };
      case 'Skipped':
        return {
          label: 'Skipped',
          className: 'bg-neutral-900 border-neutral-800 text-neutral-500',
          icon: Clock,
          iconClass: '',
        };
      case 'Queued':
      default:
        return {
          label: 'Queued',
          className: 'bg-neutral-800/80 border-neutral-700 text-neutral-300',
          icon: Clock,
          iconClass: '',
        };
    }
  }, [job.status]);

  // Frame count and range string
  const frameRangeText = useMemo(() => {
    const currentScene = job.scenes.find((s) => s.name === job.selectedScene);
    const start = job.rangeConfig.simple?.start ?? currentScene?.frameStart ?? 1;
    const end = job.rangeConfig.simple?.end ?? currentScene?.frameEnd ?? 250;
    const count =
      job.customRangeLiveCount ||
      job.totalFrames ||
      (job.rangeConfig.mode === 'single_still' ? 1 : Math.max(1, end - start + 1));

    if (job.rangeConfig.mode === 'single_still') {
      return `Still · 1 f`;
    }
    if (job.rangeConfig.mode === 'custom') {
      return `Custom · ${count} f`;
    }
    return `${start}-${end} · ${count} f`;
  }, [job.scenes, job.selectedScene, job.rangeConfig, job.customRangeLiveCount, job.totalFrames]);

  // Device badge text
  const deviceBadge = useMemo(() => {
    if (job.deviceReport) {
      if (job.deviceReport.mode === 'GPU') {
        const firstDev = job.deviceReport.devices[0];
        const devName =
          (typeof firstDev === 'object' && firstDev ? firstDev.name : String(firstDev || 'GPU')) ||
          'GPU';
        const shortName = devName.replace('NVIDIA GeForce ', '').replace('NVIDIA ', '');
        return `GPU · ${shortName} · ${job.deviceReport.computeDeviceType}`;
      }
      return 'CPU';
    }
    return 'GPU / CPU';
  }, [job.deviceReport]);

  const overrideCount = Object.keys(job.overrides || {}).length;

  // Scene & Camera options
  const sceneOptions = job.scenes.map((s) => ({ value: s.name, label: s.name }));
  const cameraOptions = (job.availableCameras || []).map((c) => ({ value: c, label: c }));

  // Progress percentage
  const progressPct =
    job.totalFrames && job.completedFrames
      ? Math.min(100, Math.round((job.completedFrames / job.totalFrames) * 100))
      : 0;

  return (
    <div
      onClick={handleRowClick}
      onContextMenu={handleContextMenu}
      className={`group relative flex h-[60px] w-full items-center justify-between border-b border-rn-border/80 px-2.5 py-1.5 transition-colors select-none ${
        isPrimarySelected
          ? 'bg-rn-panel ring-1 ring-inset ring-rn-accent/60'
          : isSelected
            ? 'bg-rn-panel/70'
            : 'hover:bg-rn-subpanel/50 bg-[#1e1e1e]'
      } ${!job.enabled ? 'opacity-50' : ''}`}
    >
      {/* ------------------------------------------------------------ */}
      {/* Left: Drag Handle, Checkbox, Status & Thumbnail              */}
      {/* ------------------------------------------------------------ */}
      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
        {/* Drag Handle */}
        <div
          className="cursor-grab text-rn-muted/40 hover:text-rn-muted active:cursor-grabbing p-0.5"
          title="Drag to reorder queue"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Enabled Checkbox */}
        <input
          type="checkbox"
          checked={job.enabled}
          onChange={(e) => updateJob(job.id, { enabled: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0 cursor-pointer"
          title={job.enabled ? 'Job enabled for render' : 'Job skipped'}
        />

        {/* Status Chip */}
        <div
          className={`flex h-5 items-center space-x-1 rounded-full border px-2 text-[10px] uppercase font-bold tracking-wider ${statusConfig.className}`}
        >
          <statusConfig.icon className={`h-2.5 w-2.5 ${statusConfig.iconClass}`} />
          <span>{statusConfig.label}</span>
        </div>

        {/* Frame Thumbnail Preview */}
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-rn-border bg-rn-bg overflow-hidden shadow-inner"
          title="Preview of last rendered frame"
        >
          {job.outputPreview && job.status === 'Completed' ? (
            <img
              src={`file://${job.outputPreview}`}
              alt="Thumbnail"
              className="h-full w-full object-cover"
              onError={(e) => {
                // Fallback to placeholder on missing file
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <Film className="h-4 w-4 text-rn-muted/40" />
          )}
        </div>

        {/* Filename & Path */}
        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center space-x-2">
            <span
              className="text-xs font-bold text-rn-text truncate hover:text-white transition-colors"
              title={job.fileName}
            >
              {job.fileName}
            </span>

            {/* Overrides Badge */}
            {overrideCount > 0 && (
              <span
                className="rounded bg-rn-accent/20 border border-rn-accent/40 px-1.5 py-0.2 text-[9px] font-mono text-rn-accent font-medium"
                title={`${overrideCount} RNA property override(s) applied`}
              >
                {overrideCount} override{overrideCount === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <span
            className="text-[10px] text-rn-muted truncate max-w-xs font-mono"
            title={job.filePath}
          >
            {job.filePath}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Centre: Compact Scene/Camera & Frame Range                   */}
      {/* ------------------------------------------------------------ */}
      <div className="flex items-center space-x-2 flex-shrink-0 px-2">
        {/* Scene Selector */}
        {sceneOptions.length > 0 && (
          <BlenderDropdown
            value={job.selectedScene}
            options={sceneOptions}
            onChange={(val) => updateJob(job.id, { selectedScene: val })}
            className="w-24"
            title="Active Scene"
          />
        )}

        {/* Camera Selector */}
        {cameraOptions.length > 0 && (
          <BlenderDropdown
            value={job.selectedCamera}
            options={cameraOptions}
            onChange={(val) => updateJob(job.id, { selectedCamera: val })}
            className="w-24"
            title="Active Camera"
          />
        )}

        {/* Frame Range Chip */}
        <div
          className="flex h-6 items-center rounded border border-rn-border bg-rn-input px-2 text-[11px] font-mono text-rn-text"
          title={`Frame range: ${frameRangeText}`}
        >
          {frameRangeText}
        </div>

        {/* Device Badge */}
        <div
          className="flex h-6 items-center space-x-1 rounded border border-rn-border bg-rn-subpanel px-2 text-[10px] font-medium text-rn-text truncate max-w-[150px]"
          title={`Compute Device: ${deviceBadge}`}
        >
          <Cpu className="h-3 w-3 text-rn-accent flex-shrink-0" />
          <span className="truncate">{deviceBadge}</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Right: Truncated Output & Actions Overflow Menu               */}
      {/* ------------------------------------------------------------ */}
      <div className="flex items-center space-x-2 flex-shrink-0 pl-2">
        {/* Output Path Preview & Folder Button */}
        <div className="flex items-center space-x-1">
          <span
            className="hidden xl:inline-block max-w-[160px] truncate font-mono text-[10px] text-rn-muted"
            title={job.outputPathPattern}
          >
            {job.outputPathPattern}
          </span>

          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (window.rnApi) {
                const dir = job.outputPathPattern.split('/')[0] || '';
                await window.rnApi.openPath(dir);
              }
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Open render output folder"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Overflow Menu Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Job actions"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>

          {/* Overflow Dropdown Menu */}
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-rn-border bg-rn-panel py-1 shadow-2xl animate-in fade-in zoom-in-95"
            >
              <button
                type="button"
                onClick={() => {
                  duplicateJob(job.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-xs text-rn-text hover:bg-rn-subpanel"
              >
                <Copy className="h-3.5 w-3.5 text-rn-muted" />
                <span>Duplicate Job</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  expandAllCameras(job.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-xs text-rn-text hover:bg-rn-subpanel"
              >
                <Camera className="h-3.5 w-3.5 text-rn-muted" />
                <span>Render All Cameras</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  expandAllScenes(job.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-xs text-rn-text hover:bg-rn-subpanel"
              >
                <Layers className="h-3.5 w-3.5 text-rn-muted" />
                <span>Render All Scenes</span>
              </button>

              <div className="my-1 h-px bg-rn-border/50" />

              <button
                type="button"
                onClick={() => {
                  copyOverrides(job.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-xs text-rn-text hover:bg-rn-subpanel"
              >
                <Sliders className="h-3.5 w-3.5 text-rn-accent" />
                <span>Copy Overrides</span>
              </button>

              {copiedOverrides && (
                <button
                  type="button"
                  onClick={() => {
                    pasteOverrides([job.id]);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-xs text-rn-text hover:bg-rn-subpanel"
                >
                  <Sliders className="h-3.5 w-3.5 text-rn-accent" />
                  <span>Paste Overrides</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  setMenuOpen(false);
                  await runPreflightCheck(job.id);
                  setShowPreflightModal(true);
                }}
                className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-xs text-rn-text hover:bg-rn-subpanel"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                <span>Pre-flight Check</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  openInBlender(job.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-xs text-rn-text hover:bg-rn-subpanel"
              >
                <ExternalLink className="h-3.5 w-3.5 text-rn-muted" />
                <span>Open in Blender</span>
              </button>

              <div className="my-1 h-px bg-rn-border/50" />

              <button
                type="button"
                onClick={() => {
                  removeJob(job.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-xs text-rose-400 hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                <span>Remove Job</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu (Right Click) */}
      {contextMenuPos && (
        <div
          style={{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }}
          className="fixed z-50 w-48 rounded border border-rn-border bg-rn-panel py-1 shadow-2xl text-xs select-none"
          onClick={() => setContextMenuPos(null)}
          onMouseLeave={() => setContextMenuPos(null)}
        >
          <button
            type="button"
            onClick={() => duplicateJob(job.id)}
            className="flex w-full items-center space-x-2 px-3 py-1.5 text-rn-text hover:bg-rn-subpanel"
          >
            <Copy className="h-3.5 w-3.5 text-rn-muted" />
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            onClick={() => copyOverrides(job.id)}
            className="flex w-full items-center space-x-2 px-3 py-1.5 text-rn-text hover:bg-rn-subpanel"
          >
            <Sliders className="h-3.5 w-3.5 text-rn-accent" />
            <span>Copy Overrides</span>
          </button>
          <button
            type="button"
            onClick={() => removeJob(job.id)}
            className="flex w-full items-center space-x-2 px-3 py-1.5 text-rose-400 hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
            <span>Remove</span>
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Integrated Bottom Progress Bar (Rendering state)             */}
      {/* ------------------------------------------------------------ */}
      {job.status === 'Rendering' && (
        <div className="absolute left-0 bottom-0 right-0 h-1 bg-rn-border overflow-hidden pointer-events-none">
          <div
            className="h-full bg-rn-rendering transition-all duration-150 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
};
