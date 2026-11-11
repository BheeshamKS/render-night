import { getRnaDefaultValue } from '../../core/overrides';
import { type QueueJob, useQueueStore } from '../store/queueStore';

import React, { useMemo, useState } from 'react';

import {
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  GripVertical,
  Layers,
  Loader2,
  MoreVertical,
  Pencil,
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
    openJobDrawer,
  } = useQueueStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const isSelected = selectedJobId === job.id || selectedJobIds.includes(job.id);
  const isPrimarySelected = selectedJobId === job.id;

  // Multi-select with Shift and Ctrl/Cmd
  const handleRowClick = (e: React.MouseEvent) => {
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

  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input')) {
      return;
    }
    openJobDrawer(job.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedJobIds.includes(job.id)) {
      setSelectedJobId(job.id);
    }
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  // Status Chip config (solid badges, no conflicting borders)
  const statusConfig = useMemo(() => {
    switch (job.status) {
      case 'Inspecting':
        return {
          label: 'Inspecting',
          className: 'bg-blue-900/80 text-blue-200 animate-pulse',
          icon: Loader2,
          iconClass: 'animate-spin',
        };
      case 'Rendering': {
        const pct =
          job.totalFrames && job.completedFrames
            ? Math.min(100, Math.round((job.completedFrames / job.totalFrames) * 100))
            : 0;
        return {
          label: `Rendering ${pct}%`,
          className: 'bg-[#92400e] text-amber-100 font-bold',
          icon: Loader2,
          iconClass: 'animate-spin',
        };
      }
      case 'Completed':
        return {
          label: 'Done',
          className: 'bg-[#14532d] text-emerald-200 font-semibold',
          icon: CheckCircle2,
          iconClass: '',
        };
      case 'Failed':
        return {
          label: 'Failed',
          className: 'bg-[#7f1d1d] text-rose-200 font-bold',
          icon: XCircle,
          iconClass: '',
        };
      case 'Skipped':
        return {
          label: 'Skipped',
          className: 'bg-[#262626] text-neutral-400',
          icon: Clock,
          iconClass: '',
        };
      case 'Queued':
      default:
        return {
          label: 'Queued',
          className: 'bg-[#2d2d2d] text-neutral-300 font-medium',
          icon: Clock,
          iconClass: '',
        };
    }
  }, [job.status, job.completedFrames, job.totalFrames]);

  // Derived effective settings summary string
  const currentScene = job.scenes.find((s) => s.name === job.selectedScene) || job.scenes[0];
  const sceneName = job.selectedScene || currentScene?.name || 'Scene';
  const cameraName = job.selectedCamera || currentScene?.activeCamera || 'Camera';

  const start = job.rangeConfig.simple?.start ?? currentScene?.frameStart ?? 1;
  const end = job.rangeConfig.simple?.end ?? currentScene?.frameEnd ?? 250;
  const count =
    job.customRangeLiveCount ||
    job.totalFrames ||
    (job.rangeConfig.mode === 'single_still' ? 1 : Math.max(1, end - start + 1));
  const framesText =
    job.rangeConfig.mode === 'single_still'
      ? `Still (1f)`
      : job.rangeConfig.mode === 'custom'
        ? `Custom (${count}f)`
        : `${start}-${end} (${count}f)`;

  const defaultEngine = currentScene
    ? (getRnaDefaultValue(currentScene, 'scene.render.engine') as string)
    : 'BLENDER_EEVEE_NEXT';
  const rawEngine =
    (job.overrides?.['scene.render.engine'] as string) || defaultEngine || 'BLENDER_EEVEE_NEXT';
  const engineShort = rawEngine.includes('CYCLES')
    ? 'Cycles'
    : rawEngine.includes('WORKBENCH')
      ? 'Workbench'
      : 'EEVEE';
  const rawDevice = (job.overrides?.['scene.cycles.device'] as string) || 'GPU';
  const engineDevice = engineShort === 'Cycles' ? `Cycles ${rawDevice}` : engineShort;

  const resX =
    (job.overrides?.['scene.render.resolution_x'] as number) ?? currentScene?.resolutionX ?? 1920;
  const resY =
    (job.overrides?.['scene.render.resolution_y'] as number) ?? currentScene?.resolutionY ?? 1080;
  const resPct =
    (job.overrides?.['scene.render.resolution_percentage'] as number) ??
    currentScene?.resolutionPercentage ??
    100;
  const resText = resPct !== 100 ? `${resX}x${resY} (${resPct}%)` : `${resX}x${resY}`;

  const defaultFormat = currentScene
    ? (getRnaDefaultValue(currentScene, 'scene.render.image_settings.file_format') as string)
    : 'PNG';
  const rawFormat = (
    (job.overrides?.['scene.render.image_settings.file_format'] as string) ??
    defaultFormat ??
    'PNG'
  )
    .replace('OPEN_EXR', 'EXR')
    .replace('FFMPEG', 'MP4');

  const summaryString = `Scene: ${sceneName} · Camera: ${cameraName} · Frames: ${framesText} · ${engineDevice} · ${resText} · ${rawFormat}`;

  // Active rendering device report badge
  const activeDeviceText = useMemo(() => {
    if (job.status !== 'Rendering' || !job.deviceReport) return null;
    if (job.deviceReport.mode === 'GPU') {
      const firstDev = job.deviceReport.devices[0];
      const devName =
        (typeof firstDev === 'object' && firstDev ? firstDev.name : String(firstDev || 'GPU')) ||
        'GPU';
      const short = devName.replace('NVIDIA GeForce ', '').replace('NVIDIA ', '');
      return `GPU · ${short}`;
    }
    return 'CPU';
  }, [job.status, job.deviceReport]);

  const overrideCount = Object.keys(job.overrides || {}).length;

  const progressPct =
    job.totalFrames && job.completedFrames
      ? Math.min(100, Math.round((job.completedFrames / job.totalFrames) * 100))
      : 0;

  return (
    <div
      onClick={handleRowClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      className={`group relative flex h-14 w-full flex-col justify-center border-b border-rn-border/80 px-3 py-1.5 transition-colors select-none ${
        isPrimarySelected
          ? 'bg-rn-panel ring-1 ring-inset ring-rn-accent/60'
          : isSelected
            ? 'bg-rn-panel/70'
            : 'hover:bg-rn-subpanel/50 bg-[#1e1e1e]'
      } ${!job.enabled ? 'opacity-50' : ''}`}
    >
      {/* ============================================================== */}
      {/* Line 1: Drag handle, Checkbox, Bold Filename, Status, Actions  */}
      {/* ============================================================== */}
      <div className="flex items-center justify-between min-w-0 w-full space-x-2">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          {/* Drag Handle */}
          <div
            className="cursor-grab text-rn-muted/40 hover:text-rn-muted active:cursor-grabbing p-0.5 flex-shrink-0"
            title="Drag to reorder queue"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>

          {/* Enabled Checkbox */}
          <input
            type="checkbox"
            checked={job.enabled}
            onChange={(e) => updateJob(job.id, { enabled: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0 cursor-pointer flex-shrink-0"
            title={job.enabled ? 'Job enabled for render' : 'Job skipped'}
          />

          {/* Filename in Bold (takes all remaining width) */}
          <span
            className="text-xs font-bold text-white truncate min-w-0 flex-1 hover:text-rn-accent transition-colors cursor-pointer"
            onClick={() => openJobDrawer(job.id)}
            title={`${job.fileName}\n${job.filePath}`}
          >
            {job.fileName}
          </span>
        </div>

        {/* Right side of Line 1: Quick Hover Actions, Status Chip, More Menu */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {/* Quick Hover Action Buttons */}
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Edit / Drawer Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openJobDrawer(job.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-white transition"
              title="Edit render settings in drawer"
            >
              <Pencil className="h-3 w-3" />
            </button>

            {/* Open Output Folder */}
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (window.rnApi) {
                  const dir = job.outputPathPattern.split('/')[0] || '';
                  await window.rnApi.openPath(dir);
                }
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-white transition"
              title="Open output directory"
            >
              <FolderOpen className="h-3 w-3" />
            </button>

            {/* Delete Job */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeJob(job.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-rn-muted hover:bg-rose-500/20 hover:text-rose-400 transition"
              title="Remove job from queue"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>

          {/* Solid Status Chip */}
          <div
            className={`flex h-5 items-center space-x-1 rounded px-2 text-[10px] uppercase tracking-wider ${statusConfig.className}`}
          >
            <statusConfig.icon className={`h-2.5 w-2.5 ${statusConfig.iconClass}`} />
            <span>{statusConfig.label}</span>
          </div>

          {/* Overflow Menu Button */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
              title="More actions"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>

            {/* Overflow Dropdown */}
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                />
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-rn-border bg-[#222222] py-1 shadow-2xl animate-in fade-in zoom-in-95 text-xs select-none"
                >
                  <button
                    type="button"
                    onClick={() => {
                      openJobDrawer(job.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rn-text hover:bg-rn-subpanel"
                  >
                    <Sliders className="h-3.5 w-3.5 text-rn-accent" />
                    <span>Edit Settings...</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      duplicateJob(job.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rn-text hover:bg-rn-subpanel"
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
                    className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rn-text hover:bg-rn-subpanel"
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
                    className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rn-text hover:bg-rn-subpanel"
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
                    className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rn-text hover:bg-rn-subpanel"
                  >
                    <Copy className="h-3.5 w-3.5 text-rn-accent" />
                    <span>Copy Overrides</span>
                  </button>

                  {copiedOverrides && (
                    <button
                      type="button"
                      onClick={() => {
                        pasteOverrides([job.id]);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rn-text hover:bg-rn-subpanel"
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
                    className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rn-text hover:bg-rn-subpanel"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Pre-flight Check</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      openInBlender(job.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rn-text hover:bg-rn-subpanel"
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
                    className="flex w-full items-center space-x-2 px-3 py-1.5 text-left text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                    <span>Remove Job</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* Line 2: Compact summary string & Status Chips                 */}
      {/* ============================================================== */}
      <div className="flex items-center justify-between min-w-0 w-full mt-0.5 text-[11px] text-rn-muted">
        {/* Effective Settings Summary String */}
        <span
          className="font-mono text-rn-muted truncate flex-1 min-w-0 pr-3 hover:text-neutral-300 transition-colors"
          title={`${summaryString}\nOutput: ${job.outputPathPattern}`}
        >
          {summaryString}
        </span>

        {/* Right Details: Overrides status & Active Device */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {/* Active Device Badge (ONLY shown when rendering) */}
          {activeDeviceText && (
            <span
              className="rounded bg-rn-subpanel px-1.5 py-0.2 text-[10px] font-mono text-rn-muted"
              title="Active hardware device"
            >
              {activeDeviceText}
            </span>
          )}

          {/* Overrides badge: "N modified" vs "File defaults" */}
          {overrideCount > 0 ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                openJobDrawer(job.id);
              }}
              className="rounded bg-rn-accent/20 border border-rn-accent/40 px-1.5 py-0.2 text-[10px] font-mono text-rn-accent font-medium cursor-pointer hover:bg-rn-accent/30"
              title={`${overrideCount} settings overridden from file defaults. Click to edit.`}
            >
              {overrideCount} modified
            </span>
          ) : (
            <span className="text-[10px] text-rn-muted/70 italic">File defaults</span>
          )}
        </div>
      </div>

      {/* Context Menu (Right Click) */}
      {contextMenuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenuPos(null)} />
          <div
            style={{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }}
            className="fixed z-50 w-48 rounded border border-rn-border bg-[#222222] py-1 shadow-2xl text-xs select-none"
            onClick={() => setContextMenuPos(null)}
          >
            <button
              type="button"
              onClick={() => openJobDrawer(job.id)}
              className="flex w-full items-center space-x-2 px-3 py-1.5 text-rn-text hover:bg-rn-subpanel"
            >
              <Pencil className="h-3.5 w-3.5 text-rn-accent" />
              <span>Edit Settings</span>
            </button>
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
        </>
      )}

      {/* ============================================================== */}
      {/* Bottom Edge: Integrated 2px Progress Bar (Rendering state)     */}
      {/* ============================================================== */}
      {job.status === 'Rendering' && (
        <div className="absolute left-0 bottom-0 right-0 h-0.5 bg-rn-border overflow-hidden pointer-events-none">
          <div
            className="h-full bg-rn-rendering transition-all duration-150 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
};
