import { useQueueStore } from '../store/queueStore';
import { toFileUrl } from '../utils/url';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Film,
  FolderOpen,
  Gauge,
  Moon,
  Play,
  Search,
  Terminal,
  Timer,
  Trash2,
} from 'lucide-react';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const MonitorDock: React.FC = () => {
  const {
    jobs,
    activeJobId,
    logs,
    clearLogs,
    monitorStats,
    isMonitorCollapsed,
    toggleMonitorCollapsed,
    monitorTab,
    setMonitorTab,
    recentFrameTimes,
    setActiveTab,
    queueState,
    loadSequenceFromPath,
    scheduleConfig,
    setShowScheduleModal,
  } = useQueueStore();

  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setThumbFailed(false);
  }, [monitorStats.lastThumbnailPath]);

  const activeJob = jobs.find((j) => j.id === activeJobId);
  const isRunning = queueState === 'running';
  const isPaused = queueState === 'paused';
  const isBusy = isRunning || isPaused || !!activeJob;

  const enabledCount = jobs.filter((j) => j.enabled).length;

  // Auto-scroll console when new logs arrive
  useEffect(() => {
    if (autoScroll && monitorTab === 'console') {
      consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, monitorTab]);

  // Handle Copy Console
  const handleCopyLogs = () => {
    const text = logs.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter console logs
  const filteredLogs = useMemo(() => {
    if (!filterText.trim()) return logs;
    const q = filterText.toLowerCase();
    return logs.filter((l) => l.toLowerCase().includes(q));
  }, [logs, filterText]);

  // Derived metrics
  const currentFrame = monitorStats.currentFrame;
  const totalFrames = monitorStats.totalFrames;
  const sampleCurrent = monitorStats.sampleCurrent;
  const sampleTotal = monitorStats.sampleTotal;
  const elapsed = monitorStats.elapsedSeconds;
  const eta = monitorStats.etaSeconds;
  const peakMem = monitorStats.peakMemory;
  const overallPct = monitorStats.overallProgress;

  const deviceBadge = useMemo(() => {
    if (activeJob?.deviceReport) {
      const firstDev = activeJob.deviceReport.devices[0];
      const devName =
        (typeof firstDev === 'object' && firstDev ? firstDev.name : String(firstDev || '')) || '';
      const dev = devName.replace('NVIDIA GeForce ', '').replace('NVIDIA ', '');
      return `${activeJob.deviceReport.mode} · ${dev} · ${activeJob.deviceReport.computeDeviceType}`;
    }
    return 'GPU / CPU';
  }, [activeJob]);

  // Sparkline SVG calculation - ONLY when real data exists
  const hasRealTimes = recentFrameTimes && recentFrameTimes.length > 0;
  const sparklineData = useMemo(() => {
    if (!hasRealTimes) {
      return { points: '', lastVal: '--', min: '--', max: '--' };
    }
    const times = recentFrameTimes;
    const max = Math.max(...times);
    const min = Math.min(...times);
    const range = max - min || 1;
    const width = 120;
    const height = 36;
    const stepX = width / Math.max(1, times.length - 1);

    const points = times.map((val, idx) => {
      const x = idx * stepX;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const lastVal = times[times.length - 1];
    return {
      points: points.join(' '),
      lastVal: lastVal ? `${lastVal.toFixed(1)}s` : '--',
      min: `${min.toFixed(1)}s`,
      max: `${max.toFixed(1)}s`,
    };
  }, [hasRealTimes, recentFrameTimes]);

  // ==================================================================
  // 1. When Idle and Collapsed: Thin 26px Status Bar
  // ==================================================================
  if (!isBusy && isMonitorCollapsed) {
    return (
      <footer className="flex h-6 flex-shrink-0 items-center justify-between border-t border-rn-border bg-[#0f0f10] px-3 text-xs select-none z-20">
        <div className="flex items-center space-x-2 text-[11px] text-rn-muted tabular-nums">
          {jobs.length > 0 ? (
            <>
              <span className="font-semibold text-rn-text">Ready</span>
              <span>·</span>
              <span>
                {jobs.length} job{jobs.length === 1 ? '' : 's'} ({enabledCount} enabled)
              </span>
            </>
          ) : (
            <span className="text-rn-muted">Queue empty</span>
          )}

          {scheduleConfig.enabled && (
            <>
              <span>·</span>
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="flex items-center space-x-1 text-rn-accent hover:underline font-mono"
                title="Active schedule armed. Click to view or edit."
              >
                <Timer className="h-3 w-3" />
                <span>
                  Schedule: {scheduleConfig.startImmediately ? 'Immediate' : scheduleConfig.time}
                  {scheduleConfig.stopEnabled ? ` → ${scheduleConfig.stopTime}` : ''}
                </span>
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={toggleMonitorCollapsed}
          className="flex items-center space-x-1 rounded px-1.5 py-0.5 text-[10px] text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
          title="Open Console & Logs"
        >
          <span>Logs</span>
          <ChevronUp className="h-3 w-3" />
        </button>
      </footer>
    );
  }

  // ==================================================================
  // 2. When Running and Collapsed: Slim 28px Live Progress Bar
  // ==================================================================
  if (isBusy && isMonitorCollapsed) {
    return (
      <footer className="flex h-7 flex-shrink-0 items-center justify-between border-t border-rn-border bg-[#0f0f10] px-3 text-xs select-none z-20">
        <div className="flex items-center space-x-3 text-rn-muted tabular-nums">
          <span className="font-mono text-rn-text font-semibold truncate max-w-xs">
            {activeJob ? activeJob.fileName : 'Rendering...'}
          </span>
          {currentFrame !== null && totalFrames !== null && (
            <span className="font-mono text-[11px] text-rn-text/80">
              Frame {currentFrame}/{totalFrames}
            </span>
          )}
          {eta !== null && (
            <span className="font-mono text-[11px] text-rn-muted">ETA: {formatTime(eta)}</span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Sleep Blocked Indicator */}
          {isRunning && (
            <div
              className="flex h-5 items-center space-x-1.5 rounded border border-rn-success/30 bg-rn-success/10 px-2 text-[10px] font-medium text-rn-success"
              title="System sleep is actively prevented while rendering is in progress"
            >
              <Moon className="h-2.5 w-2.5" />
              <span>Sleep Blocked</span>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <div className="h-1.5 w-24 rounded-full bg-rn-input overflow-hidden">
              <div
                className="h-full w-full bg-rn-accent origin-left transition-transform duration-200 ease-out"
                style={{ transform: `scaleX(${Math.max(0, Math.min(100, overallPct)) / 100})` }}
              />
            </div>
            <span className="font-mono font-semibold tabular-nums text-[11px] text-rn-text">
              {overallPct}%
            </span>
          </div>

          <button
            type="button"
            onClick={toggleMonitorCollapsed}
            className="flex items-center space-x-1 rounded p-1 text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Expand Monitor Dock"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    );
  }

  // ==================================================================
  // 3. Expanded Full Dock (Header Tabs + Dock Body)
  // ==================================================================
  return (
    <footer className="flex h-48 flex-shrink-0 flex-col border-t border-rn-border bg-rn-bg select-none z-20">
      {/* Dock Tabs Header */}
      <div className="flex h-8 items-center justify-between border-b border-rn-border bg-[#0f0f10] px-2">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setMonitorTab('monitor')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition ${
              monitorTab === 'monitor'
                ? 'bg-rn-panel text-rn-text border border-rn-border/70'
                : 'text-rn-muted hover:text-rn-text'
            }`}
          >
            <Gauge className="h-3.5 w-3.5 text-rn-accent" />
            <span>Monitor</span>
          </button>

          <button
            type="button"
            onClick={() => setMonitorTab('console')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition ${
              monitorTab === 'console'
                ? 'bg-rn-panel text-rn-text border border-rn-border/70'
                : 'text-rn-muted hover:text-rn-text'
            }`}
          >
            <Terminal className="h-3.5 w-3.5 text-rn-accent" />
            <span>Console</span>
            {logs.some((l) => l.toLowerCase().includes('error')) && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-rn-error" title="Errors logged" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMonitorTab('log')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition ${
              monitorTab === 'log'
                ? 'bg-rn-panel text-rn-text border border-rn-border/70'
                : 'text-rn-muted hover:text-rn-text'
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-rn-muted" />
            <span>Overrides & Events</span>
          </button>
        </div>

        {/* Right dock actions */}
        <div className="flex items-center space-x-2">
          {/* Sleep Blocked Status */}
          {isRunning && (
            <div
              className="flex h-5 items-center space-x-1.5 rounded border border-rn-success/30 bg-rn-success/10 px-2 text-[10px] font-medium text-rn-success"
              title="System sleep is actively prevented while rendering is in progress"
            >
              <Moon className="h-2.5 w-2.5" />
              <span>Sleep Blocked</span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleMonitorCollapsed}
            className="flex h-6 w-6 items-center justify-center rounded text-rn-muted hover:bg-rn-subpanel hover:text-rn-text transition"
            title="Collapse dock"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* Tab 1: Monitor Tab                                             */}
      {/* ============================================================== */}
      {monitorTab === 'monitor' && (
        <div className="flex flex-1 overflow-hidden p-3 space-x-4 bg-rn-bg">
          {isBusy ? (
            <>
              {/* Left: Overall Queue Progress & Metrics */}
              <div className="flex flex-1 flex-col justify-between min-w-0 pr-2">
                <div>
                  <div className="flex items-center justify-between text-xs text-rn-text mb-1.5">
                    <div className="flex items-center space-x-2 truncate">
                      <span className="font-semibold text-rn-text truncate">
                        {activeJob ? activeJob.fileName : 'Rendering...'}
                      </span>
                      <span className="rounded bg-rn-subpanel px-2 py-0.5 text-[10px] font-mono text-rn-muted">
                        {deviceBadge}
                      </span>
                    </div>

                    <span className="font-mono font-semibold tabular-nums text-sm text-rn-accent">
                      {overallPct}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 w-full rounded-full bg-rn-input overflow-hidden">
                    <div
                      className="h-full w-full bg-rn-accent origin-left transition-transform duration-300 ease-out"
                      style={{
                        transform: `scaleX(${Math.max(0, Math.min(100, overallPct)) / 100})`,
                      }}
                    />
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-2 border-t border-rn-border/60 pt-2 text-[11px] font-mono tabular-nums">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-sans text-rn-muted">Frame</span>
                    <span className="text-rn-text font-semibold">
                      {currentFrame !== null && totalFrames !== null
                        ? `${currentFrame} / ${totalFrames}`
                        : '--'}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[10px] font-sans text-rn-muted">Samples</span>
                    <span className="text-rn-text font-semibold">
                      {sampleCurrent !== null && sampleTotal !== null
                        ? `${sampleCurrent} / ${sampleTotal}`
                        : '--'}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[10px] font-sans text-rn-muted">Elapsed / ETA</span>
                    <span className="text-rn-text font-semibold">
                      {formatTime(elapsed)} / {eta !== null ? formatTime(eta) : '--'}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[10px] font-sans text-rn-muted">Peak Memory</span>
                    <span className="text-rn-accent font-semibold">{peakMem || '--'}</span>
                  </div>
                </div>
              </div>

              {/* Centre: Larger Preview of Last Finished Frame */}
              <div
                onClick={async () => {
                  const targetPath =
                    monitorStats.lastThumbnailPath ||
                    activeJob?.outputPreview ||
                    activeJob?.outputPathPattern;
                  if (targetPath) {
                    await loadSequenceFromPath(targetPath, activeJob?.filePath);
                  } else {
                    setActiveTab('sequences');
                  }
                }}
                className="group relative flex h-full w-48 flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-rn-border bg-rn-panel overflow-hidden hover:border-rn-accent transition-colors"
                title="Click to open Sequence Viewer"
              >
                {monitorStats.lastThumbnailPath && !thumbFailed ? (
                  <img
                    src={toFileUrl(monitorStats.lastThumbnailPath)}
                    alt="Last Rendered Frame"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    onError={() => setThumbFailed(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center text-rn-muted p-2 text-center">
                    <Film className="h-7 w-7 stroke-[1.3] mb-1 text-rn-accent" />
                    <span className="text-[10px] font-medium text-rn-text/80">
                      Last Rendered Frame
                    </span>
                    <span className="text-[9px] text-rn-muted">Click to view sequence</span>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-0.5 text-center text-[9px] font-mono text-rn-text opacity-0 group-hover:opacity-100 transition-opacity">
                  Open Sequence Viewer
                </div>
              </div>

              {/* Right: Sparkline of Recent Frame Times (NO fake numbers) */}
              <div className="flex h-full w-40 flex-shrink-0 flex-col justify-between rounded-lg border border-rn-border bg-rn-panel p-2.5">
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-rn-muted">
                  <span>Frame Times</span>
                  <span className="font-semibold text-rn-accent">{sparklineData.lastVal}</span>
                </div>

                {hasRealTimes ? (
                  <div className="flex h-10 w-full items-center justify-center overflow-hidden">
                    <svg className="h-full w-full overflow-visible" viewBox="0 0 120 36">
                      <polyline
                        fill="none"
                        stroke="#e87d0d"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={sparklineData.points}
                      />
                    </svg>
                  </div>
                ) : (
                  <div className="flex h-10 w-full items-center justify-center text-[10px] text-rn-muted/60 text-center">
                    No timings yet
                  </div>
                )}

                <div className="flex items-center justify-between text-[9px] font-mono tabular-nums text-rn-muted/80 border-t border-rn-border/50 pt-1">
                  <span>Min: {sparklineData.min}</span>
                  <span>Max: {sparklineData.max}</span>
                </div>
              </div>
            </>
          ) : monitorStats.lastThumbnailPath ||
            (monitorStats.totalFrames !== null &&
              monitorStats.totalFrames > 0 &&
              monitorStats.currentFrame !== null) ? (
            /* Idle but with Completed Render Output: Persistent preview and 1-click actions */
            <>
              {/* Left: Completed Render Summary & Actions */}
              <div className="flex flex-1 flex-col justify-between min-w-0 pr-2">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="flex items-center space-x-1 rounded bg-rn-success/15 border border-rn-success/30 px-2 py-0.5 text-[11px] font-medium text-rn-success">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Render Complete</span>
                    </span>
                    <span className="font-mono text-xs font-semibold text-rn-text truncate">
                      {(jobs.find((j) => j.status === 'Completed') ?? jobs[0])?.fileName ??
                        'Output ready'}
                    </span>
                  </div>

                  <p className="text-[11px] text-rn-muted truncate">
                    Output saved and verified. Open the player to scrub or play the full sequence.
                  </p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-4 gap-2 border-t border-rn-border/60 pt-2 text-[11px] font-mono tabular-nums">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-sans text-rn-muted">Frame</span>
                    <span className="text-rn-text font-semibold">
                      {currentFrame ?? totalFrames ?? 1} / {totalFrames ?? 1}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[10px] font-sans text-rn-muted">Samples</span>
                    <span className="text-rn-text font-semibold">
                      {sampleCurrent !== null
                        ? `${sampleCurrent}/${sampleTotal ?? sampleCurrent}`
                        : 'Done'}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[10px] font-sans text-rn-muted">Duration</span>
                    <span className="text-rn-text font-semibold">{formatTime(elapsed)}</span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[10px] font-sans text-rn-muted">Peak Memory</span>
                    <span className="text-rn-accent font-semibold">{peakMem || '--'}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const targetJob = jobs.find((j) => j.status === 'Completed') ?? jobs[0];
                      const targetPath =
                        monitorStats.lastThumbnailPath ||
                        targetJob?.outputPreview ||
                        targetJob?.outputPathPattern;
                      if (targetPath) {
                        await loadSequenceFromPath(targetPath, targetJob?.filePath);
                      } else {
                        setActiveTab('sequences');
                      }
                    }}
                    className="flex items-center space-x-1.5 rounded-md bg-rn-accent px-3 py-1 text-xs font-semibold text-[#0f0f10] hover:brightness-110 active:brightness-95 transition shadow-sm"
                    title="Open sequence player"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Play Sequence</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const targetJob = jobs.find((j) => j.status === 'Completed') ?? jobs[0];
                      const targetPath =
                        monitorStats.lastThumbnailPath ||
                        targetJob?.outputPreview ||
                        targetJob?.outputPathPattern ||
                        '';
                      if (window.rnApi && (targetPath || targetJob?.filePath)) {
                        await window.rnApi.openPath(targetPath, targetJob?.filePath);
                      }
                    }}
                    className="flex items-center space-x-1.5 rounded-md border border-rn-border bg-rn-panel px-3 py-1 text-xs text-rn-text hover:bg-rn-subpanel transition"
                    title="Open rendered output folder"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-rn-muted" />
                    <span>Open Folder</span>
                  </button>
                </div>
              </div>

              {/* Centre: Rendered Frame Thumbnail */}
              <div
                onClick={async () => {
                  const targetJob = jobs.find((j) => j.status === 'Completed') ?? jobs[0];
                  const targetPath =
                    monitorStats.lastThumbnailPath ||
                    targetJob?.outputPreview ||
                    targetJob?.outputPathPattern;
                  if (targetPath) {
                    await loadSequenceFromPath(targetPath, targetJob?.filePath);
                  } else {
                    setActiveTab('sequences');
                  }
                }}
                className="group relative flex h-full w-48 flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-rn-border bg-rn-panel overflow-hidden hover:border-rn-accent transition-colors"
                title="Click to open Sequence Viewer"
              >
                {monitorStats.lastThumbnailPath && !thumbFailed ? (
                  <img
                    src={toFileUrl(monitorStats.lastThumbnailPath)}
                    alt="Last Rendered Frame"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    onError={() => setThumbFailed(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center text-rn-muted p-2 text-center">
                    <Film className="h-7 w-7 stroke-[1.3] mb-1 text-rn-accent" />
                    <span className="text-[10px] font-medium text-rn-text/80">
                      Last Rendered Frame
                    </span>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-0.5 text-center text-[9px] font-mono text-rn-text opacity-0 group-hover:opacity-100 transition-opacity">
                  Click to Play
                </div>
              </div>

              {/* Right: Timing Summary */}
              <div className="flex h-full w-40 flex-shrink-0 flex-col justify-between rounded-lg border border-rn-border bg-rn-panel p-2.5">
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-rn-muted">
                  <span>Frame Times</span>
                  <span className="font-semibold text-rn-accent">{sparklineData.lastVal}</span>
                </div>

                {hasRealTimes ? (
                  <div className="flex h-10 w-full items-center justify-center overflow-hidden">
                    <svg className="h-full w-full overflow-visible" viewBox="0 0 120 36">
                      <polyline
                        fill="none"
                        stroke="#e87d0d"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={sparklineData.points}
                      />
                    </svg>
                  </div>
                ) : (
                  <div className="flex h-10 w-full items-center justify-center text-[10px] text-rn-muted/60 text-center">
                    {sparklineData.lastVal !== '--'
                      ? `Last: ${sparklineData.lastVal}`
                      : 'Single frame'}
                  </div>
                )}

                <div className="flex items-center justify-between text-[9px] font-mono tabular-nums text-rn-muted/80 border-t border-rn-border/50 pt-1">
                  <span>Min: {sparklineData.min}</span>
                  <span>Max: {sparklineData.max}</span>
                </div>
              </div>
            </>
          ) : (
            /* Clean Idle State in Monitor Tab (Initial launch, zero renders yet) */
            <div className="flex flex-1 flex-col items-center justify-center text-center text-rn-muted space-y-1">
              <p className="text-xs font-medium text-rn-text/90">
                Queue is idle · Press{' '}
                <strong className="text-rn-accent font-semibold">Start Queue</strong> to begin batch
                rendering
              </p>
              <p className="text-[11px] text-rn-muted">
                Real-time frame timings, peak memory, and thumbnail preview will appear here while
                rendering.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* Tab 2: Console Tab                                             */}
      {/* ============================================================== */}
      {monitorTab === 'console' && (
        <div className="flex flex-1 flex-col overflow-hidden bg-rn-input">
          {/* Console Toolbar */}
          <div className="flex h-7 items-center justify-between border-b border-rn-border bg-rn-panel px-3 text-xs">
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 rounded bg-rn-bg px-2 py-0.5 border border-rn-border">
                <Search className="h-3 w-3 text-rn-muted" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter console"
                  className="bg-transparent text-xs text-rn-text placeholder-rn-muted focus:outline-none w-36"
                />
              </div>

              <label className="flex items-center space-x-1.5 text-[11px] text-rn-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="h-3 w-3 rounded border-rn-border bg-rn-input text-rn-accent focus:ring-0"
                />
                <span>Auto-scroll</span>
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleCopyLogs}
                className="flex items-center space-x-1 rounded bg-rn-panel px-2 py-0.5 text-[11px] text-rn-text hover:bg-rn-subpanel transition border border-rn-border"
                title="Copy all logs to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 text-rn-muted" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={clearLogs}
                className="flex items-center space-x-1 rounded bg-rn-panel px-2 py-0.5 text-[11px] text-rn-muted hover:text-rose-400 hover:bg-rn-subpanel transition border border-rn-border"
                title="Clear console buffer"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Console Output Area */}
          <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed text-neutral-300 space-y-0.5 select-text">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((line, idx) => {
                const isError =
                  line.toLowerCase().includes('error') ||
                  line.includes('Traceback') ||
                  line.includes('Failed');
                const isWarn = line.toLowerCase().includes('warn');
                const isInfo = line.includes('[System]') || line.includes('RN_EVENT');
                return (
                  <div
                    key={idx}
                    className={`whitespace-pre-wrap break-all ${
                      isError
                        ? 'text-rn-error font-semibold bg-rn-error/10 px-1 rounded'
                        : isWarn
                          ? 'text-rn-warning'
                          : isInfo
                            ? 'text-rn-accent/90'
                            : 'text-rn-text/85'
                    }`}
                  >
                    {line}
                  </div>
                );
              })
            ) : (
              <div className="text-rn-muted p-2">
                {filterText ? 'No log lines matching filter.' : 'Console buffer empty.'}
              </div>
            )}
            <div ref={consoleBottomRef} />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Tab 3: Overrides & Events Log Tab                              */}
      {/* ============================================================== */}
      {monitorTab === 'log' && (
        <div className="flex flex-1 flex-col overflow-y-auto p-3 font-mono text-xs bg-rn-input space-y-2 select-text">
          <div className="text-[11px] font-sans font-medium text-rn-muted mb-1">
            Active Job Override Audit & Device Telemetry
          </div>

          {activeJob ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-rn-border bg-rn-panel p-2.5">
                <span className="font-semibold text-rn-text block mb-1">Applied RNA Overrides</span>
                {activeJob.overridesReport && activeJob.overridesReport.applied.length > 0 ? (
                  <ul className="list-disc pl-4 space-y-0.5 text-rn-success text-[11px]">
                    {activeJob.overridesReport.applied.map((p, i) => {
                      const rnaPath =
                        typeof p === 'object' && p !== null && 'rnaPath' in p
                          ? (p as { rnaPath: string }).rnaPath
                          : String(p);
                      return <li key={i}>{rnaPath}</li>;
                    })}
                  </ul>
                ) : (
                  <span className="text-rn-muted text-[11px]">
                    No custom overrides applied (rendering with file defaults).
                  </span>
                )}
              </div>

              {activeJob.overridesReport && activeJob.overridesReport.skipped.length > 0 && (
                <div className="rounded-lg border border-rn-warning/30 bg-rn-warning/10 p-2.5">
                  <span className="font-semibold text-rn-warning block mb-1">
                    Skipped Overrides
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-rn-accent text-[11px]">
                    {activeJob.overridesReport.skipped.map((s, i) => (
                      <li key={i}>
                        <strong>{s.rnaPath}</strong>: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-rn-muted text-xs py-4 text-center">
              No active job running. Telemetry reports appear during render execution.
            </div>
          )}
        </div>
      )}
    </footer>
  );
};
